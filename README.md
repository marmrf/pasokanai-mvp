# 🌾 PasokanAI

**Platform kecerdasan pertanian berbasis AI untuk petani kecil Indonesia.**

> Tanam apa yang cocok? Jual ke siapa yang adil? Kami bantu jawab.

[![Azure Static Web Apps](https://img.shields.io/badge/Azure-Static%20Web%20Apps-0078D4?logo=microsoftazure)](https://azure.microsoft.com/en-us/products/app-service/static/)
[![Azure Functions](https://img.shields.io/badge/Azure-Functions-0078D4?logo=microsoftazure)](https://azure.microsoft.com/en-us/products/functions/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://typescriptlang.org)
[![Prophet](https://img.shields.io/badge/ML-Prophet-FF6B35)](https://facebook.github.io/prophet/)

---

## 📋 Tentang PasokanAI

PasokanAI menjawab dua kegagalan struktural dalam sistem pangan Indonesia:

1. **Fragmentasi informasi pra-tanam** — data cuaca, harga pasar, dan akses kredit tersebar di silo terpisah
2. **Asimetri informasi pasca-panen** — petani tidak punya posisi tawar saat berhadapan dengan tengkulak

Platform ini mengintegrasikan data publik yang terfragmentasi menjadi keputusan konkret yang berdampak ekonomi nyata bagi 33 juta petani kecil Indonesia.

---

## ✨ Fitur Utama

| Fitur | Status | Deskripsi |
|-------|--------|-----------|
| 🌾 Rekomendasi Komoditas | ✅ Live | Saran tanaman terbaik berdasarkan lokasi & prioritas |
| 📈 Grafik Prediksi Harga | ✅ Live | Chart 90 hari dari Prophet ML — historical + forecast + confidence band |
| 🛡️ Gap Alert (MFL) | ✅ Live | Deteksi harga tengkulak tidak wajar (>15% gap) |
| 🤝 Pembeli Alternatif | ✅ Live | Koperasi, BULOG, offtaker terdekat |
| 🗺️ Peta DIY | ✅ Live | Leaflet + OpenStreetMap — cuaca, harga, pembeli |
| 🌧️ Data Cuaca | ✅ Live | Open-Meteo archive API — 28 bulan, 5 kabupaten DIY |
| 📊 Harga Komoditas | ✅ Live | 30 bulan histori · 9 komoditas · 5 kabupaten (1.189 records) |
| 🤖 ML Forecasting | ✅ Live | Prophet — dilatih lokal, auto via GitHub Actions setiap bulan |
| 📄 Proposal KUR | ✅ Live | Cetak laporan profesional lengkap sebagai proposal ke bank |
| 🎙️ Input Suara | ✅ Live | Azure Speech Services — Bahasa Indonesia |

---

## 🏗️ Stack Teknologi

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **TailwindCSS** (utility classes)
- **Leaflet** + **OpenStreetMap** (peta interaktif)
- **SVG Chart** (forecast visualization — tanpa library tambahan)
- **Azure Speech SDK** (voice input)

### Backend
- **Azure Functions** (Python 3.12)
  - `POST /api/generate-recommendation` — AI recommendation engine
  - `GET  /api/forecast` — historical + 90-day Prophet forecast data
  - `POST /api/gap-check` — Gap Alert + negotiation anchor (Gemini / GPT-4o-mini)
  - `GET  /api/service-status` — status semua service
  - `POST /api/collect-weather` — manual trigger Open-Meteo
  - Timer: `weather_collector` — tiap tanggal 1 jam 05:05 WIB
- **Google Gemini 2.5 Flash** — AI reasoning & recommendation (primary)
- **Azure OpenAI GPT-4o-mini** — AI reasoning (configured, fallback)
- **Azure Speech Services** — voice input Bahasa Indonesia

### ML Pipeline
- **Prophet** (Facebook) — time series forecasting
- **GitHub Actions** — automated monthly training (gratis, tanpa Azure ML cost)
- Flow: `commodity_prices (Supabase) → Prophet → forecast_results (Supabase) → /api/forecast → Chart`

### Database
- **Supabase** (PostgreSQL) — 9 tabel, Row Level Security aktif
- **Open-Meteo** — cuaca real-time gratis (no API key)
- **Bapanas / DPKP DIY** — sumber harga komoditas

---

## 📊 Data yang Ada

| Tabel | Records | Coverage |
|-------|---------|----------|
| `commodity_prices` | 1.189 | Jan 2024 – Jun 2026 · 9 komoditas · 5 kabupaten |
| `weather_data` | 145 | Jan 2024 – Mei 2026 · real Open-Meteo data |
| `forecast_results` | ~4.050 | 90 hari ke depan per komoditas/kabupaten (Prophet) |
| `buyers` | 22 | Koperasi, BULOG, offtaker DIY |
| `districts` | 5 | Sleman, Bantul, Kulon Progo, Gunungkidul, Kota Yogyakarta |

---

## 🗄️ Database Schema (Supabase)

```
districts          → 5 kabupaten DIY (id, name, province, latitude, longitude)
weather_data       → cuaca bulanan (Open-Meteo) — real data
commodity_prices   → harga histori per kabupaten — 30 bulan
forecast_results   → output Prophet ML — 90 hari forecast per komoditas
recommendations    → rekomendasi komoditas (JSONB) — Gemini/GPT
buyers             → koperasi, BULOG, offtaker (22 records)
middleman_offers   → tawaran tengkulak crowdsourced
farmer_prices      → harga aktual petani crowdsourced
market_insights    → analisis pasar (GPT) — Phase 7
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- Supabase account (`pasokanaiDB`)

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### 2. Azure Functions (API)

```bash
cd api
pip install -r requirements.txt

# Buat api/local.settings.json (lihat contoh di bawah)
func start
# → http://localhost:7071
```

**`api/local.settings.json`:**
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "python",
    "SUPABASE_URL": "https://<project>.supabase.co",
    "SUPABASE_SERVICE_KEY": "<service-role-key>",
    "GEMINI_API_KEY": "<gemini-key>",
    "GEMINI_MODEL": "gemini-2.5-flash",
    "AZURE_OPENAI_ENDPOINT": "https://<resource>.openai.azure.com/",
    "AZURE_OPENAI_KEY": "<azure-openai-key>",
    "AZURE_OPENAI_DEPLOYMENT": "gpt-4o-mini",
    "AZURE_SPEECH_KEY": "<speech-key>",
    "AZURE_SPEECH_REGION": "southeastasia"
  }
}
```

### 3. ML Forecasting (Prophet)

```bash
# Install ML dependencies (terpisah dari Azure Functions requirements)
pip install -r api/requirements-ml.txt

# Latih model dan simpan forecast ke Supabase
python api/prophet_forecaster.py

# Atau untuk satu kabupaten saja:
python api/prophet_forecaster.py --district sleman --commodity cabai
```

Setelah script selesai, grafik prediksi harga akan otomatis muncul di hasil rekomendasi.

---

## 🤖 ML Architecture

```
commodity_prices (Supabase)     ← 30 bulan data historis
        ↓
prophet_forecaster.py           ← Prophet: yearly seasonality + monthly
        ↓                          changepoint_prior_scale=0.3
forecast_results (Supabase)     ← 90 hari forecast per district/commodity
        ↓
GET /api/forecast                ← Azure Functions endpoint
        ↓
ForecastChart.tsx               ← SVG chart: historical + forecast + confidence band
```

**GitHub Actions automation** (`.github/workflows/ml_forecast.yml`):
- Berjalan otomatis setiap tanggal 1
- Bisa di-trigger manual dari GitHub → Actions → Run workflow
- Menggunakan `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` dari GitHub Secrets

**Setup GitHub Secrets:**
```
Repository → Settings → Secrets → New repository secret
SUPABASE_URL       = https://<project>.supabase.co
SUPABASE_SERVICE_KEY = <service-role-key>
```

---

## 🌐 Deployment

| Komponen | Platform | Branch |
|----------|----------|--------|
| Frontend + API | Azure Static Web Apps | `hamzah-development` |
| ML Training | GitHub Actions (gratis) | auto-trigger setiap bulan |
| Database | Supabase `pasokanaiDB` | — |

GitHub Actions otomatis build dan deploy saat push ke `hamzah-development`.

---

## 📁 Struktur Project

```
pasokanai-mvp/
├── frontend/                      # React + Vite app
│   └── src/
│       ├── components/
│       │   ├── form/
│       │   │   ├── ResultScreen.tsx   # Hasil rekomendasi + chart + print
│       │   │   └── ...
│       │   ├── ForecastChart.tsx      # SVG price forecast chart ← NEW
│       │   ├── MapDashboard.tsx       # Leaflet map (3 layers)
│       │   └── ...
│       └── App.tsx
│
├── api/                           # Azure Functions (Python)
│   ├── function_app.py            # Semua HTTP endpoints
│   ├── recommendation_engine.py   # AI recommendation logic
│   ├── weather_collector.py       # Open-Meteo timer trigger
│   ├── prophet_forecaster.py      # Prophet ML training script ← NEW
│   ├── price_scraper.py           # Playwright Bapanas scraper
│   ├── requirements.txt           # Azure Functions deps
│   └── requirements-ml.txt        # ML deps (GitHub Actions) ← NEW
│
├── .github/workflows/
│   ├── azure-static-web-apps-*.yml  # CI/CD deploy
│   └── ml_forecast.yml              # Monthly Prophet training ← NEW
│
└── AZURE-IMPLEMENTATION.md        # Detail arsitektur Azure
```

---

## 🎯 MVP Scope

Fase saat ini mencakup **Daerah Istimewa Yogyakarta** (5 kabupaten):
- Sleman, Bantul, Kulon Progo, Gunungkidul, Kota Yogyakarta

9 komoditas: padi, jagung, cabai, cabai rawit, bawang merah, kacang tanah, kedelai, singkong, sayuran daun

Ekspansi nasional belum termasuk dalam MVP.

---

## 👥 Tim

| Nama | Peran |
|------|-------|
| Hamzah Arman Husni | Project Lead & AI Engineering |
| Elsa Aiziyah | Data & Backend Engineering |
| Amar Ma'ruf | Product & UX Design |

---

## 🏆 Hackathon

**Microsoft ElevAIte AI Impact Hackathon**

---

## 📄 Lisensi

MIT License — bebas digunakan untuk kepentingan petani Indonesia.
