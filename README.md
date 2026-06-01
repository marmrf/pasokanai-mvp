# 🌾 PasokanAI

**Platform kecerdasan pertanian berbasis AI untuk petani Indonesia.**

> Tanam apa yang cocok? Jual ke siapa yang adil? Kami bantu jawab.

[![Azure Static Web Apps](https://img.shields.io/badge/Azure-Static%20Web%20Apps-0078D4?logo=microsoftazure)](https://azure.microsoft.com/en-us/products/app-service/static/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://typescriptlang.org)

---

## 📋 Tentang PasokanAI

PasokanAI menjawab dua kegagalan struktural dalam sistem pangan Indonesia:

1. **Fragmentasi informasi pra-tanam** — data cuaca, harga pasar, dan akses kredit tersebar di silo terpisah
2. **Asimetri informasi pasca-panen** — petani tidak punya posisi tawar saat berhadapan dengan tengkulak

Platform ini mengintegrasikan data publik yang terfragmentasi menjadi keputusan konkret yang berdampak ekonomi bagi 33 juta petani kecil Indonesia.

---

## ✨ Fitur Utama

| Fitur | Status | Deskripsi |
|-------|--------|-----------|
| 🌾 Rekomendasi Komoditas | ✅ Live | Saran tanaman terbaik berdasarkan lokasi & prioritas |
| 📈 Prediksi Harga | ✅ Live | 3 skenario (optimis/normal/pesimis) |
| 🛡️ Gap Alert (MFL) | ✅ Live | Deteksi harga tengkulak tidak wajar (>15% gap) |
| 🤝 Pembeli Alternatif | ✅ Live | Koperasi, BULOG, offtaker terdekat |
| 🗺️ Peta DIY | ✅ Live | Leaflet + OpenStreetMap — cuaca, harga, pembeli |
| 🌧️ Data Cuaca | ✅ Live | Open-Meteo archive API — 5 kabupaten DIY |
| 📊 Harga Komoditas | ✅ Live | 6 bulan histori per kabupaten (Supabase) |
| 🎙️ Input Suara | 🔄 Planned | Azure Speech Services — Bahasa Indonesia |
| 🤖 AI Forecasting | 🔄 Planned | Azure ML + Prophet model |

---

## 🏗️ Stack Teknologi

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **TailwindCSS** (utility classes)
- **Leaflet** + **OpenStreetMap** (peta interaktif)
- **Supabase JS** (realtime data)

### Backend
- **Azure Functions** (Python 3.11)
  - `gap-check` — Gap Alert Engine + negotiation anchor (GPT-4o-mini)
  - `collect-weather` — Open-Meteo monthly collection
  - `scrape-prices` — Playwright scraper Bapanas
- **Azure OpenAI** (GPT-4o-mini) — reasoning & negotiation
- **Azure ML** (Prophet) — price forecasting *(planned)*
- **Azure Speech Services** — voice input *(planned)*

### Database
- **Supabase** (PostgreSQL) — 9 tabel dengan Row Level Security
- **Open-Meteo** — cuaca gratis tanpa API key

---

## 🗄️ Database Schema (Supabase)

```
districts          → 5 kabupaten DIY
weather_data       → cuaca bulanan (Open-Meteo)
commodity_prices   → harga histori per kabupaten
forecast_results   → output Azure ML Prophet
recommendations    → rekomendasi komoditas (JSONB)
buyers             → koperasi, BULOG, offtaker
middleman_offers   → tawaran tengkulak (crowdsourced)
farmer_prices      → harga aktual petani (crowdsourced)
market_insights    → analisis pasar (GPT)
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- Supabase account

### Frontend (Development)
```bash
git clone https://github.com/marmrf/pasokanai-mvp.git
cd pasokanai-mvp/frontend

# Install dependencies
npm install

# Setup environment
cp ../.env.example .env
# Edit .env: isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY

# Jalankan dev server
npm run dev
# → http://localhost:5173
```

### Azure Functions (Local)
```bash
cd api
pip install -r requirements.txt
playwright install chromium

# Copy settings
# Buat api/local.settings.json dari .env.example
# Isi: SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY

func start
# → http://localhost:7071
```

---

## 🌐 Deployment

| Komponen | Platform | Branch |
|----------|----------|--------|
| Frontend | Azure Static Web Apps | `hamzah-development` |
| API | Azure Functions (auto-deploy) | `hamzah-development` |
| Database | Supabase `pasokanaiDB` | — |

GitHub Actions otomatis build dan deploy saat push ke `hamzah-development`.

**Lihat:** [README-AZURE.md](README-AZURE.md) untuk panduan lengkap setup Azure.

---

## 📁 Struktur Project

```
pasokanai-mvp/
├── frontend/                  # React + Vite app
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── form/          # Step1, Step2, Step3, Loading, Result
│   │   │   ├── MapDashboard.tsx   # Leaflet map
│   │   │   ├── Header.tsx
│   │   │   ├── Hero.tsx
│   │   │   └── ...
│   │   ├── lib/supabase.ts    # Supabase client + queries
│   │   ├── types/index.ts     # TypeScript interfaces
│   │   └── App.tsx            # Main app state
│   ├── package.json
│   └── vite.config.ts
│
├── api/                       # Azure Functions (Python)
│   ├── function_app.py        # gap-check endpoint
│   ├── weather_collector.py   # Open-Meteo timer trigger
│   ├── price_scraper.py       # Playwright Bapanas scraper
│   └── requirements.txt
│
├── .github/workflows/         # CI/CD Azure Static Web Apps
├── README.md                  # ← kamu di sini
└── README-AZURE.md            # Panduan integrasi Azure
```

---

## 🎯 MVP Scope

Fase saat ini mencakup **Daerah Istimewa Yogyakarta** (5 kabupaten):
- Sleman, Bantul, Kulon Progo, Gunungkidul, Kota Yogyakarta

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
