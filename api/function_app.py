import azure.functions as func
import json
import os
import math
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

HARGA_ACUAN = {
    "sleman":      {"padi": {"avg": 6300, "ref": 6600}, "jagung": {"avg": 4600, "ref": 5200}, "cabai_rawit": {"avg": 45000, "ref": 50000}},
    "bantul":      {"padi": {"avg": 6500, "ref": 6800}, "bawang_merah": {"avg": 25000, "ref": 28000}},
    "gunungkidul": {"kacang_tanah": {"avg": 12500, "ref": 14000}, "singkong": {"avg": 1600, "ref": 1800}},
    "klaten":      {"padi": {"avg": 6600, "ref": 6900}, "tembakau": {"avg": 60000, "ref": 65000}},
    "magelang":    {"cabai_rawit": {"avg": 48000, "ref": 52000}, "sayuran_daun": {"avg": 5500, "ref": 6000}},
    "brebes":      {"bawang_merah": {"avg": 27000, "ref": 30000}},
    "malang":      {"kentang": {"avg": 12500, "ref": 14000}, "wortel": {"avg": 7800, "ref": 8500}},
    "jember":      {"edamame": {"avg": 11000, "ref": 12000}, "kedelai": {"avg": 9800, "ref": 10500}},
}

OFFTAKER = [
    {"nama": "Koperasi Tani Makmur Sleman", "tipe": "koperasi", "komoditas": ["padi","jagung"], "lat": -7.728, "lng": 110.405, "kontak": "Pakem, Sleman"},
    {"nama": "KUD Sumber Tani Bantul", "tipe": "koperasi", "komoditas": ["padi","bawang_merah"], "lat": -7.891, "lng": 110.326, "kontak": "Sewon, Bantul"},
    {"nama": "Koperasi Singkong Karangmojo", "tipe": "koperasi", "komoditas": ["singkong","kacang_tanah"], "lat": -7.970, "lng": 110.630, "kontak": "Karangmojo, Gunungkidul"},
    {"nama": "BULOG Sub Divre Yogyakarta", "tipe": "bulog", "komoditas": ["padi","jagung"], "lat": -7.795, "lng": 110.369, "kontak": "Yogyakarta"},
    {"nama": "TaniHub", "tipe": "ecommerce", "komoditas": ["cabai_rawit","sayuran_daun","bawang_merah","kentang","wortel"], "lat": -6.200, "lng": 106.816, "kontak": "Online, pickup mitra"},
    {"nama": "Sayurbox", "tipe": "ecommerce", "komoditas": ["cabai_rawit","sayuran_daun","wortel"], "lat": -6.200, "lng": 106.816, "kontak": "Online, kemitraan"},
    {"nama": "BULOG Sub Divre Malang", "tipe": "bulog", "komoditas": ["padi","jagung","kedelai"], "lat": -7.966, "lng": 112.633, "kontak": "Malang"},
    {"nama": "Mitratani Dua Tujuh", "tipe": "offtaker", "komoditas": ["edamame","kedelai"], "lat": -8.170, "lng": 113.700, "kontak": "Jember, kontrak ekspor"},
    {"nama": "Pasar Induk Beringharjo", "tipe": "pasar_induk", "komoditas": ["sayuran_daun","cabai_rawit","bawang_merah"], "lat": -7.799, "lng": 110.366, "kontak": "Yogyakarta"},
    {"nama": "Koperasi Bawang Brebes", "tipe": "koperasi", "komoditas": ["bawang_merah"], "lat": -6.872, "lng": 109.040, "kontak": "Larangan, Brebes"},
]

KAB_KOORDINAT = {
    "sleman": {"lat": -7.732, "lng": 110.401},
    "bantul": {"lat": -7.888, "lng": 110.328},
    "gunungkidul": {"lat": -7.966, "lng": 110.616},
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

def cari_offtaker_terdekat(kabupaten, komoditas, max_hasil=3):
    koordinat = KAB_KOORDINAT.get(kabupaten)
    if not koordinat:
        return []
    hasil = []
    for o in OFFTAKER:
        if komoditas in o["komoditas"]:
            jarak = hitung_jarak(koordinat["lat"], koordinat["lng"], o["lat"], o["lng"])
            hasil.append({**o, "jarak_km": round(jarak)})
    hasil.sort(key=lambda x: x["jarak_km"])
    return hasil[:max_hasil]

def buat_anchor(komoditas, kabupaten, harga_tawaran, harga_avg, harga_ref, selisih, luas_ha, total_loss):
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

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.7
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return f"Pak/Bu, harga rata-rata petani di {lokasi_label} minggu ini Rp {harga_avg:,}/kg. Tawaran Rp {harga_tawaran:,}/kg selisihnya Rp {selisih:,}/kg, sekitar Rp {total_loss:,.0f} untuk panen Bapak/Ibu. Apakah bisa kita bicarakan lagi?"

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
        return func.HttpResponse(
            json.dumps({"error": "Request body tidak valid"}),
            status_code=400, headers=headers
        )

    komoditas = str(body.get("komoditas", "")).lower().strip().replace(" ", "_")
    kabupaten = str(body.get("kabupaten", "")).lower().strip()
    harga_tawaran = body.get("harga_tawaran", 0)
    luas_ha = body.get("luas_ha", 1)

    if not komoditas or not kabupaten:
        return func.HttpResponse(
            json.dumps({"error": "komoditas dan kabupaten wajib diisi"}),
            status_code=400, headers=headers
        )

    try:
        harga_tawaran = float(harga_tawaran)
        luas_ha = max(0.1, min(float(luas_ha), 1000))
    except Exception:
        return func.HttpResponse(
            json.dumps({"error": "harga_tawaran dan luas_ha harus angka"}),
            status_code=400, headers=headers
        )

    if harga_tawaran <= 0 or harga_tawaran > 10_000_000:
        return func.HttpResponse(
            json.dumps({"error": "harga_tawaran tidak valid"}),
            status_code=400, headers=headers
        )

    data_harga = HARGA_ACUAN.get(kabupaten, {}).get(komoditas)
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
        "cabai_rawit": 7000, "kacang_tanah": 2500, "singkong": 17500,
        "tembakau": 1750, "sayuran_daun": 10000, "kentang": 20000,
        "wortel": 22500, "edamame": 7000, "kedelai": 2150,
    }
    estimasi_yield_kg = YIELD_PER_HA.get(komoditas, 5000) * luas_ha
    total_loss = max(0, selisih * estimasi_yield_kg)

    offtaker = cari_offtaker_terdekat(kabupaten, komoditas)

    if gap_pct >= 15:
        anchor = buat_anchor(
            komoditas, kabupaten, harga_tawaran,
            harga_avg, harga_ref, selisih, luas_ha, total_loss
        )
        status = "alert"
    else:
        anchor = None
        status = "fair"

    result = {
        "status": status,
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
        "offtaker_terdekat": offtaker
    }

    return func.HttpResponse(
        json.dumps(result, ensure_ascii=False),
        status_code=200, headers=headers
    )