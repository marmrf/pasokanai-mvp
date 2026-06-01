# AZURE-IMPLEMENTATION.md
# PasokanAI — Panduan Implementasi Azure Backend

Dokumen ini menjelaskan status setiap Azure service yang digunakan PasokanAI, cara mengetahui apakah service sudah terhubung atau masih fallback, dan langkah setup untuk deploy ke production.

---

## Status Layanan Saat Ini

| Layanan | Status | Fallback | Prioritas |
|---------|--------|----------|-----------|
| **Supabase (PostgreSQL)** | ✅ Connected | Hardcoded dict | WAJIB |
| **Open-Meteo (cuaca)** | ✅ Connected | — (gratis, no key) | WAJIB |
| **Azure Functions** | ✅ Deployed | localhost:7071 | WAJIB |
| **Azure OpenAI (GPT-4o-mini)** | ⚠️ Fallback Mode | Template response | SEGERA |
| **Azure ML (Prophet)** | 🔄 Planned | Tidak ada forecast | SELANJUTNYA |
| **Azure Speech Services** | 🔄 Planned | Tombol disembunyikan | FASE 10 |
| **Application Insights** | ⚠️ Optional | logging biasa | MONITORING |

> **Cara melihat status runtime:** Buka dev server → banner kuning di atas halaman menampilkan status real-time setiap service.

---

## Cara Kerja Fallback System

Saat Azure service belum dikonfigurasi, aplikasi tetap berjalan dengan graceful degradation:

```
                    ┌─────────────────────────────┐
Request gap-check   │   Azure Function             │
──────────────────► │                              │
                    │  1. Try Supabase prices  ─── │──► ✅ Real data
                    │     (SUPABASE_SERVICE_KEY)   │
                    │     ↓ if fails               │
                    │  2. Use HARGA_ACUAN_FALLBACK ─│──► ⚠️ Dummy data
                    │                              │
                    │  3. Try Azure OpenAI     ─── │──► ✅ AI negotiation
                    │     (OPENAI_API_KEY)          │
                    │     ↓ if fails               │
                    │  4. Use template response ─── │──► ⚠️ Template text
                    │                              │
                    │  5. Return _meta {           │
                    │       prices_source: "...",  │
                    │       ai_anchor: true/false  │
                    │     }                        │
                    └─────────────────────────────┘
```

Response `_meta` dari API memudahkan debugging:
```json
{
  "_meta": {
    "prices_source": "supabase",
    "buyers_source": "fallback",
    "ai_anchor": false,
    "supabase_connected": true,
    "openai_configured": false
  }
}
```

---

## 1. Azure Functions — Backend API

**Resource:** `pasokanai-dev-api`  
**Status:** ✅ Deployed — 3 endpoints aktif

### Endpoints

| Endpoint | Method | Status | Deskripsi |
|----------|--------|--------|-----------|
| `POST /api/gap-check` | POST | ✅ Live | Gap alert + negotiation anchor |
| `GET /api/service-status` | GET | ✅ Live | Status semua Azure services |
| `POST /api/collect-weather` | POST | ✅ Live | Manual trigger Open-Meteo |
| `POST /api/scrape-prices` | POST | ✅ Live | Scrape Bapanas via Playwright |
| Timer: `weather_collector` | — | ✅ Scheduled | Tiap tgl 1 jam 05:05 WIB |

### Setup lokal:
```bash
cd api
pip install -r requirements.txt
playwright install chromium

# Buat local.settings.json (tidak di-commit)
cp local.settings.json.example local.settings.json
# Isi SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY

func start
# → http://localhost:7071
```

### Deploy ke Azure:
```bash
az functionapp create \
  --name pasokanai-dev-api \
  --resource-group pasokanai-dev-rg \
  --storage-account pasokanaistorage \
  --consumption-plan-location southeastasia \
  --runtime python \
  --runtime-version 3.11 \
  --functions-version 4

az functionapp config appsettings set \
  --name pasokanai-dev-api \
  --resource-group pasokanai-dev-rg \
  --settings \
    SUPABASE_URL="https://xbplmgonhykmupgidrcn.supabase.co" \
    SUPABASE_SERVICE_KEY="<service-role-key>" \
    OPENAI_API_KEY="<key>" \
    OPENAI_MODEL="gpt-4o-mini"

func azure functionapp publish pasokanai-dev-api --python
```

---

## 2. Supabase — Database

**Project:** `pasokanaiDB`  
**Status:** ✅ Connected — 9 tabel, RLS aktif, data seeded

### Untuk open source / local dev:

```bash
# Install Supabase CLI
npm install -g supabase

# Init dan start local Supabase
cd pasokanai-mvp
supabase start

# Jalankan migrasi schema
supabase db push
# atau untuk lokal: supabase db reset (apply semua migrasi + seed)
```

Local Supabase berjalan di:
- **API:** `http://127.0.0.1:54321`
- **Studio:** `http://127.0.0.1:54323`
- **Postgres:** `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

Set di `.env`:
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local-anon-key dari output supabase start>
```

### Untuk cloud (Supabase.com):
Daftar gratis di [supabase.com](https://supabase.com), buat project baru, lalu jalankan SQL dari `supabase/migrations/001_initial_schema.sql` di SQL Editor.

---

## 3. Azure OpenAI — GPT-4o-mini

**Resource:** `pasokanai-dev-openai`  
**Status:** ⚠️ Fallback Mode — OPENAI_API_KEY belum dikonfigurasi  
**Digunakan untuk:** Negotiation anchor teks di Gap Alert

### Cara tahu apakah AI aktif:
- Cek `_meta.ai_anchor` di response `/api/gap-check`
- Buka `/api/service-status` → lihat `services.openai.connected`
- Dev banner di UI (dev mode)

### Setup di Azure:
```bash
# 1. Buat resource Azure OpenAI
az cognitiveservices account create \
  --name pasokanai-dev-openai \
  --resource-group pasokanai-dev-rg \
  --kind OpenAI \
  --sku S0 \
  --location eastus

# 2. Deploy model gpt-4o-mini
az cognitiveservices account deployment create \
  --name pasokanai-dev-openai \
  --resource-group pasokanai-dev-rg \
  --deployment-name gpt-4o-mini \
  --model-name gpt-4o-mini \
  --model-version "2024-07-18" \
  --model-format OpenAI \
  --sku-name Standard \
  --sku-capacity 10

# 3. Ambil API key
az cognitiveservices account keys list \
  --name pasokanai-dev-openai \
  --resource-group pasokanai-dev-rg \
  --query key1 -o tsv
```

### Konfigurasi di `api/local.settings.json`:
```json
{
  "OPENAI_API_KEY": "<azure-openai-key>",
  "OPENAI_MODEL": "gpt-4o-mini",
  "AZURE_OPENAI_ENDPOINT": "https://pasokanai-dev-openai.openai.azure.com/"
}
```

> **Catatan:** `function_app.py` saat ini menggunakan `openai` library standar. Untuk Azure OpenAI endpoint, ganti `OpenAI(...)` menjadi `AzureOpenAI(azure_endpoint=..., api_key=..., api_version="2024-02-01")`.

---

## 4. Azure ML — Prophet Forecasting

**Resource:** `pasokanai-dev-ml`  
**Status:** 🔄 Planned — tabel `forecast_results` siap, model belum deploy  
**Digunakan untuk:** Prediksi harga 30/90 hari berdasarkan data historis

### Flow:
```
commodity_prices (Supabase)
    ↓ ambil 6+ bulan historis
Azure ML Pipeline (Prophet)
    ↓ training + predict 30/90 hari
forecast_results (Supabase)
    ↓
Azure OpenAI (interpretasi forecast → teks)
    ↓
recommendations (Supabase)
```

### Setup workspace:
```bash
az ml workspace create \
  --name pasokanai-dev-ml \
  --resource-group pasokanai-dev-rg \
  --location southeastasia

# Buat compute cluster
az ml compute create \
  --name forecasting-cluster \
  --type AmlCompute \
  --min-instances 0 \
  --max-instances 2 \
  --size Standard_DS2_v2 \
  --workspace-name pasokanai-dev-ml \
  --resource-group pasokanai-dev-rg
```

### Pipeline script (`ml/forecast_pipeline.py`):
```python
from prophet import Prophet
import pandas as pd
from supabase import create_client

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

for district_id in district_ids:
    for commodity in commodities:
        # Ambil data historis
        prices = sb.table("commodity_prices") \
            .select("price_date, price") \
            .eq("district_id", district_id) \
            .eq("commodity", commodity) \
            .order("price_date") \
            .execute()

        df = pd.DataFrame(prices.data)
        df = df.rename(columns={"price_date": "ds", "price": "y"})
        df["ds"] = pd.to_datetime(df["ds"])

        if len(df) < 6:
            continue  # butuh minimal 6 data points

        # Training Prophet
        model = Prophet(
            seasonality_mode="multiplicative",
            yearly_seasonality=True,
            weekly_seasonality=False
        )
        model.fit(df)

        # Forecast 90 hari
        future = model.make_future_dataframe(periods=90)
        forecast = model.predict(future)

        # Simpan ke Supabase
        forecasts = [
            {
                "district_id": district_id,
                "commodity": commodity,
                "forecast_price": float(row["yhat"]),
                "confidence": float(
                    min(100, max(0,
                        (1 - abs(row["yhat_upper"] - row["yhat_lower"]) / (2 * row["yhat"])) * 100
                    ))
                ),
                "forecast_date": row["ds"].strftime("%Y-%m-%d"),
            }
            for _, row in forecast.tail(90).iterrows()
        ]
        sb.table("forecast_results").insert(forecasts).execute()
        print(f"✅ Forecast saved: {district_id} / {commodity}")
```

### Jadwal bulanan (`ml/forecast_schedule.yml`):
```yaml
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
**Status:** 🔄 Planned — tombol suara sudah ada di UI, belum aktif  
**Digunakan untuk:** Input lokasi dan lahan via suara Bahasa Indonesia

### Setup:
```bash
az cognitiveservices account create \
  --name pasokanai-dev-speech \
  --resource-group pasokanai-dev-rg \
  --kind SpeechServices \
  --sku S0 \
  --location southeastasia
```

### Integrasi frontend (`frontend/src/components/form/Step1.tsx`):
```typescript
const SPEECH_KEY = import.meta.env.VITE_AZURE_SPEECH_KEY

async function startVoiceInput() {
  if (!SPEECH_KEY) return  // belum dikonfigurasi

  const sdk = await import('microsoft-cognitiveservices-speech-sdk')
  const config = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, 'southeastasia')
  config.speechRecognitionLanguage = "id-ID"

  const recognizer = new sdk.SpeechRecognizer(config)
  recognizer.recognizeOnceAsync(result => {
    // Petani bilang: "lahan saya satu hektare di Sleman"
    // → parse: kabupaten=sleman, luas=1
    parseVoiceInput(result.text)
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

**Status:** ⚠️ Optional — kode logging sudah ada di `function_app.py`

### Setup:
```bash
az monitor app-insights component create \
  --app pasokanai-insights \
  --location southeastasia \
  --resource-group pasokanai-dev-rg \
  --application-type web

# Ambil connection string
az monitor app-insights component show \
  --app pasokanai-insights \
  --resource-group pasokanai-dev-rg \
  --query connectionString -o tsv
```

### Set di Azure Functions:
```bash
az functionapp config appsettings set \
  --name pasokanai-dev-api \
  --resource-group pasokanai-dev-rg \
  --settings \
    APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=...;..."
```

---

## Checklist Deployment MVP

### Phase 0 ✅ Setup
- [x] Branch `hamzah-development`
- [x] React + Vite + TypeScript + TailwindCSS
- [x] Supabase `pasokanaiDB` — 9 tabel + RLS
- [x] Leaflet + OpenStreetMap map

### Phase 1 ✅ Data Layer
- [x] Districts, recommendations, buyers seeded
- [x] Tidak ada hardcoded data di frontend

### Phase 2 ✅ Weather
- [x] Open-Meteo integration (`weather_collector.py`)
- [x] Timer Trigger tiap tanggal 1
- [x] 3 bulan data historis terseed

### Phase 3 🔄 Commodity Prices
- [x] 6 bulan data historis terseed
- [ ] Playwright scraper Bapanas aktif (`playwright install chromium` di Azure)
- [ ] Timer Trigger bulanan untuk update harga

### Phase 4 ⏳ Azure ML Forecasting
- [ ] Azure ML workspace dibuat
- [ ] Prophet model training pipeline
- [ ] `forecast_results` diisi data real
- [ ] Frontend menampilkan forecast dari tabel

### Phase 5 ⏳ Azure OpenAI Live
- [ ] **OPENAI_API_KEY dikonfigurasi** ← langkah pertama!
- [ ] Negotiation anchor menggunakan AI real
- [ ] Recommendations di-generate dari forecast data

### Phase 6 ✅ Gap Alert
- [x] Gap Alert engine di frontend
- [x] API endpoint `/api/gap-check`
- [ ] Menggunakan forecast data (butuh Phase 4+5)

### Phase 7 ⏳ Market Insights
- [ ] Market insights GPT di Supabase
- [ ] Display di frontend

### Phase 8 ✅ Map Dashboard
- [x] Leaflet + OpenStreetMap
- [x] 3 layer: Cuaca, Harga, Pembeli

### Phase 9 🔄 Buyer Recommendation
- [x] Buyers di Supabase + map
- [ ] Route/jarak real-time

### Phase 10 ⏳ Voice
- [ ] Azure Speech Services dikonfigurasi
- [ ] `VITE_AZURE_SPEECH_KEY` di env
- [ ] Tombol suara aktif di Step 1

---

## Variable Environment Lengkap

```bash
# Frontend (Vite — wajib prefix VITE_)
VITE_SUPABASE_URL=                    # Supabase project URL
VITE_SUPABASE_ANON_KEY=               # Supabase anon key (aman di frontend)
VITE_AZURE_SPEECH_KEY=                # Azure Speech — opsional, Phase 10
VITE_AZURE_SPEECH_REGION=southeastasia

# Azure Functions
SUPABASE_URL=                         # sama dengan VITE_SUPABASE_URL
SUPABASE_SERVICE_KEY=                 # service role key (RAHASIA)
OPENAI_API_KEY=                       # Azure OpenAI key
OPENAI_MODEL=gpt-4o-mini
AZURE_OPENAI_ENDPOINT=                # https://<resource>.openai.azure.com/
AZURE_ML_ENDPOINT=                    # Azure ML endpoint (Phase 4)
AZURE_ML_KEY=                         # Azure ML API key (Phase 4)
APPLICATIONINSIGHTS_CONNECTION_STRING= # Application Insights (opsional)
```

---

## Estimasi Biaya Azure (per bulan, dev tier)

| Layanan | Tier | Estimasi |
|---------|------|----------|
| Static Web Apps | Free | $0 |
| Functions | Consumption (1M calls gratis) | ~$0–5 |
| OpenAI (gpt-4o-mini) | Pay-per-use ~500K tokens/bln | ~$2–8 |
| Azure ML | Basic compute (jalan bulanan saja) | ~$5–20 |
| Speech Services | F0 free tier (5 jam/bln) | $0 |
| Application Insights | Pay-per-use | ~$0–3 |
| **Total estimasi** | | **~$7–36/bulan** |

---

## Open Source — Deploy Sendiri

PasokanAI dirancang agar bisa dijalankan siapa saja:

```bash
git clone https://github.com/marmrf/pasokanai-mvp
cd pasokanai-mvp

# 1. Start local Supabase
supabase start
supabase db reset  # apply migrasi + seed

# 2. Copy environment
cp .env.example frontend/.env
# Edit: isi VITE_SUPABASE_URL dengan URL lokal dari output supabase start

# 3. Start frontend
cd frontend && npm install && npm run dev

# 4. Start Azure Functions (opsional)
cd ../api && pip install -r requirements.txt
# Buat local.settings.json dari .env.example
func start

# Buka: http://localhost:5173
```

Untuk deploy ke cloud selain Azure: schema SQL di `supabase/migrations/` kompatibel dengan PostgreSQL 14+.
