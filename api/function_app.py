import azure.functions as func
import json
import os
import math
import logging
import urllib.request
import urllib.error

from openai import OpenAI, AzureOpenAI
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# Setup Application Insights logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
connection_string = os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING")
if connection_string:
    try:
        from opencensus.ext.azure.log_exporter import AzureLogHandler
        logger.addHandler(AzureLogHandler(connection_string=connection_string))
    except ImportError:
        logger.warning("opencensus not installed — Application Insights logging disabled")


def log_env_status():
    flags = {
        "supabase_url": bool(os.getenv("SUPABASE_URL")),
        "supabase_service_key": bool(os.getenv("SUPABASE_SERVICE_KEY")),
        "azure_openai_endpoint": bool(os.getenv("AZURE_OPENAI_ENDPOINT")),
        "azure_openai_key": bool(os.getenv("AZURE_OPENAI_KEY") or os.getenv("AZURE_OPENAI_API_KEY")),
        "azure_openai_deployment": bool(os.getenv("AZURE_OPENAI_DEPLOYMENT")),
        "gemini_api_key": bool(os.getenv("GEMINI_API_KEY")),
        "azure_ml_endpoint": bool(os.getenv("AZURE_ML_ENDPOINT")),
        "azure_speech_key": bool(os.getenv("AZURE_SPEECH_KEY")),
        "app_insights": bool(os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")),
    }
    logger.info("Env status (redacted): %s", flags)

def create_openai_client():
    azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    azure_key = os.getenv("AZURE_OPENAI_KEY") or os.getenv("AZURE_OPENAI_API_KEY")
    azure_deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT")
    azure_api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01")

    if azure_endpoint and azure_key:
        client = AzureOpenAI(
            azure_endpoint=azure_endpoint,
            api_key=azure_key,
            api_version=azure_api_version,
        )
        model = azure_deployment or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        return client, model, True

    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        return OpenAI(api_key=api_key), os.getenv("OPENAI_MODEL", "gpt-4o-mini"), True

    return None, os.getenv("OPENAI_MODEL", "gpt-4o-mini"), False


openai_client, MODEL, OPENAI_CONFIGURED = create_openai_client()
log_env_status()


def generate_with_gemini(prompt: str) -> str | None:
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
            "temperature": 0.7,
            "maxOutputTokens": 300,
        },
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.load(resp)
        candidates = data.get("candidates") or []
        if not candidates:
            return None
        parts = [p for p in (candidates[0].get("content", {}).get("parts") or []) if not p.get("thought")]
        text = "".join(p.get("text", "") for p in parts).strip()
        return text or None
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError) as e:
        logger.exception("Gemini error")
        return None

# Lazy-loaded Supabase client
_supabase = None

def get_supabase():
    global _supabase
    if _supabase is None:
        try:
            from supabase import create_client
            url = os.getenv("SUPABASE_URL", "")
            key = os.getenv("SUPABASE_SERVICE_KEY", "")
            if url and key:
                _supabase = create_client(url, key)
        except Exception as e:
            logger.warning(f"Supabase init failed: {e}")
    return _supabase


def get_harga_from_supabase(kabupaten: str, komoditas: str) -> dict | None:
    """Fetch latest price data from Supabase commodity_prices + districts."""
    sb = get_supabase()
    if not sb:
        return None
    try:
        # Get district id
        dist = sb.table("districts").select("id").ilike("name", f"%{kabupaten.replace('_', ' ')}%").limit(1).execute()
        if not dist.data:
            return None
        district_id = dist.data[0]["id"]

        # Get latest avg price
        price_rows = (
            sb.table("commodity_prices")
            .select("price")
            .eq("district_id", district_id)
            .eq("commodity", komoditas)
            .order("price_date", desc=True)
            .limit(1)
            .execute()
        )
        if not price_rows.data:
            return None
        avg_price = float(price_rows.data[0]["price"])
        ref_price = round(avg_price * 1.13)  # ref ≈ avg + 13% margin
        return {"avg": avg_price, "ref": ref_price}
    except Exception as e:
        logger.warning(f"Supabase price fetch failed: {e}")
        return None


def get_offtakers_from_supabase(komoditas: str, kabupaten: str) -> list:
    """Fetch buyers from Supabase and calculate distance."""
    sb = get_supabase()
    if not sb:
        return []
    try:
        dist_row = sb.table("districts").select("latitude,longitude").ilike("name", f"%{kabupaten.replace('_', ' ')}%").limit(1).execute()
        if not dist_row.data:
            return []
        origin_lat = float(dist_row.data[0]["latitude"])
        origin_lng = float(dist_row.data[0]["longitude"])

        buyers = (
            sb.table("buyers")
            .select("*")
            .eq("commodity", komoditas)
            .limit(10)
            .execute()
        )
        result = []
        for b in (buyers.data or []):
            lat = float(b.get("latitude") or 0)
            lng = float(b.get("longitude") or 0)
            jarak = hitung_jarak(origin_lat, origin_lng, lat, lng)
            result.append({
                "nama": b["name"],
                "tipe": b["buyer_type"],
                "komoditas": [komoditas],
                "lat": lat,
                "lng": lng,
                "kontak": b.get("contact", ""),
                "jarak_km": round(jarak),
            })
        result.sort(key=lambda x: x["jarak_km"])
        return result[:3]
    except Exception as e:
        logger.warning(f"Supabase buyers fetch failed: {e}")
        return []


def save_offer_to_supabase(kabupaten: str, komoditas: str, harga: float):
    """Persist middleman offer for analytics."""
    sb = get_supabase()
    if not sb:
        return
    try:
        dist = sb.table("districts").select("id").ilike("name", f"%{kabupaten.replace('_', ' ')}%").limit(1).execute()
        if not dist.data:
            return
        sb.table("middleman_offers").insert({
            "district_id": dist.data[0]["id"],
            "commodity": komoditas,
            "offered_price": harga,
        }).execute()
    except Exception as e:
        logger.warning(f"Save offer failed: {e}")


# ── Fallback hardcoded prices (used if Supabase unavailable) ──────────────
HARGA_ACUAN_FALLBACK = {
    "sleman":       {"padi": {"avg": 6300, "ref": 6600}, "jagung": {"avg": 4600, "ref": 5200}, "cabai_rawit": {"avg": 45000, "ref": 50000}, "cabai": {"avg": 35000, "ref": 38000}},
    "bantul":       {"padi": {"avg": 6500, "ref": 6800}, "bawang_merah": {"avg": 25000, "ref": 28000}},
    "gunungkidul":  {"kacang_tanah": {"avg": 12500, "ref": 14000}, "singkong": {"avg": 1600, "ref": 1800}},
    "kulon_progo":  {"padi": {"avg": 6200, "ref": 6500}, "bawang_merah": {"avg": 24000, "ref": 27000}},
    "kota_yogyakarta": {"cabai_rawit": {"avg": 46000, "ref": 50000}, "sayuran_daun": {"avg": 5500, "ref": 6000}},
    "klaten":       {"padi": {"avg": 6600, "ref": 6900}, "tembakau": {"avg": 60000, "ref": 65000}},
    "magelang":     {"cabai_rawit": {"avg": 48000, "ref": 52000}, "sayuran_daun": {"avg": 5500, "ref": 6000}},
    "brebes":       {"bawang_merah": {"avg": 27000, "ref": 30000}},
    "malang":       {"kentang": {"avg": 12500, "ref": 14000}, "wortel": {"avg": 7800, "ref": 8500}},
    "jember":       {"edamame": {"avg": 11000, "ref": 12000}, "kedelai": {"avg": 9800, "ref": 10500}},
}

OFFTAKER_FALLBACK = [
    {"nama": "Koperasi Tani Makmur Sleman", "tipe": "koperasi", "komoditas": ["padi","jagung"], "lat": -7.728, "lng": 110.405, "kontak": "Pakem, Sleman"},
    {"nama": "KUD Sumber Tani Bantul", "tipe": "koperasi", "komoditas": ["padi","bawang_merah"], "lat": -7.891, "lng": 110.326, "kontak": "Sewon, Bantul"},
    {"nama": "BULOG Sub Divre Yogyakarta", "tipe": "bulog", "komoditas": ["padi","jagung"], "lat": -7.795, "lng": 110.369, "kontak": "Yogyakarta"},
    {"nama": "Pasar Induk Giwangan", "tipe": "offtaker", "komoditas": ["cabai","bawang_merah","sayuran_daun","cabai_rawit"], "lat": -7.832, "lng": 110.388, "kontak": "Giwangan, Yogyakarta"},
    {"nama": "TaniHub Yogyakarta", "tipe": "offtaker", "komoditas": ["cabai","cabai_rawit","sayuran_daun","bawang_merah"], "lat": -7.797, "lng": 110.370, "kontak": "Online, pickup mitra"},
    {"nama": "Koperasi Singkong Karangmojo", "tipe": "koperasi", "komoditas": ["singkong","kacang_tanah"], "lat": -7.970, "lng": 110.630, "kontak": "Karangmojo, Gunungkidul"},
]

KAB_KOORDINAT_FALLBACK = {
    "sleman": {"lat": -7.732, "lng": 110.401},
    "bantul": {"lat": -7.888, "lng": 110.328},
    "gunungkidul": {"lat": -7.966, "lng": 110.616},
    "kulon_progo": {"lat": -7.900, "lng": 110.160},
    "kota_yogyakarta": {"lat": -7.797, "lng": 110.370},
    "klaten": {"lat": -7.705, "lng": 110.606},
    "magelang": {"lat": -7.479, "lng": 110.217},
    "brebes": {"lat": -6.871, "lng": 109.042},
    "malang": {"lat": -7.983, "lng": 112.621},
    "jember": {"lat": -8.172, "lng": 113.698},
}


def hitung_jarak(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def cari_offtaker_fallback(kabupaten, komoditas, max_hasil=3):
    koordinat = KAB_KOORDINAT_FALLBACK.get(kabupaten)
    if not koordinat:
        return []
    hasil = []
    for o in OFFTAKER_FALLBACK:
        if komoditas in o["komoditas"]:
            jarak = hitung_jarak(koordinat["lat"], koordinat["lng"], o["lat"], o["lng"])
            hasil.append({**o, "jarak_km": round(jarak)})
    hasil.sort(key=lambda x: x["jarak_km"])
    return hasil[:max_hasil]


def buat_anchor(komoditas, kabupaten, harga_tawaran, harga_avg, harga_ref, selisih, luas_ha, total_loss):
    """Returns (anchor_text, is_ai_generated)."""
    lokasi_label = kabupaten.replace("_", " ").title()
    prompt = f"""Kamu adalah asisten PasokanAI yang membantu petani Indonesia bernegosiasi harga dengan tengkulak.

Situasi:
- Petani di {lokasi_label} ingin menjual {komoditas.replace('_',' ')}
- Harga yang ditawarkan tengkulak: Rp {harga_tawaran:,}/kg
- Harga rata-rata petani sekitar: Rp {harga_avg:,}/kg
- Harga referensi pasar: Rp {harga_ref:,}/kg
- Selisih: Rp {selisih:,}/kg
- Luas lahan: {luas_ha} hektare
- Potensi kerugian: Rp {total_loss:,.0f}

Tulis SATU kalimat negosiasi anchor dalam Bahasa Indonesia yang sederhana, sopan, dan bisa langsung diucapkan petani ke tengkulak. Maksimal 2 kalimat. Gunakan data di atas sebagai argumen. Jangan gunakan kata teknis."""

    if openai_client:
        try:
            response = openai_client.chat.completions.create(
                model=MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=150,
                temperature=0.7
            )
            return response.choices[0].message.content.strip(), True
        except Exception as e:
            logger.error(f"OpenAI error: {e}")

    gemini_text = generate_with_gemini(prompt)
    if gemini_text:
        return gemini_text, True

    fallback = (
        f"Pak/Bu, harga rata-rata {komoditas.replace('_',' ')} di {lokasi_label} "
        f"minggu ini Rp {harga_avg:,}/kg. Tawaran Rp {harga_tawaran:,}/kg selisihnya "
        f"Rp {selisih:,}/kg. Apakah bisa kita bicarakan lagi?"
    )
    return fallback, False


@app.route(route="gap-check", methods=["POST"])
def gap_check(req: func.HttpRequest) -> func.HttpResponse:
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    }

    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=200, headers=headers)

    try:
        body = req.get_json()
    except Exception:
        return func.HttpResponse(json.dumps({"error": "Request body tidak valid"}), status_code=400, headers=headers)

    komoditas = str(body.get("komoditas", "")).lower().strip().replace(" ", "_")
    kabupaten = str(body.get("kabupaten", "")).lower().strip()
    harga_tawaran = body.get("harga_tawaran", 0)
    luas_ha = body.get("luas_ha", 1)

    logger.info(f"Gap check — komoditas: {komoditas}, kabupaten: {kabupaten}, harga: {harga_tawaran}")

    if not komoditas or not kabupaten:
        return func.HttpResponse(json.dumps({"error": "komoditas dan kabupaten wajib diisi"}), status_code=400, headers=headers)

    try:
        harga_tawaran = float(harga_tawaran)
        luas_ha = max(0.1, min(float(luas_ha), 1000))
    except Exception:
        return func.HttpResponse(json.dumps({"error": "harga_tawaran dan luas_ha harus angka"}), status_code=400, headers=headers)

    if harga_tawaran <= 0 or harga_tawaran > 10_000_000:
        return func.HttpResponse(json.dumps({"error": "harga_tawaran tidak valid"}), status_code=400, headers=headers)

    # Try Supabase first, track data source for _meta
    data_harga = get_harga_from_supabase(kabupaten, komoditas)
    prices_source = "supabase" if data_harga else "fallback"
    if not data_harga:
        data_harga = HARGA_ACUAN_FALLBACK.get(kabupaten, {}).get(komoditas)
    if not data_harga:
        return func.HttpResponse(
            json.dumps({"error": f"Data harga untuk {komoditas} di {kabupaten} belum tersedia"}),
            status_code=404, headers=headers
        )

    harga_avg = data_harga["avg"]
    harga_ref = data_harga["ref"]
    selisih = harga_avg - harga_tawaran
    gap_pct = (selisih / harga_avg) * 100

    YIELD_PER_HA = {
        "padi": 5500, "jagung": 4500, "bawang_merah": 8000,
        "cabai_rawit": 7000, "cabai": 7000, "kacang_tanah": 2500,
        "singkong": 17500, "tembakau": 1750, "sayuran_daun": 10000,
        "kentang": 20000, "wortel": 22500, "edamame": 7000, "kedelai": 2150,
    }
    estimasi_yield_kg = YIELD_PER_HA.get(komoditas, 5000) * luas_ha
    total_loss = max(0, selisih * estimasi_yield_kg)

    # Try Supabase buyers first, then fallback
    offtaker = get_offtakers_from_supabase(komoditas, kabupaten)
    buyers_source = "supabase" if offtaker else "fallback"
    if not offtaker:
        offtaker = cari_offtaker_fallback(kabupaten, komoditas)

    anchor_is_ai = False
    if gap_pct >= 15:
        anchor, anchor_is_ai = buat_anchor(
            komoditas, kabupaten, harga_tawaran,
            harga_avg, harga_ref, selisih, luas_ha, total_loss
        )
        gap_status = "alert"
        try:
            save_offer_to_supabase(kabupaten, komoditas, harga_tawaran)
        except Exception:
            pass
    else:
        anchor = None
        gap_status = "fair"

    logger.info(f"Gap check result — status: {gap_status}, gap_pct: {round(gap_pct, 1)}")

    result = {
        "status": gap_status,
        "komoditas": komoditas,
        "kabupaten": kabupaten,
        "harga_tawaran": harga_tawaran,
        "harga_avg": harga_avg,
        "harga_ref": harga_ref,
        "selisih_per_kg": round(selisih),
        "gap_persen": round(gap_pct, 1),
        "estimasi_yield_kg": round(estimasi_yield_kg),
        "total_loss_rupiah": round(total_loss),
        "negosiasi_anchor": anchor,
        "offtaker_terdekat": offtaker,
        "_meta": {
            "prices_source": prices_source,
            "buyers_source": buyers_source,
            "ai_anchor": anchor_is_ai,
            "supabase_connected": get_supabase() is not None,
            "openai_configured": OPENAI_CONFIGURED or bool(os.getenv("GEMINI_API_KEY")),
        },
    }

    return func.HttpResponse(json.dumps(result, ensure_ascii=False), status_code=200, headers=headers)


# ── AI Recommendation ────────────────────────────────────────────────────────
@app.route(route="generate-recommendation", methods=["POST", "OPTIONS"])
def generate_recommendation_route(req: func.HttpRequest) -> func.HttpResponse:
    """
    AI-powered crop recommendation.
    Reads commodity_prices + weather_data from Supabase,
    calculates statistical forecast, then asks Azure OpenAI to interpret it.
    Falls back to template if OpenAI not configured.
    Body: {district_id, priority}
    """
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=200, headers=headers)

    try:
        body = req.get_json()
    except Exception:
        return func.HttpResponse(json.dumps({"error": "Invalid body"}), status_code=400, headers=headers)

    district_id = body.get("district_id", "").strip()
    priority = body.get("priority", "profit")

    if not district_id:
        return func.HttpResponse(json.dumps({"error": "district_id wajib diisi"}), status_code=400, headers=headers)

    from recommendation_engine import generate_recommendation
    try:
        rec, source = generate_recommendation(district_id, priority, get_supabase(), openai_client, MODEL)
    except Exception as e:
        logger.error(f"generate_recommendation error: {e}")
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, headers=headers)

    if rec is None:
        return func.HttpResponse(
            json.dumps({"error": f"Tidak ada data untuk district ini ({source})"}),
            status_code=404, headers=headers
        )

    return func.HttpResponse(json.dumps(rec, ensure_ascii=False), status_code=200, headers=headers)


# ── Service Status ────────────────────────────────────────────────────────────
@app.route(route="service-status", methods=["GET", "OPTIONS"])
def service_status(req: func.HttpRequest) -> func.HttpResponse:
    """Returns status of all Azure and external services. Used by dev banner."""
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
    }
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=200, headers=headers)

    sb_connected = get_supabase() is not None
    openai_key = OPENAI_CONFIGURED
    gemini_key = bool(os.getenv("GEMINI_API_KEY"))
    azure_ml = bool(os.getenv("AZURE_ML_ENDPOINT"))
    speech_key = bool(os.getenv("AZURE_SPEECH_KEY"))
    app_insights = bool(os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING"))

    fallback_data = []
    if not sb_connected:
        fallback_data.extend(["prices", "buyers"])
    if not openai_key and not gemini_key:
        fallback_data.append("ai_anchor")

    connected_count = sum([sb_connected, (openai_key or gemini_key), True])  # open_meteo always works
    total_required = 3  # supabase, llm, open_meteo

    if connected_count == total_required and not fallback_data:
        data_mode = "full"
    elif fallback_data:
        data_mode = "fallback" if not sb_connected else "partial"
    else:
        data_mode = "partial"

    payload = {
        "services": {
            "supabase": {
                "connected": sb_connected,
                "note": "9 tables, RLS enabled" if sb_connected else "Set SUPABASE_URL + SUPABASE_SERVICE_KEY",
            },
            "openai": {
                "connected": openai_key,
                "note": "GPT-4o-mini negotiation anchor" if openai_key else "Set AZURE_OPENAI_* or OPENAI_API_KEY",
            },
            "gemini": {
                "connected": gemini_key,
                "note": "Gemini fallback" if gemini_key else "Set GEMINI_API_KEY",
            },
            "open_meteo": {
                "connected": True,
                "note": "Free API — no key needed",
            },
            "azure_ml": {
                "connected": azure_ml,
                "planned": not azure_ml,
                "note": "Prophet forecasting — Phase 4" if not azure_ml else "Connected",
            },
            "azure_speech": {
                "connected": speech_key,
                "planned": not speech_key,
                "note": "Voice input — Phase 10" if not speech_key else "Connected",
            },
            "app_insights": {
                "connected": app_insights,
                "note": "Monitoring optional" if not app_insights else "Connected",
            },
        },
        "data_mode": data_mode,
        "fallback_data": fallback_data,
    }

    return func.HttpResponse(json.dumps(payload), status_code=200, headers=headers)


# ── Health Check ────────────────────────────────────────────────────────────
@app.route(route="health-check", methods=["GET"])
def health_check(req: func.HttpRequest) -> func.HttpResponse:
    """Quick diagnostic endpoint for env + Supabase connectivity."""
    env_flags = {
        "SUPABASE_URL": bool(os.getenv("SUPABASE_URL")),
        "SUPABASE_SERVICE_KEY": bool(os.getenv("SUPABASE_SERVICE_KEY")),
        "AZURE_OPENAI_ENDPOINT": bool(os.getenv("AZURE_OPENAI_ENDPOINT")),
        "AZURE_OPENAI_KEY": bool(os.getenv("AZURE_OPENAI_KEY") or os.getenv("AZURE_OPENAI_API_KEY")),
        "AZURE_OPENAI_DEPLOYMENT": bool(os.getenv("AZURE_OPENAI_DEPLOYMENT")),
        "AZURE_OPENAI_API_VERSION": bool(os.getenv("AZURE_OPENAI_API_VERSION")),
        "GEMINI_API_KEY": bool(os.getenv("GEMINI_API_KEY")),
        "AZURE_SPEECH_KEY": bool(os.getenv("AZURE_SPEECH_KEY")),
        "APPLICATIONINSIGHTS_CONNECTION_STRING": bool(os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")),
    }

    sb_test = {"ok": False, "error": None}
    sb = get_supabase()
    if sb:
        try:
            sb.table("districts").select("id").limit(1).execute()
            sb_test["ok"] = True
        except Exception as e:
            sb_test["error"] = str(e)

    payload = {
        "env": env_flags,
        "supabase": sb_test,
        "openai_configured": OPENAI_CONFIGURED,
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
    }

    return func.HttpResponse(json.dumps(payload), status_code=200, headers={"Content-Type": "application/json"})


# ── Weather Collection ────────────────────────────────────────────────────────
@app.timer_trigger(
    schedule="0 5 22 1 * *",
    arg_name="timer",
    run_on_startup=False,
    use_monitor=True,
)
def weather_collector_timer(timer: func.TimerRequest) -> None:
    """Monthly weather collection — 05:05 WIB on the 1st of each month."""
    from weather_collector import weather_collector_timer as _run
    _run(timer)


@app.route(route="collect-weather", methods=["POST"])
def collect_weather(req: func.HttpRequest) -> func.HttpResponse:
    """Manual trigger for Open-Meteo weather collection. Body: {year, month}"""
    from weather_collector import collect_weather_manual
    return collect_weather_manual(req)


# ── Price Forecast (read from forecast_results) ───────────────────────────────
@app.route(route="forecast", methods=["GET", "OPTIONS"])
def get_forecast(req: func.HttpRequest) -> func.HttpResponse:
    """
    Returns historical + 90-day forecast data for charting.
    Forecast is generated by api/prophet_forecaster.py (Phase 4A local)
    and will be generated by Azure ML in Phase 4B.

    Query params: district_id, commodity, historical_months (default 6)
    Response: { historical: [{date, price}], forecast: [{date, yhat, yhat_lower, yhat_upper}] }
    """
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
    }
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=200, headers=headers)

    district_id = req.params.get("district_id", "").strip()
    commodity   = req.params.get("commodity", "").strip().lower().replace(" ", "_")
    try:
        hist_months = max(3, min(24, int(req.params.get("historical_months", "6"))))
    except ValueError:
        hist_months = 6

    if not district_id or not commodity:
        return func.HttpResponse(
            json.dumps({"error": "district_id dan commodity wajib diisi"}),
            status_code=400, headers=headers,
        )

    sb = get_supabase()
    if not sb:
        return func.HttpResponse(
            json.dumps({"error": "Database tidak tersedia"}),
            status_code=503, headers=headers,
        )

    try:
        from datetime import date as _date, timedelta, datetime as _dt

        # District name
        dist = sb.table("districts").select("name").eq("id", district_id).single().execute()
        district_name = dist.data["name"] if dist.data else district_id

        # Historical prices (latest N months)
        hist_rows = (
            sb.table("commodity_prices")
            .select("price, price_date")
            .eq("district_id", district_id)
            .eq("commodity", commodity)
            .order("price_date", desc=True)
            .limit(hist_months)
            .execute()
        )
        historical = [
            {"date": r["price_date"][:10], "price": float(r["price"])}
            for r in reversed(hist_rows.data or [])
        ]

        # Forecast data — prefer Prophet rows (many dates), fallback to linear
        today_str = str(_date.today())
        fcast_rows = (
            sb.table("forecast_results")
            .select("forecast_price, confidence, forecast_date")
            .eq("district_id", district_id)
            .eq("commodity", commodity)
            .gte("forecast_date", today_str)
            .order("forecast_date")
            .limit(90)
            .execute()
        )

        forecast_source = "none"
        forecast = []

        if fcast_rows.data and len(fcast_rows.data) >= 10:
            # Prophet data available — compute confidence band from stored confidence
            forecast_source = "prophet_local"
            for r in fcast_rows.data:
                yhat = float(r["forecast_price"])
                conf = float(r.get("confidence") or 75)
                band_pct = (100 - conf) / 200          # e.g. 80% conf → ±10%
                forecast.append({
                    "date": r["forecast_date"][:10],
                    "yhat": round(yhat),
                    "yhat_lower": round(yhat * (1 - band_pct)),
                    "yhat_upper": round(yhat * (1 + band_pct)),
                })

        elif historical:
            # Linear trend projection — used before Prophet runs
            forecast_source = "linear_trend"
            prices = [h["price"] for h in historical]
            n = len(prices)
            monthly_trend = (prices[-1] - prices[0]) / max(1, n - 1) if n >= 2 else 0

            last_dt = _dt.strptime(historical[-1]["date"], "%Y-%m-%d")
            for i in range(1, 91):
                d = last_dt + timedelta(days=i)
                yhat = max(100.0, prices[-1] + monthly_trend * (i / 30.0))
                # ±15% confidence band for linear trend (wider = less certain)
                forecast.append({
                    "date": d.strftime("%Y-%m-%d"),
                    "yhat": round(yhat),
                    "yhat_lower": round(yhat * 0.85),
                    "yhat_upper": round(yhat * 1.15),
                })

        result = {
            "commodity": commodity,
            "district": district_name,
            "historical": historical,
            "forecast": forecast,
            "forecast_source": forecast_source,
        }

        logger.info(f"Forecast — {commodity}/{district_id}: {len(historical)} hist, {len(forecast)} fcast ({forecast_source})")
        return func.HttpResponse(json.dumps(result, ensure_ascii=False), status_code=200, headers=headers)

    except Exception:
        logger.exception("Forecast endpoint error")
        return func.HttpResponse(json.dumps({"error": "Internal server error"}), status_code=500, headers=headers)


# ── Commodity Price Scraper ───────────────────────────────────────────────────
@app.route(route="scrape-prices", methods=["POST"])
def scrape_prices(req: func.HttpRequest) -> func.HttpResponse:
    """Scrape commodity prices from Bapanas using Playwright. Body: {province}"""
    from price_scraper import scrape_prices_handler
    return scrape_prices_handler(req)
