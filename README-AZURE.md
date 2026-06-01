# PasokanAI — Panduan Integrasi Azure

Dokumen ini menjelaskan langkah-langkah setup semua layanan Azure yang diperlukan agar PasokanAI V2 berjalan penuh di production.

---

## Arsitektur Lengkap

```
React (Vite)
    ↓ HTTPS
Azure Static Web Apps  ←→  Azure Functions (Python)
                                ↓              ↓              ↓
                          Supabase DB    Azure OpenAI    Azure ML
                                                          (Prophet)
                                ↓
                          Open-Meteo API (weather)
                          Azure Speech Services (voice)
                          Application Insights (monitoring)
```

---

## 1. Azure Static Web Apps — Frontend Hosting

**Resource:** `pasokanai-dev-web`

### Buat resource:
```bash
az staticwebapp create \
  --name pasokanai-dev-web \
  --resource-group pasokanai-dev-rg \
  --source https://github.com/<your-org>/pasokanai-mvp \
  --branch hamzah-development \
  --app-location "/frontend" \
  --output-location "dist" \
  --api-location "/api"
```

### App Settings (GitHub Actions Secrets):
| Secret Name | Value |
|-------------|-------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN_POLITE_HILL_0063F5500` | Token dari Azure Portal |
| `VITE_SUPABASE_URL` | `https://xbplmgonhykmupgidrcn.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Anon key dari Supabase Dashboard |

> **Cara set:** GitHub repo → Settings → Secrets and variables → Actions → New repository secret

---

## 2. Azure Functions — Backend API

**Resource:** `pasokanai-dev-api`

### Buat resource:
```bash
az functionapp create \
  --name pasokanai-dev-api \
  --resource-group pasokanai-dev-rg \
  --storage-account pasokanaistorage \
  --consumption-plan-location southeastasia \
  --runtime python \
  --runtime-version 3.11 \
  --functions-version 4
```

### Application Settings (wajib):
```bash
az functionapp config appsettings set \
  --name pasokanai-dev-api \
  --resource-group pasokanai-dev-rg \
  --settings \
    SUPABASE_URL="https://xbplmgonhykmupgidrcn.supabase.co" \
    SUPABASE_SERVICE_KEY="<service-role-key>" \
    OPENAI_API_KEY="<azure-openai-key>" \
    OPENAI_MODEL="gpt-4o-mini" \
    APPLICATIONINSIGHTS_CONNECTION_STRING="<connection-string>"
```

### Deploy:
```bash
cd api
func azure functionapp publish pasokanai-dev-api --python
```

### Endpoints yang tersedia:
| Endpoint | Method | Fungsi |
|----------|--------|--------|
| `/api/gap-check` | POST | Gap alert + negotiation anchor |
| `/api/collect-weather` | POST | Manual trigger Open-Meteo collection |
| `/api/scrape-prices` | POST | Scrape harga dari Bapanas (Playwright) |

### Timer Trigger (auto):
- `weather_collector` — jalan tiap tanggal 1 jam 05:05 WIB

### Install Playwright di Azure Functions:
```bash
# Tambahkan ke startup command di Azure Portal
playwright install chromium --with-deps
```

---

## 3. Azure OpenAI — GPT-4o-mini

**Resource:** `pasokanai-dev-openai`

### Buat resource:
```bash
az cognitiveservices account create \
  --name pasokanai-dev-openai \
  --resource-group pasokanai-dev-rg \
  --kind OpenAI \
  --sku S0 \
  --location eastus
```

### Deploy model:
```bash
az cognitiveservices account deployment create \
  --name pasokanai-dev-openai \
  --resource-group pasokanai-dev-rg \
  --deployment-name gpt-4o-mini \
  --model-name gpt-4o-mini \
  --model-version "2024-07-18" \
  --model-format OpenAI \
  --sku-name Standard \
  --sku-capacity 10
```

### Cara pakai di function_app.py:
```python
from openai import AzureOpenAI

client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_key=os.getenv("AZURE_OPENAI_KEY"),
    api_version="2024-02-01"
)
```

### Environment variables tambahan:
```
AZURE_OPENAI_ENDPOINT=https://<resource-name>.openai.azure.com/
AZURE_OPENAI_KEY=<key>
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
```

> **Catatan saat ini:** `function_app.py` menggunakan `openai` library standar (bukan Azure endpoint). Ganti `client = OpenAI(...)` dengan `client = AzureOpenAI(...)` saat sudah ada Azure OpenAI resource.

---

## 4. Azure Machine Learning — Prophet Forecasting

**Resource:** `pasokanai-dev-ml`

### Buat workspace:
```bash
az ml workspace create \
  --name pasokanai-dev-ml \
  --resource-group pasokanai-dev-rg \
  --location southeastasia
```

### Alur forecasting dengan Prophet:

```
commodity_prices (Supabase)
        ↓
  Azure ML Pipeline
        ↓ (training)
  Prophet model (30d + 90d forecast)
        ↓ (output)
  forecast_results (Supabase)
        ↓
  Azure OpenAI (interpret forecast)
        ↓
  recommendations (Supabase)
```

### Contoh pipeline script (`ml/forecast_pipeline.py`):
```python
from prophet import Prophet
import pandas as pd
from supabase import create_client

# 1. Ambil data historis dari Supabase
sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
prices = sb.table("commodity_prices").select("*").eq("district_id", district_id).eq("commodity", commodity).execute()

df = pd.DataFrame(prices.data)
df = df.rename(columns={"price_date": "ds", "price": "y"})
df["ds"] = pd.to_datetime(df["ds"])

# 2. Training Prophet
model = Prophet(seasonality_mode="multiplicative", yearly_seasonality=True, weekly_seasonality=False)
model.fit(df)

# 3. Forecast 90 hari
future = model.make_future_dataframe(periods=90)
forecast = model.predict(future)

# 4. Simpan ke Supabase
forecasts = [
    {
        "district_id": district_id,
        "commodity": commodity,
        "forecast_price": float(row["yhat"]),
        "confidence": float(min(100, max(0, (1 - abs(row["yhat_upper"] - row["yhat_lower"]) / (2 * row["yhat"])) * 100))),
        "forecast_date": row["ds"].strftime("%Y-%m-%d"),
    }
    for _, row in forecast.tail(90).iterrows()
]
sb.table("forecast_results").insert(forecasts).execute()
```

### Setup Azure ML compute:
```bash
az ml compute create \
  --name forecasting-cluster \
  --type AmlCompute \
  --min-instances 0 \
  --max-instances 2 \
  --size Standard_DS2_v2 \
  --workspace-name pasokanai-dev-ml \
  --resource-group pasokanai-dev-rg
```

### Jadwal forecasting bulanan (Azure ML Schedule):
```yaml
# ml/forecast_schedule.yml
name: monthly-forecast
trigger:
  type: recurrence
  frequency: month
  interval: 1
  start_time: "2026-07-01T02:00:00"
```

---

## 5. Azure Speech Services — Voice Input

**Resource:** `pasokanai-dev-speech`

### Buat resource:
```bash
az cognitiveservices account create \
  --name pasokanai-dev-speech \
  --resource-group pasokanai-dev-rg \
  --kind SpeechServices \
  --sku S0 \
  --location southeastasia
```

### Integrasi di frontend (React):
```typescript
// Aktifkan tombol voice di Step1.tsx setelah Speech Services siap
const SPEECH_KEY = import.meta.env.VITE_AZURE_SPEECH_KEY
const SPEECH_REGION = import.meta.env.VITE_AZURE_SPEECH_REGION

async function startVoiceInput() {
  const sdk = await import('microsoft-cognitiveservices-speech-sdk')
  const config = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION)
  config.speechRecognitionLanguage = "id-ID"  // Bahasa Indonesia
  const recognizer = new sdk.SpeechRecognizer(config)

  recognizer.recognizeOnceAsync(result => {
    const text = result.text  // e.g. "lahan satu hektare di Sleman"
    // Parse text to extract kabupaten + luas
    parseVoiceInput(text)
  })
}
```

### Environment variables:
```
VITE_AZURE_SPEECH_KEY=<key>
VITE_AZURE_SPEECH_REGION=southeastasia
```

---

## 6. Application Insights — Monitoring

**Resource:** Sudah dikonfigurasi di `function_app.py`

### Buat resource:
```bash
az monitor app-insights component create \
  --app pasokanai-insights \
  --location southeastasia \
  --resource-group pasokanai-dev-rg \
  --application-type web
```

### Get connection string:
```bash
az monitor app-insights component show \
  --app pasokanai-insights \
  --resource-group pasokanai-dev-rg \
  --query connectionString -o tsv
```

### Tambahkan ke Function App settings:
```bash
APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=...;..."
```

---

## 7. Checklist Deployment MVP

### Phase 0 ✅ (Sudah selesai)
- [x] Branch `hamzah-development` dibuat
- [x] Supabase `pasokanaiDB` dikonfigurasi (9 tabel + RLS)
- [x] React + Vite + TypeScript + TailwindCSS
- [x] Leaflet + OpenStreetMap map

### Phase 1 ✅ (Sudah selesai)
- [x] Tidak ada dummy data di frontend (semua dari Supabase)
- [x] Districts, recommendations, buyers, commodity_prices, weather_data di Supabase

### Phase 2 ✅ (Sudah selesai)
- [x] Open-Meteo weather collection (`weather_collector.py`)
- [x] Data cuaca 3 bulan terakhir terseed

### Phase 3 🔄 (In Progress)
- [x] Commodity prices terseed (6 bulan historical)
- [ ] Playwright scraper Bapanas siap (butuh `playwright install chromium` di Azure Functions)
- [ ] Monthly auto-update via Timer Trigger

### Phase 4 ⏳ (Planned)
- [ ] Azure ML workspace dibuat
- [ ] Prophet model training
- [ ] Forecast results tersimpan di Supabase

### Phase 5 ⏳ (Planned)
- [ ] Azure OpenAI resource dibuat
- [ ] `function_app.py` update ke Azure OpenAI endpoint
- [ ] Recommendations di-generate dari forecast data

### Phase 6 ✅ Gap Alert (Sudah ada di frontend + API)

### Phase 7 ⏳ Market Insights (Planned)

### Phase 8 ✅ Map Dashboard (Sudah selesai — Leaflet + OpenStreetMap)

### Phase 9 🔄 Buyer Recommendation (Buyers di Supabase, map sudah tampil)

### Phase 10 ⏳ Voice (Planned — tombol sudah ada, tinggal integrasi Azure Speech)

---

## Estimasi Biaya Azure (per bulan, dev tier)

| Layanan | Tier | Estimasi |
|---------|------|----------|
| Static Web Apps | Free | $0 |
| Functions | Consumption (1M calls free) | ~$0–5 |
| OpenAI (gpt-4o-mini) | Pay-per-use | ~$2–10 |
| Azure ML | Basic compute (B-series) | ~$10–30 |
| Speech Services | S0 (5 jam/bln free) | ~$0–5 |
| Application Insights | Pay-per-use | ~$0–5 |
| **Total estimasi** | | **~$12–55/bulan** |

---

## Quick Start Lokal

```bash
# 1. Clone dan install
git clone https://github.com/<org>/pasokanai-mvp
cd pasokanai-mvp/frontend
npm install

# 2. Buat .env dari template
cp ../env.example .env
# Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY

# 3. Jalankan dev server
npm run dev

# 4. Untuk Azure Functions (lokal)
cd ../api
pip install -r requirements.txt
playwright install chromium
cp local.settings.json.example local.settings.json
# Isi SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY
func start
```
