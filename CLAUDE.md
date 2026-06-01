# CLAUDE.md

# 🌾 PasokanAI V2 - Project Constitution

Version: 2.0

Status: Active Development

Branch: hamzah-development

Challenge:
Microsoft ElevAIte AI Impact Hackathon

---

# 🚨 CRITICAL RULES

Before doing ANY work:

1. Verify current branch.
2. Current branch MUST be:

hamzah-development

3. Never commit directly to:

main

4. Never merge to:

main

unless explicitly instructed.

5. Never delete:

hamzah-development

6. Never deploy unfinished features to production.

7. PasokanAI V1 must remain operational.

Rule:

PasokanAI V2 may break.
PasokanAI V1 must never break.

---

# 🎯 PRODUCT VISION

PasokanAI is an AI-powered agricultural intelligence platform for Indonesian smallholder farmers.

The platform helps farmers:

1. Choose the best crop before planting.
2. Forecast commodity prices.
3. Understand weather conditions.
4. Detect unfair middleman prices.
5. Find alternative buyers.
6. Receive AI-generated market insights.
7. Interact using voice.

---

# 🎯 MVP SCOPE

Current MVP scope:

Daerah Istimewa Yogyakarta (DIY)

Supported districts:

* Sleman
* Bantul
* Kulon Progo
* Gunungkidul
* Kota Yogyakarta

National expansion is NOT part of MVP.

Do not build Indonesia-wide functionality.

---

# 🎨 UI STRATEGY

Current application UI is the design reference.

Current stack:

HTML
CSS
JavaScript

Target stack:

React
TypeScript
Vite
TailwindCSS

Claude MUST:

* Preserve current branding
* Preserve current colors
* Preserve current layout
* Preserve current user flow
* Preserve mobile-first experience

Claude MUST NOT:

* Redesign UI
* Change branding
* Change navigation flow
* Replace current visual identity

Migration goal:

HTML → React Components

while preserving appearance.

---

# 🏗 TARGET ARCHITECTURE

Frontend

React
TypeScript
Tailwind
Leaflet

↓

Azure Static Web Apps

↓

Azure Functions

↓

Supabase

↓

Azure Machine Learning

↓

Azure OpenAI

↓

Azure Speech

---

# 🌐 DEPLOYMENT

Production Branch:

main

Development Branch:

hamzah-development

Azure Static Web Apps deployment source:

hamzah-development

Production deployment happens only after MVP validation.

---

# ☁️ AZURE CONFIGURATION

Resource Group:

pasokanai-dev-rg

Required Azure Resources:

1. pasokanai-dev-web
   Azure Static Web Apps

2. pasokanai-dev-api
   Azure Functions

3. pasokanai-dev-openai
   Azure OpenAI

4. pasokanai-dev-ml
   Azure Machine Learning

5. pasokanai-dev-speech
   Azure Speech Services

Future:

6. pasokanai-dev-search
   Azure AI Search

---

# 🗄 SUPABASE CONFIGURATION

Supabase Project:

pasokanaiDB

IMPORTANT

Before ANY database operation:

1. Verify active project.
2. Active project MUST equal:

pasokanaiDB

Claude MUST NEVER:

* Create another project
* Create another organization
* Switch databases
* Modify unrelated projects

All database work must target:

pasokanaiDB

---

# 🧱 DATABASE TABLES

Required Tables

districts

weather_data

commodity_prices

forecast_results

market_insights

buyers

middleman_offers

farmer_prices

recommendations

No additional tables unless justified.

---

# districts

Stores supported districts.

Columns:

id
name
province
latitude
longitude

---

# weather_data

Stores weather information.

Columns:

id
district_id
weather_date
rainfall
temperature
humidity

---

# commodity_prices

Stores commodity prices.

Columns:

id
district_id
commodity
price
price_date

---

# forecast_results

Stores ML forecasting results.

Columns:

id
district_id
commodity
forecast_price
confidence
forecast_date

---

# market_insights

Stores AI-generated market analysis.

Columns:

id
district_id
commodity
summary
impact_score
created_at

---

# buyers

Stores alternative buyers.

Columns:

id
name
buyer_type
commodity
latitude
longitude
contact

buyer_type:

* koperasi
* bulog
* offtaker

---

# middleman_offers

Stores middleman offers.

Columns:

id
district_id
commodity
offered_price
offer_date

---

# farmer_prices

Stores crowdsourced farmer prices.

Columns:

id
district_id
commodity
actual_price
report_date

---

# recommendations

Stores recommendation outputs.

Columns:

id
district_id
commodity
recommendation_text
confidence
created_at

---

# 🌦 WEATHER DATA STRATEGY

Primary Weather Source:

Open-Meteo

Do NOT use BMKG APIs.

Reason:

* unreliable access
* inconsistent availability
* difficult integration

Weather variables:

* rainfall
* temperature
* humidity

Collection Frequency:

Monthly

Collection Method:

Azure Function Timer Trigger

Store results in:

weather_data

---

# 📈 COMMODITY PRICE STRATEGY

Sources:

* Bapanas
* DPKP DIY
* CSV Imports

Price data is the source of truth.

Update Frequency:

Monthly

Store results in:

commodity_prices

---

# 🤖 MACHINE LEARNING STRATEGY

Azure Machine Learning is REQUIRED.

Do not replace Azure ML with local-only forecasting.

Forecasting Model:

Prophet

Forecast Windows:

* 30 Days
* 90 Days

Inputs:

commodity_prices

weather_data

Outputs:

forecast_results

GPT must NEVER generate forecasts.

Correct flow:

Historical Data
→ Prophet
→ Forecast

Incorrect flow:

Historical Data
→ GPT
→ Forecast

---

# 🧠 AZURE OPENAI STRATEGY

Model:

gpt-4o-mini

Purpose:

* Explain forecasts
* Generate recommendations
* Generate market insights
* Generate negotiation guidance

Azure OpenAI is a reasoning engine.

Azure OpenAI is NOT a forecasting engine.

---

# 📊 RECOMMENDATION ENGINE

Inputs:

forecast_results

weather_data

district_data

Outputs:

Best crop recommendation

Recommendations must be generated from real data.

Forbidden:

const recommendation = "Jagung"

unless supported by actual forecast data.

No hardcoded recommendations.

---

# 📉 GAP ALERT ENGINE

Purpose:

Protect farmers from unfair pricing.

Inputs:

middleman_offers

forecast_results

farmer_prices

Outputs:

Gap percentage

Potential loss

Negotiation explanation

Example:

Market Price:
5200

Offer Price:
3800

Gap:
27%

Potential Loss:
Rp 5.600.000

---

# 📢 MARKET INSIGHT ENGINE

Purpose:

Generate district-specific agricultural intelligence.

Inputs:

forecast_results

weather_data

market research data

Outputs:

Natural language insights.

Example:

Harga jagung di Sleman diperkirakan naik 8% dalam 30 hari karena curah hujan menurun dan permintaan meningkat.

Store insights in:

market_insights

---

# 🔍 MARKET RESEARCH STRATEGY

Sources:

* Bapanas
* DPKP DIY
* BI PIHPS
* Kementan
* Agricultural News

Purpose:

Support market insights.

Research data must never replace forecasting data.

Forecasting always comes from Azure ML.

---

# 🗺 MAP SYSTEM

Required Technology:

Leaflet

OpenStreetMap

Do not use:

Google Maps

Paid mapping services

Map Scope:

DIY only

Required Layers:

1. Weather Layer

2. Recommendation Layer

3. Gap Alert Layer

4. Buyer Layer

Map is a core feature.

Not optional.

---

# 🔊 VOICE SYSTEM

Provider:

Azure Speech Services

Flow:

Voice
→ Speech To Text
→ Recommendation Engine
→ Response

Voice features are lower priority than forecasting.

---

# 🔍 MCP RULES

Allowed MCP Servers:

* Supabase MCP
* GitHub MCP
* Azure MCP
* Filesystem MCP
* Playwright MCP

Before database modifications:

1. Inspect schema
2. Generate migration
3. Explain migration
4. Execute migration
5. Verify migration

Never perform destructive actions without confirmation.

---

# 🚀 DEVELOPMENT ROADMAP

PHASE 0

* Setup Azure
* Setup Supabase
* Setup Branch
* Setup React

PHASE 1

* Remove all dummy data

PHASE 2

* Weather Collection

PHASE 3

* Commodity Price Data

PHASE 4

* Azure ML Forecasting

PHASE 5

* Azure OpenAI Recommendations

PHASE 6

* Gap Alert Engine

PHASE 7

* Market Insight Engine

PHASE 8

* Map Dashboard

PHASE 9

* Buyer Recommendation

PHASE 10

* Voice Integration

---

# ✅ DEFINITION OF SUCCESS

PasokanAI V2 is successful when:

1. No dummy data remains.
2. React migration is completed.
3. Supabase stores all operational data.
4. Open-Meteo integration works.
5. Monthly weather collection works.
6. Commodity prices are updated monthly.
7. Azure ML forecasting works.
8. Forecast results are persisted.
9. Azure OpenAI reasoning works.
10. Recommendations use real forecast data.
11. Gap Alert works.
12. Market Insights work.
13. DIY map visualization works.
14. Alternative buyers are displayed.
15. Voice input works.
16. Azure Static Web Apps deployment succeeds.
17. All development remains inside hamzah-development.
