"""
PasokanAI — AI Recommendation Engine
Flow: commodity_prices (Supabase) → statistical forecast → Azure OpenAI → recommendation text

Phase 4 TODO: Replace calc_statistical_forecast() with Azure ML (Prophet).
See: AZURE-IMPLEMENTATION.md § Phase 4
"""

import json
import logging
import os
import urllib.request
import urllib.error
from datetime import date

logger = logging.getLogger(__name__)

# ── Commodity metadata ────────────────────────────────────────────────────────
COMMODITY_META = {
    "padi":         {"display": "Padi",         "emoji": "🌾", "yield": "5–6 ton",   "harvest": "100–120 hari", "yield_mid": 5.5},
    "jagung":       {"display": "Jagung",        "emoji": "🌽", "yield": "4–6 ton",   "harvest": "85–100 hari",  "yield_mid": 5.0},
    "bawang_merah": {"display": "Bawang Merah",  "emoji": "🧅", "yield": "7–9 ton",   "harvest": "60–75 hari",   "yield_mid": 8.0},
    "cabai_rawit":  {"display": "Cabai Rawit",   "emoji": "🌶️", "yield": "6–8 ton",  "harvest": "70–85 hari",   "yield_mid": 7.0},
    "cabai":        {"display": "Cabai Merah",   "emoji": "🌶️", "yield": "6–8 ton",  "harvest": "70–85 hari",   "yield_mid": 7.0},
    "kacang_tanah": {"display": "Kacang Tanah",  "emoji": "🥜", "yield": "2–3 ton",   "harvest": "90–110 hari",  "yield_mid": 2.5},
    "singkong":     {"display": "Singkong",      "emoji": "🫚", "yield": "15–20 ton", "harvest": "8–12 bulan",   "yield_mid": 17.5},
    "kedelai":      {"display": "Kedelai",       "emoji": "🫘", "yield": "1.5–2 ton", "harvest": "75–90 hari",   "yield_mid": 1.75},
    "sayuran_daun": {"display": "Sayuran Daun",  "emoji": "🥬", "yield": "8–12 ton",  "harvest": "25–35 hari",   "yield_mid": 10.0},
    "tomat":        {"display": "Tomat",         "emoji": "🍅", "yield": "20–30 ton", "harvest": "60–70 hari",   "yield_mid": 25.0},
    "kentang":      {"display": "Kentang",       "emoji": "🥔", "yield": "15–25 ton", "harvest": "90–120 hari",  "yield_mid": 20.0},
}

MONTH_NAMES = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"]

SYSTEM_PROMPT = """Kamu adalah konsultan pertanian AI untuk petani kecil di Daerah Istimewa Yogyakarta.
Kamu berbicara dalam Bahasa Indonesia yang sederhana, hangat, dan mudah dipahami petani.
Selalu gunakan data konkret yang diberikan. Jawab dalam format JSON yang diminta TANPA teks tambahan."""


def _clean_json_text(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    if "{" in cleaned and "}" in cleaned:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if end > start:
            cleaned = cleaned[start:end + 1]
    return cleaned


def _generate_with_gemini(prompt: str) -> dict | None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": prompt}]}
        ],
        "generationConfig": {
            "temperature": 0.35,
            "maxOutputTokens": 700,
        },
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.load(resp)
        candidates = data.get("candidates") or []
        if not candidates:
            return None
        parts = candidates[0].get("content", {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts)
        if not text:
            return None
        return json.loads(_clean_json_text(text))
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError):
        logger.exception("Gemini recommendation error")
        return None


# ── Forecasting ───────────────────────────────────────────────────────────────

def calc_statistical_forecast(prices: list) -> dict:
    """
    Simple linear trend from historical price data.

    Phase 4 TODO: Replace with Azure ML Prophet endpoint.
    Endpoint: GET {AZURE_ML_ENDPOINT}/score
    Input: district_id + commodity + date range
    Output: yhat, yhat_lower, yhat_upper for next 30/90 days
    See AZURE-IMPLEMENTATION.md § Phase 4 for pipeline code.
    """
    if not prices:
        return {}

    sorted_prices = sorted(prices, key=lambda x: x["price_date"])
    n = len(sorted_prices)
    vals = [float(p["price"]) for p in sorted_prices]

    avg_price = sum(vals) / n
    current_price = vals[-1]

    # Linear regression slope
    indices = list(range(n))
    mean_i = sum(indices) / n
    num = sum((i - mean_i) * (vals[i] - avg_price) for i in range(n))
    den = sum((i - mean_i) ** 2 for i in range(n))
    slope = num / den if den else 0

    predicted_30d = max(200, current_price + slope)

    months_span = max(1, n - 1)
    monthly_trend_pct = ((vals[-1] - vals[0]) / vals[0]) / months_span * 100 if vals[0] > 0 else 0

    return {
        "current_price": current_price,
        "avg_price": avg_price,
        "trend_pct": monthly_trend_pct,
        "predicted_30d": predicted_30d,
        "data_points": n,
        "forecast_method": "linear_trend",  # becomes 'azure_ml_prophet' in Phase 4
    }


def pick_best_commodity(forecasts: dict, priority: str):
    """Pick commodity based on priority (profit = highest upward trend, safe = lowest volatility)."""
    if not forecasts:
        return None, {}

    if priority == "profit":
        return max(forecasts.items(), key=lambda x: x[1].get("trend_pct", 0))
    elif priority == "safe":
        return min(forecasts.items(), key=lambda x: abs(x[1].get("trend_pct", 0)))
    return max(forecasts.items(), key=lambda x: x[1].get("current_price", 0))


# ── OpenAI prompt ─────────────────────────────────────────────────────────────

def build_prompt(commodity, district_name, forecast, weather, priority, all_forecasts):
    meta = COMMODITY_META.get(commodity, {
        "display": commodity.replace("_", " ").title(),
        "emoji": "🌱", "yield": "3–5 ton", "harvest": "60–90 hari", "yield_mid": 4.0,
    })

    cur  = int(forecast.get("current_price", 5000))
    pred = int(forecast.get("predicted_30d", cur))
    avg  = int(forecast.get("avg_price", cur))
    tpct = forecast.get("trend_pct", 0)
    tdir = "naik" if tpct >= 0 else "turun"

    priority_label = "profit maksimal" if priority == "profit" else "hasil stabil / risiko rendah"

    weather_ctx = (
        f"Curah hujan: {weather.get('rainfall','?')} mm/hari, "
        f"suhu: {weather.get('temperature','?')}°C, "
        f"kelembapan: {weather.get('humidity','?')}%"
    ) if weather else "Data cuaca belum tersedia"

    other_commodities = ", ".join(
        f"{COMMODITY_META.get(c,{}).get('display',c)} ({'+' if f.get('trend_pct',0)>=0 else ''}{f.get('trend_pct',0):.0f}%/bln)"
        for c, f in all_forecasts.items() if c != commodity
    )

    today = date.today()
    m1 = (today.month % 12) + 1
    m2 = (m1 % 12) + 1
    y = today.year + (1 if m1 < today.month else 0)
    time_range = f"{MONTH_NAMES[m1-1]}–{MONTH_NAMES[m2-1]} {y}"

    # Revenue estimates (60% net margin after production cost)
    ymid = meta["yield_mid"]
    rev_opt  = int(pred * 1.15 * ymid * 1000 * 0.60)
    rev_norm = int(pred       * ymid * 1000 * 0.60)
    rev_pes  = int(pred * 0.85 * ymid * 1000 * 0.60)

    def fmt(v): return f"Rp {v//1_000_000:.0f}–{(v+2_000_000)//1_000_000:.0f} juta"

    return f"""Data untuk rekomendasi petani:
- Kabupaten: {district_name}, DIY
- Komoditas pilihan ({priority_label}): {meta['display']}
- Data harga DPKP DIY / Bapanas:
  * Rata-rata 6 bulan terakhir: Rp {avg:,}/kg
  * Harga bulan ini: Rp {cur:,}/kg
  * Prediksi 30 hari ke depan: Rp {pred:,}/kg (tren {tdir} {abs(tpct):.1f}%/bulan)
- Kondisi cuaca: {weather_ctx}
- Perbandingan komoditas lain: {other_commodities}

Estimasi (untuk format response):
- Skenario optimis pendapatan bersih: {fmt(rev_opt)} per hektare
- Skenario normal: {fmt(rev_norm)} per hektare
- Skenario pesimis: {fmt(rev_pes)} per hektare

Berikan rekomendasi dalam format JSON berikut PERSIS — TANPA teks lain, langsung JSON:
{{
  "name": "{meta['display']}",
  "emoji": "{meta['emoji']}",
  "risk": "<Risiko Rendah atau Risiko Sedang atau Risiko Tinggi — pilih berdasarkan data>",
  "time": "{time_range}",
  "timeSub": "<1 kalimat alasan waktu tanam berdasarkan cuaca di atas>",
  "price": "Rp {pred:,}/kg",
  "priceSub": "<singkat: ↑ X% dari bulan lalu atau ↓ X%>",
  "yield": "{meta['yield']}",
  "harvest": "{meta['harvest']}",
  "reasoning": "<2 kalimat natural kenapa ini direkomendasikan, pakai data cuaca & harga>",
  "scenarios": {{
    "optimis": ["{fmt(rev_opt)}", "Rp {int(pred*1.15):,}/kg"],
    "normal":  ["{fmt(rev_norm)}", "Rp {pred:,}/kg"],
    "pesimis": ["{fmt(rev_pes)}", "Rp {int(pred*0.85):,}/kg"]
  }},
  "avgPrice": {avg},
  "predictedPrice": {pred}
}}"""


# ── Main generator ────────────────────────────────────────────────────────────

def generate_recommendation(district_id: str, priority: str, supabase_client, openai_client, model: str):
    """
    Generate crop recommendation using price trends + Azure OpenAI.
    Returns (rec_dict, source_string) where source is 'azure_openai', 'statistical_fallback', or 'seed'.
    """
    if not supabase_client:
        return None, "no_supabase"

    # 1. Fetch district info
    dist_res = supabase_client.table("districts").select("name").eq("id", district_id).single().execute()
    if not dist_res.data:
        return None, "district_not_found"
    district_name = dist_res.data["name"]

    # 2. Fetch latest 6 months of price data
    price_res = (
        supabase_client.table("commodity_prices")
        .select("commodity,price,price_date")
        .eq("district_id", district_id)
        .order("price_date", desc=True)
        .limit(100)
        .execute()
    )
    if not price_res.data:
        return None, "no_price_data"

    # Group by commodity
    by_commodity: dict[str, list] = {}
    for p in price_res.data:
        c = p["commodity"]
        if c not in by_commodity:
            by_commodity[c] = []
        by_commodity[c].append(p)

    # 3. Statistical forecast per commodity
    forecasts = {c: calc_statistical_forecast(prices) for c, prices in by_commodity.items() if prices}
    if not forecasts:
        return None, "no_forecasts"

    # 4. Pick best commodity
    best_commodity, best_forecast = pick_best_commodity(forecasts, priority)
    if not best_commodity:
        return None, "no_best_commodity"

    # 5. Fetch latest weather
    weather_res = (
        supabase_client.table("weather_data")
        .select("rainfall,temperature,humidity")
        .eq("district_id", district_id)
        .order("weather_date", desc=True)
        .limit(1)
        .execute()
    )
    weather = weather_res.data[0] if weather_res.data else None

    # 6. Save to forecast_results table
    try:
        supabase_client.table("forecast_results").upsert({
            "district_id": district_id,
            "commodity": best_commodity,
            "forecast_price": round(best_forecast["predicted_30d"], 2),
            "confidence": min(90, max(50, 70 + (best_forecast["data_points"] * 2))),
            "forecast_date": str(date.today()),
        }, on_conflict="district_id,commodity,forecast_date").execute()
    except Exception as e:
        logger.warning(f"Could not save forecast: {e}")

    # 7. Generate recommendation text
    if openai_client:
        prompt = build_prompt(best_commodity, district_name, best_forecast, weather, priority, forecasts)
        try:
            resp = openai_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": prompt},
                ],
                max_tokens=700,
                temperature=0.35,
                response_format={"type": "json_object"},
            )
            rec = json.loads(resp.choices[0].message.content.strip())
            rec["_source"]     = "azure_openai"
            rec["_commodity"]  = best_commodity
            rec["_confidence"] = min(92, max(55, 65 + best_forecast["data_points"] * 3))
            # Save to recommendations cache
            _save_recommendation(supabase_client, district_id, best_commodity, priority, rec)
            return rec, "azure_openai"
        except Exception as e:
            logger.error(f"OpenAI recommendation error: {e}")
            # Fall through to Gemini fallback

    # 7b. Gemini fallback
    prompt = build_prompt(best_commodity, district_name, best_forecast, weather, priority, forecasts)
    rec = _generate_with_gemini(prompt)
    if rec:
        rec["_source"]     = "gemini"
        rec["_commodity"]  = best_commodity
        rec["_confidence"] = min(90, max(55, 62 + best_forecast["data_points"] * 3))
        _save_recommendation(supabase_client, district_id, best_commodity, priority, rec)
        return rec, "gemini"

    # 8. Statistical fallback (no OpenAI)
    rec = _build_fallback_rec(best_commodity, district_name, best_forecast, weather, forecasts)
    return rec, "statistical_fallback"


def _save_recommendation(sb, district_id, commodity, priority, rec):
    """Cache recommendation to Supabase for future use."""
    try:
        sb.table("recommendations").upsert({
            "district_id": district_id,
            "commodity": commodity,
            "priority": priority,
            "recommendation_text": rec,
            "confidence": rec.get("_confidence", 75),
        }, on_conflict="district_id,commodity,priority").execute()
    except Exception as e:
        logger.warning(f"Could not cache recommendation: {e}")


def _build_fallback_rec(commodity, district_name, forecast, weather, all_forecasts):
    """Template-based recommendation when OpenAI is unavailable."""
    meta = COMMODITY_META.get(commodity, {
        "display": commodity.replace("_", " ").title(),
        "emoji": "🌱", "yield": "3–5 ton", "harvest": "60–90 hari", "yield_mid": 4.0,
    })

    cur  = int(forecast.get("current_price", 5000))
    pred = int(forecast.get("predicted_30d", cur))
    avg  = int(forecast.get("avg_price", cur))
    tpct = forecast.get("trend_pct", 0)
    tdir = "naik" if tpct >= 0 else "turun"

    today = date.today()
    m1 = (today.month % 12) + 1
    m2 = (m1 % 12) + 1
    y = today.year + (1 if m1 < today.month else 0)

    rain = weather.get("rainfall", 6) if weather else 6
    weather_note = "Curah hujan bulan ini mendukung pertumbuhan." if rain > 4 else "Pertimbangkan irigasi tambahan."
    risk = "Risiko Rendah" if abs(tpct) < 5 else "Risiko Sedang" if abs(tpct) < 15 else "Risiko Tinggi"
    trend_note = f"↑ {tpct:.0f}%/bln" if tpct > 0 else f"↓ {abs(tpct):.0f}%/bln"

    ymid = meta["yield_mid"]
    def fmt(price_mult, yield_mult=1.0):
        v = int(pred * price_mult * ymid * 1000 * 0.60 * yield_mult)
        v2 = v + 2_000_000
        return f"Rp {v//1_000_000:.0f}–{v2//1_000_000:.0f} juta"

    return {
        "name": meta["display"],
        "emoji": meta["emoji"],
        "risk": risk,
        "time": f"{MONTH_NAMES[m1-1]}–{MONTH_NAMES[m2-1]} {y}",
        "timeSub": f"Berdasarkan tren harga dan cuaca {district_name}.",
        "price": f"Rp {pred:,}/kg",
        "priceSub": trend_note,
        "yield": meta["yield"],
        "harvest": meta["harvest"],
        "reasoning": (
            f"Harga {meta['display']} di {district_name} saat ini Rp {cur:,}/kg "
            f"dengan tren {tdir} {abs(tpct):.1f}%/bulan berdasarkan data DPKP DIY. "
            f"{weather_note}"
        ),
        "scenarios": {
            "optimis": [fmt(1.15), f"Rp {int(pred*1.15):,}/kg"],
            "normal":  [fmt(1.0),  f"Rp {pred:,}/kg"],
            "pesimis": [fmt(0.85), f"Rp {int(pred*0.85):,}/kg"],
        },
        "avgPrice": avg,
        "predictedPrice": pred,
        "_source":     "statistical_fallback",
        "_commodity":  commodity,
        "_confidence": min(80, max(50, 55 + forecast.get("data_points", 1) * 3)),
    }
