# AZURE-IMPLEMENTATION.md
# PasokanAI — Panduan Implementasi Azure + ML Backend

Dokumen ini menjelaskan status setiap service, arsitektur ML forecasting, dan langkah deploy ke production.

---

## Status Layanan Saat Ini

| Layanan | Status | Catatan |
|---------|--------|---------|
| **Supabase (PostgreSQL)** | ✅ Connected | 9 tabel, RLS aktif, 1.189 price records |
| **Open-Meteo (cuaca)** | ✅ Connected | Gratis, no API key, 145 weather records |
| **Azure Functions** | ✅ Deployed | 6 endpoints aktif |
| **Google Gemini 2.5 Flash** | ✅ Live | Primary AI engine — recommendation + anchor |
| **Azure OpenAI (GPT-4o-mini)** | ⚠️ Configured | Endpoint set, key perlu diverifikasi |
| **Azure Speech Services** | ✅ Connected | Voice input aktif di Step 1 |
| **Prophet ML (lokal)** | ✅ Phase 4A | Dilatih lokal via `api/prophet_forecaster.py` |
| **GitHub Actions ML** | ✅ Configured | Auto-train bulanan via `.github/workflows/ml_forecast.yml` |
| **Azure ML** | 🔄 Phase 4B | Migration path sudah didokumentasi |
| **Application Insights** | ⚠️ Optional | Key dikonfigurasi, logging berjalan |

> **Status runtime:** Dev banner kuning di UI menampilkan status real-time setiap service.

---

## Arsitektur ML Forecasting

### Phase 4A — Local Prophet (CURRENT ✅)

```
commodity_prices (Supabase)
  1.189 records · Jan 2024 – Jun 2026
  9 komoditas × 5 kabupaten DIY
        ↓
prophet_forecaster.py
  Prophet(seasonality_mode="multiplicative",
          yearly_seasonality=True,
          changepoint_prior_scale=0.3)
  + monthly seasonality (fourier_order=5)
        ↓
forecast_results (Supabase)
  ~4.050 records · 90 hari ke depan
  per (district_id, commodity, forecast_date)
        ↓
GET /api/forecast?district_id=X&commodity=Y
  historical: [...], forecast: [...], source: "prophet_local"
        ↓
ForecastChart.tsx
  SVG: historical (solid) + forecast (dashed) + confidence band
```

**Cara menjalankan training:**
```bash
pip install -r api/requirements-ml.txt
python api/prophet_forecaster.py

# Satu kabupaten:
python api/prophet_forecaster.py --district sleman
# Satu komoditas:
python api/prophet_forecaster.py --commodity cabai
```

**Automasi via GitHub Actions:**
```yaml
# .github/workflows/ml_forecast.yml
# Berjalan: setiap tanggal 1 jam 03:00 WIB
# Manual trigger: GitHub → Actions → ML Forecast → Run workflow
```

Setup GitHub Secrets (Repository → Settings → Secrets):
```
SUPABASE_URL         = https://xbplmgonhykmupgidrcn.supabase.co
SUPABASE_SERVICE_KEY = <service-role-key>
```

### Phase 4B — Azure ML (PLANNED 🔄)

Ketika skala meningkat, pipeline Prophet dipindah ke Azure ML:

```bash
# Setup workspace
az ml workspace create \
  --name pasokanai-dev-ml \
  --resource-group pasokanai-dev-rg \
  --location southeastasia

# Compute cluster (mati saat idle — hemat biaya)
az ml compute create \
  --name forecasting-cluster \
  --type AmlCompute \
  --min-instances 0 \
  --max-instances 2 \
  --size Standard_DS2_v2 \
  --workspace-name pasokanai-dev-ml \
  --resource-group pasokanai-dev-rg
```

Pipeline script yang sama (`prophet_forecaster.py`) dijalankan di Azure ML compute — tidak ada perubahan kode, hanya environment yang berbeda.

`api/function_app.py` tidak perlu diubah — tetap membaca `forecast_results` dari Supabase.

---

## 1. Azure Functions — Backend API

**Resource:** `pasokanai-dev-api`
**Status:** ✅ Deployed

### Endpoints

| Endpoint | Method | Status | Deskripsi |
|----------|--------|--------|-----------|
| `POST /api/generate-recommendation` | POST | ✅ Live | AI crop recommendation (Gemini/GPT) |
| `GET /api/forecast` | GET | ✅ Live | Historical + 90-day Prophet forecast |
| `POST /api/gap-check` | POST | ✅ Live | Gap alert + negotiation anchor |
| `GET /api/service-status` | GET | ✅ Live | Status semua services |
| `GET /api/health-check` | GET | ✅ Live | Diagnostics env + Supabase |
| `POST /api/collect-weather` | POST | ✅ Live | Manual Open-Meteo trigger |
| `POST /api/scrape-prices` | POST | ✅ Live | Playwright Bapanas scraper |
| Timer: `weather_collector` | — | ✅ Scheduled | Tiap tgl 1 jam 05:05 WIB |

### GET /api/forecast — Detail

```
Query params:
  district_id        — UUID kabupaten (wajib)
  commodity          — slug komoditas (wajib): padi|jagung|cabai|...
  historical_months  — berapa bulan histori (opsional, default 6)

Response:
{
  "commodity": "cabai",
  "district": "Sleman",
  "historical": [{"date": "2026-01-01", "price": 38000}, ...],
  "forecast": [
    {"date": "2026-07-01", "yhat": 43000,
     "yhat_lower": 40000, "yhat_upper": 46000},
    ...
  ],
  "forecast_source": "prophet_local" | "linear_trend" | "none"
}
```

Jika `forecast_results` sudah diisi Prophet (≥10 baris per komoditas/kabupaten):
→ `forecast_source = "prophet_local"`, confidence band dari kolom `confidence`

Jika belum ada data Prophet:
→ `forecast_source = "linear_trend"`, confidence band ±15%
→ UI tampilkan banner kuning: "Jalankan python api/prophet_forecaster.py"

### Setup lokal:
```bash
cd api
pip install -r requirements.txt

func start
# → http://localhost:7071
```

### Deploy ke Azure:
```bash
func azure functionapp publish pasokanai-dev-api --python
```

---

## 2. Supabase — Database

**Project:** `pasokanaiDB`
**Status:** ✅ Connected — 9 tabel, data seeded

### Data saat ini:

| Tabel | Records | Keterangan |
|-------|---------|-----------|
| `districts` | 5 | 5 kabupaten DIY |
| `commodity_prices` | 1.189 | Jan 2024 – Jun 2026, 9 komoditas |
| `weather_data` | 145 | Jan 2024 – Mei 2026, real Open-Meteo |
| `forecast_results` | ~4.050 | 90 hari Prophet forecast |
| `buyers` | 22 | Koperasi, BULOG, offtaker |
| `recommendations` | varies | Cached AI recommendations |
| `middleman_offers` | 0 | Crowdsourced (belum ada input) |
| `farmer_prices` | 0 | Crowdsourced (belum ada input) |
| `market_insights` | 0 | Phase 7 |

### Unique Constraints (penting untuk upsert):
```sql
-- commodity_prices
ALTER TABLE commodity_prices
  ADD CONSTRAINT uq_commodity_prices_district_commodity_date
  UNIQUE (district_id, commodity, price_date);

-- weather_data
ALTER TABLE weather_data
  ADD CONSTRAINT uq_weather_data_district_date
  UNIQUE (district_id, weather_date);

-- forecast_results
ALTER TABLE forecast_results
  ADD CONSTRAINT uq_forecast_results_district_commodity_date
  UNIQUE (district_id, commodity, forecast_date);
```

---

## 3. Google Gemini 2.5 Flash — AI Primary

**Status:** ✅ Live
**Digunakan untuk:**
- Recommendation text generation
- Negotiation anchor (gap-check)

**Config di `api/local.settings.json`:**
```json
{
  "GEMINI_API_KEY": "<key>",
  "GEMINI_MODEL": "gemini-2.5-flash"
}
```

**Penting:** `thinkingConfig: {thinkingBudget: 0}` wajib ada di payload request — Gemini 2.5 Flash thinking mode menghasilkan `"thought": true` parts yang merusak JSON parsing jika tidak difilter.

---

## 4. Azure OpenAI — GPT-4o-mini

**Resource:** `pasokanai-openai-prod`
**Status:** ⚠️ Configured — key perlu diverifikasi
**Digunakan untuk:** Fallback jika Gemini tidak tersedia

**Config:**
```json
{
  "AZURE_OPENAI_ENDPOINT": "https://pasokanai-openai-prod.openai.azure.com/",
  "AZURE_OPENAI_KEY": "<azure-key>",
  "AZURE_OPENAI_DEPLOYMENT": "gpt-4o-mini",
  "AZURE_OPENAI_API_VERSION": "2024-02-01"
}
```

---

## 5. Azure Speech Services — Voice Input

**Resource:** `pasokanai-dev-speech`
**Status:** ✅ Connected
**Region:** Southeast Asia

**Config (frontend):**
```
VITE_AZURE_SPEECH_KEY=<key>
VITE_AZURE_SPEECH_REGION=southeastasia
```

Tombol mikrofon aktif di Step 1 — petani bisa bilang: *"lahan saya satu hektare di Sleman"*

---

## 6. GitHub Actions — ML Training

**File:** `.github/workflows/ml_forecast.yml`
**Status:** ✅ Configured

### Trigger:
1. **Otomatis** — setiap tanggal 1 jam 20:00 UTC (03:00 WIB)
2. **Manual** — GitHub → Actions → "ML Forecast" → "Run workflow"
   - Bisa pilih district dan commodity spesifik

### Setup Secrets:
```
Repository Settings → Secrets and variables → Actions → New repository secret

SUPABASE_URL         (sama dengan VITE_SUPABASE_URL)
SUPABASE_SERVICE_KEY (service role key — BUKAN anon key)
```

### Biaya:
GitHub Actions gratis untuk public repo (2.000 menit/bulan).
Training 5 kabupaten × 9 komoditas ≈ 5–8 menit per run.

---

## 7. Application Insights — Monitoring

**Status:** ⚠️ Optional — key dikonfigurasi

```json
{
  "APPLICATIONINSIGHTS_CONNECTION_STRING": "InstrumentationKey=...;..."
}
```

---

## Fallback System

```
generate-recommendation flow:
  1. Supabase commodity_prices      → data harga real
  2. Prophet forecast_results       → predicted_30d
  3. Gemini 2.5 Flash               → recommendation text
     ↓ jika gagal
  4. Azure OpenAI GPT-4o-mini       → recommendation text
     ↓ jika gagal
  5. Statistical fallback template  → recommendation text

forecast flow:
  1. forecast_results (≥10 rows)    → prophet_local source
     ↓ jika tidak ada
  2. commodity_prices linear trend  → linear_trend source
  3. Chart tampilkan banner kuning  → instruksi jalankan Prophet
```

---

## Checklist Deployment MVP

### Infrastructure ✅
- [x] Branch `hamzah-development`
- [x] Azure Static Web Apps (`pasokanai-dev-web`)
- [x] Azure Functions (`pasokanai-dev-api`)
- [x] Supabase `pasokanaiDB` — 9 tabel + RLS + data seeded
- [x] Azure Speech Services

### Data Layer ✅
- [x] 5 kabupaten DIY seeded
- [x] 1.189 price records (Jan 2024 – Jun 2026)
- [x] 145 weather records (Jan 2024 – Mei 2026, real Open-Meteo)
- [x] 22 buyers (koperasi, BULOG, offtaker)
- [x] Unique constraints untuk upsert aman

### AI & ML ✅
- [x] Gemini 2.5 Flash — recommendation + negotiation
- [x] Azure OpenAI — konfigurasi lengkap (fallback)
- [x] Prophet forecaster script — `api/prophet_forecaster.py`
- [x] GitHub Actions ML workflow — auto-train bulanan
- [x] `/api/forecast` endpoint — historical + forecast data
- [x] ForecastChart.tsx — SVG chart dengan confidence band

### Features ✅
- [x] Rekomendasi komoditas (Gemini + data real)
- [x] Grafik prediksi harga 90 hari (Prophet)
- [x] Gap Alert engine + negotiation anchor
- [x] Market Fairness Layer (MFL)
- [x] Peta DIY (Leaflet + OpenStreetMap)
- [x] Pembeli alternatif (koperasi, BULOG, offtaker)
- [x] Voice input (Azure Speech)
- [x] **Print Proposal KUR** — laporan lengkap siap dibawa ke bank

### Pending ⏳
- [ ] Azure ML workspace (Phase 4B — production scale)
- [ ] Market insights (Phase 7 — GPT-generated insights)
- [ ] Crowdsourced farmer prices (Phase user input)
- [ ] Route/jarak real-time ke pembeli

---

## Estimasi Biaya Azure (per bulan, dev tier)

| Layanan | Tier | Estimasi |
|---------|------|----------|
| Static Web Apps | Free | $0 |
| Functions | Consumption | ~$0–5 |
| OpenAI (gpt-4o-mini) | Pay-per-use | ~$2–8 |
| Speech Services | F0 free tier | $0 |
| Application Insights | Pay-per-use | ~$0–3 |
| **ML Training** | **GitHub Actions (gratis)** | **$0** |
| **Total estimasi** | | **~$2–16/bulan** |

> ML training menggunakan GitHub Actions gratis — menghemat ~$5–20/bulan vs Azure ML compute.

---

## Variable Environment Lengkap

```bash
# Frontend (.env)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_AZURE_SPEECH_KEY=
VITE_AZURE_SPEECH_REGION=southeastasia

# Azure Functions (api/local.settings.json → Values)
SUPABASE_URL=
SUPABASE_SERVICE_KEY=           # service_role key — BUKAN anon
GEMINI_API_KEY=                 # primary AI
GEMINI_MODEL=gemini-2.5-flash
AZURE_OPENAI_ENDPOINT=          # fallback AI
AZURE_OPENAI_KEY=
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
AZURE_OPENAI_API_VERSION=2024-02-01
AZURE_SPEECH_KEY=               # sudah dikonfigurasi
AZURE_SPEECH_REGION=southeastasia
AZURE_ML_ENDPOINT=              # Phase 4B — belum digunakan
AZURE_ML_KEY=                   # Phase 4B — belum digunakan
APPLICATIONINSIGHTS_CONNECTION_STRING=

# GitHub Secrets (untuk GitHub Actions ML workflow)
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```
