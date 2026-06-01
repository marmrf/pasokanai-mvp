"""
PasokanAI — Local Prophet Forecaster  (Phase 4A)
=================================================
Train Prophet per komoditas × kabupaten, simpan model ke api/models/,
dan simpan prediksi 90 hari ke Supabase forecast_results.

Usage:
  python api/prophet_forecaster.py                          # semua (load model jika ada)
  python api/prophet_forecaster.py --force                  # paksa retrain semua
  python api/prophet_forecaster.py --district sleman        # satu kabupaten
  python api/prophet_forecaster.py --commodity cabai        # satu komoditas
  python api/prophet_forecaster.py --predict-only           # hanya generate prediksi (tidak train)

Flow:
  commodity_prices (Supabase)
    → train Prophet  → simpan ke api/models/<district>_<commodity>.json
    → predict 90 hari → simpan ke forecast_results (Supabase)
    → Azure Functions GET /api/forecast membaca forecast_results

Arsitektur:
  Phase 4A (sekarang) : script ini, GitHub Actions otomatis bulanan
  Phase 4B (planned)  : pipeline dipindah ke Azure ML (kode sama, env berbeda)
"""

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

# ── Windows terminal encoding fix ────────────────────────────────────────────
import io
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ── Direktori model ───────────────────────────────────────────────────────────
MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

# ── Load api/local.settings.json → environment ───────────────────────────────
_settings_path = Path(__file__).parent / "local.settings.json"
if _settings_path.exists():
    with open(_settings_path) as _f:
        _s = json.load(_f)
    for _k, _v in _s.get("Values", {}).items():
        if not os.environ.get(_k):
            os.environ[_k] = str(_v)

# ── Dependency check ──────────────────────────────────────────────────────────
try:
    import pandas as pd
    import numpy as np
except ImportError:
    print("ERROR: pandas/numpy tidak terinstall. Jalankan: pip install prophet pandas numpy")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("ERROR: supabase tidak terinstall. Jalankan: pip install supabase")
    sys.exit(1)

# ── Konfigurasi ───────────────────────────────────────────────────────────────

DISTRICT_IDS = {
    "sleman":          "11111111-1111-1111-1111-111111111101",
    "bantul":          "11111111-1111-1111-1111-111111111102",
    "kulon_progo":     "11111111-1111-1111-1111-111111111103",
    "gunungkidul":     "11111111-1111-1111-1111-111111111104",
    "kota_yogyakarta": "11111111-1111-1111-1111-111111111105",
}

COMMODITIES = [
    "padi", "jagung", "cabai", "cabai_rawit", "bawang_merah",
    "kacang_tanah", "kedelai", "singkong", "sayuran_daun",
]

FORECAST_DAYS = 90
MIN_DATA_POINTS = 12
MODEL_VERSION = "v1.2"   # ganti ini saat hyperparameter berubah

# Riwayat versi:
#   v1.0  — multiplicative, changepoint=0.05, seasonality=5  → terlalu ekstrem (cabai +119%)
#   v1.1  — additive, changepoint=0.01, seasonality=1, hard-cap ±35%  → lebih stabil
#   v1.2  — additive, changepoint=0.005, seasonality=0.5, hard-cap ±20%  → konservatif, realistis

# Registry semua versi tersimpan
REGISTRY_PATH = MODELS_DIR / "versions.json"


# ── Path helpers ──────────────────────────────────────────────────────────────

def version_dir(version: str) -> Path:
    """Direktori untuk satu versi: api/models/v1.1/"""
    d = MODELS_DIR / version
    d.mkdir(parents=True, exist_ok=True)
    return d

def model_path(district_slug: str, commodity: str, version: str) -> Path:
    return version_dir(version) / f"{district_slug}_{commodity}.json"

def meta_path(district_slug: str, commodity: str, version: str) -> Path:
    return version_dir(version) / f"{district_slug}_{commodity}_meta.json"

def list_versions() -> list:
    """Kembalikan semua versi yang ada di api/models/, terurut."""
    return sorted([d.name for d in MODELS_DIR.iterdir() if d.is_dir() and d.name.startswith("v")])

def load_registry() -> dict:
    if REGISTRY_PATH.exists():
        return json.load(open(REGISTRY_PATH, encoding="utf-8"))
    return {}

def save_registry(registry: dict):
    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)


# ── Supabase ──────────────────────────────────────────────────────────────────

def load_supabase():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL dan SUPABASE_SERVICE_KEY wajib ada di env atau local.settings.json")
    return create_client(url, key)


def fetch_prices(sb, district_id: str, commodity: str) -> "pd.DataFrame":
    rows = (
        sb.table("commodity_prices")
        .select("price_date, price")
        .eq("district_id", district_id)
        .eq("commodity", commodity)
        .order("price_date")
        .execute()
    )
    if not rows.data:
        return pd.DataFrame(columns=["ds", "y"])
    df = pd.DataFrame(rows.data)
    df["ds"] = pd.to_datetime(df["price_date"])
    df["y"]  = pd.to_numeric(df["price"], errors="coerce")
    return df[["ds", "y"]].dropna().sort_values("ds").reset_index(drop=True)


def save_forecasts(sb, district_id: str, commodity: str, forecast_df: "pd.DataFrame") -> int:
    rows = []
    for _, row in forecast_df.iterrows():
        yhat = float(row["yhat"])
        yl   = float(row["yhat_lower"])
        yu   = float(row["yhat_upper"])
        band = (yu - yl) / (2 * max(yhat, 1))
        conf = round(max(50.0, min(95.0, 100.0 * (1 - band))), 1)
        rows.append({
            "district_id":   district_id,
            "commodity":     commodity,
            "forecast_price": round(yhat, 2),
            "confidence":    conf,
            "forecast_date": row["ds"].strftime("%Y-%m-%d"),
        })
    saved = 0
    for i in range(0, len(rows), 50):
        try:
            sb.table("forecast_results").upsert(
                rows[i:i+50],
                on_conflict="district_id,commodity,forecast_date",
            ).execute()
            saved += len(rows[i:i+50])
        except Exception as e:
            print(f"    WARN batch {i//50}: {e}")
    return saved


# ── Model — simpan & load ─────────────────────────────────────────────────────

def save_model(model, district_slug: str, commodity: str, meta: dict, version: str):
    """Simpan model ke api/models/<version>/<district>_<commodity>.json"""
    from prophet.serialize import model_to_json
    mp = model_path(district_slug, commodity, version)
    mt = meta_path(district_slug, commodity, version)
    with open(mp, "w", encoding="utf-8") as f:
        f.write(model_to_json(model))
    with open(mt, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    # Update registry
    reg = load_registry()
    if version not in reg:
        reg[version] = {
            "created_at":    str(date.today()),
            "model_version": version,
            "hyperparams": {
                "v1.1": {"changepoint": 0.01,  "seasonality": 1.0, "hard_cap_pct": 0.35},
                "v1.2": {"changepoint": 0.005, "seasonality": 0.5, "hard_cap_pct": 0.20},
            }.get(version, {}),
            "models": [],
        }
    key = f"{district_slug}_{commodity}"
    if key not in reg[version]["models"]:
        reg[version]["models"].append(key)
    save_registry(reg)
    return mp


def load_model(district_slug: str, commodity: str, version: str):
    """Load model dari versi tertentu. Return (model, meta) atau (None, None)."""
    mp = model_path(district_slug, commodity, version)
    mt = meta_path(district_slug, commodity, version)
    if not mp.exists():
        return None, None
    try:
        from prophet.serialize import model_from_json
        with open(mp, "r", encoding="utf-8") as f:
            model = model_from_json(f.read())
        meta = json.load(open(mt, encoding="utf-8")) if mt.exists() else {}
        return model, meta
    except Exception as e:
        print(f"    WARN load model gagal ({e}) — akan retrain")
        return None, None


# ── Prophet — train & predict ─────────────────────────────────────────────────

def _compute_bounds(df: "pd.DataFrame"):
    hist_min = float(df["y"].min())
    hist_max = float(df["y"].max())
    return hist_min * 0.60, hist_max * 1.50


def train_model(df: "pd.DataFrame", floor: float, cap: float):
    """Latih Prophet model baru. Return model yang sudah di-fit."""
    try:
        from prophet import Prophet
    except ImportError:
        print("ERROR: prophet tidak terinstall. Jalankan: pip install prophet")
        sys.exit(1)

    df_fit = df.copy()
    df_fit["floor"] = floor
    df_fit["cap"]   = cap

    # Hyperparameter per versi — sesuaikan MODEL_VERSION di atas
    _HP = {
        "v1.1": dict(changepoint_prior_scale=0.01,  seasonality_prior_scale=1.0,  hard_cap_pct=0.35),
        "v1.2": dict(changepoint_prior_scale=0.005, seasonality_prior_scale=0.5,  hard_cap_pct=0.20),
    }
    hp = _HP.get(MODEL_VERSION, _HP["v1.2"])

    model = Prophet(
        growth="logistic",
        seasonality_mode="additive",
        yearly_seasonality=True,
        weekly_seasonality=False,
        daily_seasonality=False,
        changepoint_prior_scale=hp["changepoint_prior_scale"],
        seasonality_prior_scale=hp["seasonality_prior_scale"],
        interval_width=0.80,
    )
    model.add_seasonality(name="monthly", period=30.5, fourier_order=2)
    model.fit(df_fit)
    return model, hp["hard_cap_pct"]


def predict(model, df: "pd.DataFrame", floor: float, cap: float,
            hard_cap_pct: float = 0.20) -> "pd.DataFrame":
    """Generate 90-day forecast dari model yang sudah di-fit."""
    future = model.make_future_dataframe(periods=FORECAST_DAYS, freq="D")
    future["floor"] = floor
    future["cap"]   = cap
    forecast = model.predict(future)

    last_actual = df["ds"].max()
    fcast = forecast[forecast["ds"] > last_actual].copy()

    # Hard cap ±X% dari harga bulan terakhir (X ditentukan per versi)
    last_price = float(df["y"].iloc[-1])
    hf = last_price * (1 - hard_cap_pct)
    hc = last_price * (1 + hard_cap_pct)
    for col in ["yhat", "yhat_lower", "yhat_upper"]:
        fcast[col] = fcast[col].clip(lower=hf, upper=hc)

    return fcast[["ds", "yhat", "yhat_lower", "yhat_upper"]]


# ── Runner per komoditas ──────────────────────────────────────────────────────

def run_one(sb, district_slug: str, district_id: str, commodity: str,
            version: str, force: bool = False, predict_only: bool = False) -> str:

    df = fetch_prices(sb, district_id, commodity)
    if len(df) < MIN_DATA_POINTS:
        return f"  SKIP   {district_slug}/{commodity}: {len(df)} data (min {MIN_DATA_POINTS})"

    floor, cap = _compute_bounds(df)
    last_price = float(df["y"].iloc[-1])

    try:
        model = None
        action = ""

        if predict_only:
            model, meta = load_model(district_slug, commodity, version)
            if model is None:
                return f"  SKIP   {district_slug}/{commodity}: model {version} belum ada (jalankan tanpa --predict-only)"
            action = f"LOADED {version}"

        elif not force:
            model, meta = load_model(district_slug, commodity, version)
            if model is not None:
                action = f"LOADED {version}"

        hard_cap_pct = 0.20  # default
        if model is None:
            model, hard_cap_pct = train_model(df, floor, cap)
            meta = {
                "district":       district_slug,
                "commodity":      commodity,
                "version":        version,
                "trained_at":     str(date.today()),
                "data_points":    len(df),
                "floor":          round(floor, 2),
                "cap":            round(cap, 2),
                "last_price":     round(last_price, 2),
                "hard_cap_pct":   hard_cap_pct,
            }
            mp = save_model(model, district_slug, commodity, meta, version)
            action = f"TRAINED → {version}/{mp.name}"
        else:
            hard_cap_pct = meta.get("hard_cap_pct", 0.20)

        forecast_df = predict(model, df, floor, cap, hard_cap_pct)
        n = save_forecasts(sb, district_id, commodity, forecast_df)

        last_fcast = float(forecast_df["yhat"].iloc[-1])
        trend = ((last_fcast - last_price) / last_price * 100) if last_price else 0
        sign = "+" if trend >= 0 else ""

        return (
            f"  OK     {district_slug}/{commodity} [{action}]: "
            f"{n} hari | Rp {last_price:,.0f} → Rp {last_fcast:,.0f} ({sign}{trend:.1f}%)"
        )

    except Exception as e:
        return f"  ERROR  {district_slug}/{commodity}: {e}"


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="PasokanAI — Prophet Forecaster",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Contoh:
  python api/prophet_forecaster.py                       # semua, load jika ada
  python api/prophet_forecaster.py --force               # retrain semua
  python api/prophet_forecaster.py --predict-only        # hanya generate prediksi
  python api/prophet_forecaster.py --district sleman     # satu kabupaten
  python api/prophet_forecaster.py --commodity padi --force
        """,
    )
    parser.add_argument("--district",     help="Kabupaten spesifik")
    parser.add_argument("--commodity",    help="Komoditas spesifik")
    parser.add_argument("--version",      default=MODEL_VERSION, help=f"Versi model (default: {MODEL_VERSION})")
    parser.add_argument("--force",        action="store_true", help="Paksa retrain, simpan sebagai --version")
    parser.add_argument("--predict-only", action="store_true", help="Hanya generate prediksi dari model yang ada")
    parser.add_argument("--list-versions", action="store_true", help="Tampilkan semua versi tersimpan")
    args = parser.parse_args()

    # List versions
    if args.list_versions:
        versions = list_versions()
        reg = load_registry()
        print(f"\nVersi tersimpan di api/models/ ({len(versions)} versi):\n")
        for v in versions:
            info = reg.get(v, {})
            n_models = len(info.get("models", []))
            print(f"  {v}  |  {info.get('created_at','?')}  |  {n_models} model")
        print()
        return

    version = args.version
    mode = f"FORCE RETRAIN ({version})" if args.force else \
           (f"PREDICT ONLY ({version})" if args.predict_only else f"AUTO load/train ({version})")

    versions_available = list_versions()
    print("=" * 70)
    print("PasokanAI — Local Prophet Forecaster  (Phase 4A)")
    print(f"Mode             : {mode}")
    print(f"Forecast horizon : {FORECAST_DAYS} hari ke depan")
    print(f"Model directory  : {MODELS_DIR}")
    print(f"Versi tersimpan  : {versions_available or '(belum ada)'}")
    print("=" * 70)

    sb = load_supabase()
    print("Terhubung ke Supabase")

    vdir = version_dir(version)
    existing = [f for f in vdir.glob("*.json") if "_meta" not in f.name]
    print(f"Model {version}      : {len(existing)} / 45 tersimpan")

    districts = (
        {args.district: DISTRICT_IDS[args.district]}
        if args.district and args.district in DISTRICT_IDS
        else DISTRICT_IDS
    )
    commodities = (
        [args.commodity]
        if args.commodity and args.commodity in COMMODITIES
        else COMMODITIES
    )

    stats = {"ok": 0, "skip": 0, "error": 0, "trained": 0, "loaded": 0}

    for slug, did in districts.items():
        print(f"\n[{slug.replace('_', ' ').title()}]")
        for commodity in commodities:
            result = run_one(sb, slug, did, commodity,
                             version=version,
                             force=args.force,
                             predict_only=args.predict_only)
            print(result)
            if "OK" in result:
                stats["ok"] += 1
                if "TRAINED" in result:
                    stats["trained"] += 1
                elif "LOADED" in result:
                    stats["loaded"] += 1
            elif "SKIP" in result:
                stats["skip"] += 1
            else:
                stats["error"] += 1

    total_models = len([f for f in version_dir(version).glob("*.json") if "_meta" not in f.name])

    print("\n" + "=" * 70)
    print(f"Selesai  : {stats['ok']} OK  ({stats['trained']} ditraining, {stats['loaded']} diload)")
    print(f"Dilewati : {stats['skip']}  |  Error: {stats['error']}")
    print(f"Model api/models/{version}/ : {total_models} / 45 file JSON")
    print(f"Prediksi Supabase forecast_results : tersimpan")
    print()
    print(f"Versi tersedia: {list_versions()}")
    print()
    print("Commit model ke git:")
    print(f"  git add api/models/{version}/")
    print(f"  git commit -m 'feat: tambah Prophet model {version}'")
    print()
    print("Langkah berikutnya:")
    print("  1. cd frontend && npm run dev")
    print("  2. cd api && func start")
    print("  3. Buka http://localhost:5173 -- grafik prediksi muncul")


if __name__ == "__main__":
    main()
