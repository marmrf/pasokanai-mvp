"""
Commodity Price Scraper — Azure Function HTTP Trigger
Uses Playwright to scrape harga pangan dari Panel Harga Bapanas.
Run manually or scheduled monthly to seed commodity_prices table.

Why Playwright instead of requests?
→ Bapanas panelharga.badanpangan.go.id renders prices via JavaScript (React SPA),
  sehingga requests/BeautifulSoup tidak bisa membaca tabelnya.
  Playwright menjalankan browser headless yang bisa menunggu JS selesai render.

Usage (manual HTTP trigger):
  POST /api/scrape-prices
  Body: {"source": "bapanas", "province": "DI Yogyakarta"}
"""
import azure.functions as func
import json
import os
import logging
from datetime import date

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Commodity name mapping: Bapanas label → internal slug
COMMODITY_MAP = {
    "Beras Medium":     "padi",
    "Beras Premium":    "padi",
    "Jagung Pipilan":   "jagung",
    "Kedelai Lokal":    "kedelai",
    "Bawang Merah":     "bawang_merah",
    "Bawang Putih":     "bawang_putih",
    "Cabai Merah Besar": "cabai",
    "Cabai Rawit Merah": "cabai_rawit",
    "Tomat":            "tomat",
}

# District → province slug mapping for Bapanas filter
DISTRICT_PROVINCE = {
    "Sleman":           "DI Yogyakarta",
    "Bantul":           "DI Yogyakarta",
    "Kulon Progo":      "DI Yogyakarta",
    "Gunungkidul":      "DI Yogyakarta",
    "Kota Yogyakarta":  "DI Yogyakarta",
}


def scrape_bapanas_prices(province: str = "DI Yogyakarta") -> list[dict]:
    """
    Scrape commodity prices from Panel Harga Bapanas using Playwright.
    Returns list of {commodity, price, source_name} dicts.

    Playwright is required because:
    1. Panel Harga Bapanas is a React SPA — prices load after JS execution
    2. The price table requires JavaScript to render
    3. Simple HTTP requests cannot access the rendered table data
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.error("playwright not installed. Run: pip install playwright && playwright install chromium")
        return []

    results = []
    url = "https://panelharga.badanpangan.go.id/"

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            page.goto(url, wait_until="networkidle", timeout=30_000)

            # Filter by province if selector available
            try:
                page.select_option('select[name="provinsi"]', label=province)
                page.wait_for_timeout(2000)  # wait for table to re-render
            except Exception:
                logger.warning("Province filter not found — using default view")

            # Wait for price table
            page.wait_for_selector("table", timeout=10_000)

            # Extract rows
            rows = page.query_selector_all("table tbody tr")
            for row in rows:
                cells = row.query_selector_all("td")
                if len(cells) < 3:
                    continue
                commodity_label = cells[0].inner_text().strip()
                price_text = cells[-1].inner_text().strip()

                # Parse price: "Rp 5.500" → 5500.0
                price_clean = price_text.replace("Rp", "").replace(".", "").replace(",", ".").strip()
                try:
                    price = float(price_clean)
                except ValueError:
                    continue

                commodity_slug = COMMODITY_MAP.get(commodity_label)
                if commodity_slug:
                    results.append({
                        "commodity":    commodity_slug,
                        "price":        price,
                        "source_name":  f"Bapanas - {commodity_label}",
                    })

        except Exception as e:
            logger.error("Bapanas scrape failed: %s", e)
        finally:
            browser.close()

    logger.info("Scraped %d commodity prices from Bapanas (%s)", len(results), province)
    return results


def save_prices_to_supabase(prices: list[dict], district_ids: list[str]) -> int:
    """Insert scraped prices into commodity_prices table for all DIY districts."""
    try:
        from supabase import create_client
        sb = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_SERVICE_KEY", ""),
        )
    except Exception as e:
        logger.error("Supabase init failed: %s", e)
        return 0

    today = date.today().isoformat()
    records = []
    for district_id in district_ids:
        for p in prices:
            records.append({
                "district_id": district_id,
                "commodity":   p["commodity"],
                "price":       p["price"],
                "price_date":  today,
            })

    if records:
        sb.table("commodity_prices").insert(records).execute()

    return len(records)


# ── Register with main FunctionApp in function_app.py ────────────────────────
# This file is imported by function_app.py; the route is registered there.
# To use: add `from price_scraper import scrape_prices_handler` in function_app.py


def scrape_prices_handler(req: func.HttpRequest) -> func.HttpResponse:
    """
    HTTP Trigger handler for manual price scraping.
    Called from function_app.py route: POST /api/scrape-prices
    """
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
    }

    try:
        body = req.get_json()
        province = body.get("province", "DI Yogyakarta")
    except Exception:
        province = "DI Yogyakarta"

    # Get DIY district IDs from Supabase
    try:
        from supabase import create_client
        sb = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_SERVICE_KEY", ""),
        )
        districts = sb.table("districts").select("id").execute()
        district_ids = [d["id"] for d in (districts.data or [])]
    except Exception as e:
        return func.HttpResponse(
            json.dumps({"error": f"Database error: {e}"}),
            status_code=500, headers=headers,
        )

    prices = scrape_bapanas_prices(province)
    if not prices:
        return func.HttpResponse(
            json.dumps({"error": "No prices scraped — check Bapanas website availability"}),
            status_code=503, headers=headers,
        )

    saved = save_prices_to_supabase(prices, district_ids)
    return func.HttpResponse(
        json.dumps({
            "scraped": len(prices),
            "saved": saved,
            "province": province,
            "commodities": [p["commodity"] for p in prices],
        }),
        status_code=200, headers=headers,
    )
