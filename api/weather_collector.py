"""
Weather Collector — Azure Function Timer Trigger
Runs on 1st of every month at 00:05 WIB (UTC+7 = 17:05 UTC previous day)
Fetches Open-Meteo archive data for all 5 DIY districts → stores in weather_data table.
"""
import azure.functions as func
import json
import os
import logging
import urllib.request
import urllib.parse
from datetime import date, timedelta
from calendar import monthrange

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

app_weather = func.FunctionApp()


def get_supabase():
    """Return Supabase client or None if env vars missing."""
    try:
        from supabase import create_client
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SERVICE_KEY", "")
        if url and key:
            return create_client(url, key)
    except Exception as e:
        logger.warning("Supabase init failed: %s", e)
    return None


def fetch_open_meteo(lat: float, lon: float, start: str, end: str) -> dict | None:
    """
    Call Open-Meteo archive API for daily weather variables.
    Returns averaged monthly values: {rainfall, temperature, humidity}
    """
    params = urllib.parse.urlencode({
        "latitude": lat,
        "longitude": lon,
        "start_date": start,
        "end_date": end,
        "daily": "precipitation_sum,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean",
        "timezone": "Asia/Jakarta",
    })
    url = f"https://archive-api.open-meteo.com/v1/archive?{params}"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read())
        daily = data["daily"]

        def avg(arr):
            valid = [v for v in arr if v is not None]
            return round(sum(valid) / len(valid), 2) if valid else None

        temp_mean = [
            (mx + mn) / 2
            for mx, mn in zip(daily["temperature_2m_max"], daily["temperature_2m_min"])
        ]
        return {
            "rainfall":    avg(daily["precipitation_sum"]),
            "temperature": avg(temp_mean),
            "humidity":    avg(daily["relative_humidity_2m_mean"]),
        }
    except Exception as e:
        logger.error("Open-Meteo fetch failed lat=%s lon=%s: %s", lat, lon, e)
        return None


def collect_weather_for_month(target_date: date) -> list[dict]:
    """
    Collect weather data for a specific month across all active DIY districts.
    target_date: any date within the target month (e.g. date(2026, 5, 1))
    """
    year, month = target_date.year, target_date.month
    start = f"{year}-{month:02d}-01"
    _, last_day = monthrange(year, month)
    end = f"{year}-{month:02d}-{last_day:02d}"
    weather_date = start  # store as first-of-month

    sb = get_supabase()
    if not sb:
        logger.error("Supabase not available — aborting weather collection")
        return []

    # Get all districts from Supabase
    districts = sb.table("districts").select("id,name,latitude,longitude").execute()
    if not districts.data:
        logger.warning("No districts found in Supabase")
        return []

    records = []
    for d in districts.data:
        weather = fetch_open_meteo(
            lat=float(d["latitude"]),
            lon=float(d["longitude"]),
            start=start,
            end=end,
        )
        if not weather:
            logger.warning("Skipping district %s — no weather data", d["name"])
            continue

        record = {
            "district_id":  d["id"],
            "weather_date": weather_date,
            "rainfall":     weather["rainfall"],
            "temperature":  weather["temperature"],
            "humidity":     weather["humidity"],
        }
        records.append(record)
        logger.info(
            "Collected %s %s: rain=%.2f temp=%.2f humidity=%.2f",
            d["name"], weather_date,
            weather["rainfall"] or 0,
            weather["temperature"] or 0,
            weather["humidity"] or 0,
        )

    if records:
        # Upsert — won't duplicate if re-run on same month
        sb.table("weather_data").upsert(
            records,
            on_conflict="district_id,weather_date"
        ).execute()
        logger.info("Upserted %d weather records for %s-%02d", len(records), year, month)

    return records


# ── Timer Trigger: 1st of every month at 05:05 WIB (22:05 UTC) ───────────────
@app_weather.timer_trigger(
    schedule="0 5 22 1 * *",   # UTC: 22:05 on day 1 = 05:05 WIB on day 1
    arg_name="timer",
    run_on_startup=False,
    use_monitor=True,
)
def weather_collector_timer(timer: func.TimerRequest) -> None:
    """Monthly weather collection from Open-Meteo for all DIY districts."""
    if timer.past_due:
        logger.warning("Timer is past due — running immediately")

    # Collect for previous completed month (avoids partial data for current month)
    today = date.today()
    first_of_this_month = today.replace(day=1)
    last_month = first_of_this_month - timedelta(days=1)

    logger.info("Starting weather collection for %s-%02d", last_month.year, last_month.month)
    records = collect_weather_for_month(last_month)
    logger.info("Weather collection complete — %d records saved", len(records))


# ── HTTP Trigger: manual run / backfill ───────────────────────────────────────
@app_weather.route(route="collect-weather", methods=["POST"])
def collect_weather_manual(req: func.HttpRequest) -> func.HttpResponse:
    """
    Manually trigger weather collection for a specific year-month.
    Body: {"year": 2026, "month": 5}
    If omitted, collects for last completed month.
    """
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
    }

    try:
        body = req.get_json()
        year  = int(body.get("year",  date.today().year))
        month = int(body.get("month", date.today().month))
    except Exception:
        today = date.today().replace(day=1) - timedelta(days=1)
        year, month = today.year, today.month

    target = date(year, month, 1)
    logger.info("Manual weather collection triggered for %s-%02d", year, month)
    records = collect_weather_for_month(target)

    return func.HttpResponse(
        json.dumps({"collected": len(records), "month": f"{year}-{month:02d}", "records": records}),
        status_code=200,
        headers=headers,
    )
