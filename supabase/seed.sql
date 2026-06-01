-- ============================================================
-- PasokanAI MVP — Seed Data (Local Development)
-- Run via: supabase db reset
-- ============================================================

-- ── Districts (5 kabupaten DIY) ────────────────────────────────
insert into public.districts (name, province, latitude, longitude) values
  ('Sleman',           'Daerah Istimewa Yogyakarta', -7.716944, 110.354736),
  ('Bantul',           'Daerah Istimewa Yogyakarta', -7.888889, 110.328056),
  ('Kulon Progo',      'Daerah Istimewa Yogyakarta', -7.820556, 110.152778),
  ('Gunungkidul',      'Daerah Istimewa Yogyakarta', -7.966944, 110.614722),
  ('Kota Yogyakarta',  'Daerah Istimewa Yogyakarta', -7.797068, 110.370529)
on conflict do nothing;

-- ── Buyers / Offtaker ─────────────────────────────────────────
insert into public.buyers (name, buyer_type, commodity, latitude, longitude, contact) values
  ('Koperasi Tani Makmur Sleman',    'koperasi', 'padi',        -7.728,  110.405, 'Pakem, Sleman — (0274) 895001'),
  ('Koperasi Tani Makmur Sleman',    'koperasi', 'jagung',      -7.728,  110.405, 'Pakem, Sleman — (0274) 895001'),
  ('KUD Sumber Tani Bantul',         'koperasi', 'padi',        -7.891,  110.326, 'Sewon, Bantul — (0274) 367892'),
  ('KUD Sumber Tani Bantul',         'koperasi', 'bawang_merah',-7.891,  110.326, 'Sewon, Bantul — (0274) 367892'),
  ('BULOG Sub Divre Yogyakarta',     'bulog',    'padi',        -7.795,  110.369, 'Jl. Gedongkuning, Yogyakarta'),
  ('BULOG Sub Divre Yogyakarta',     'bulog',    'jagung',      -7.795,  110.369, 'Jl. Gedongkuning, Yogyakarta'),
  ('Pasar Induk Giwangan',           'offtaker', 'cabai',       -7.832,  110.388, 'Giwangan, Yogyakarta'),
  ('Pasar Induk Giwangan',           'offtaker', 'bawang_merah',-7.832,  110.388, 'Giwangan, Yogyakarta'),
  ('Pasar Induk Giwangan',           'offtaker', 'cabai_rawit', -7.832,  110.388, 'Giwangan, Yogyakarta'),
  ('TaniHub Yogyakarta',             'offtaker', 'cabai_rawit', -7.797,  110.370, 'Online — pickup mitra DIY'),
  ('TaniHub Yogyakarta',             'offtaker', 'sayuran_daun',-7.797,  110.370, 'Online — pickup mitra DIY'),
  ('TaniHub Yogyakarta',             'offtaker', 'bawang_merah',-7.797,  110.370, 'Online — pickup mitra DIY'),
  ('Koperasi Singkong Karangmojo',   'koperasi', 'singkong',    -7.970,  110.630, 'Karangmojo, Gunungkidul'),
  ('Koperasi Singkong Karangmojo',   'koperasi', 'kacang_tanah',-7.970,  110.630, 'Karangmojo, Gunungkidul'),
  ('KUD Wiyoro Kulon Progo',         'koperasi', 'padi',        -7.900,  110.160, 'Wates, Kulon Progo — (0274) 773123'),
  ('KUD Wiyoro Kulon Progo',         'koperasi', 'bawang_merah',-7.900,  110.160, 'Wates, Kulon Progo — (0274) 773123')
on conflict do nothing;

-- ── Recommendations (cache per kabupaten) ─────────────────────
-- Note: district_id di-join ke tabel districts. Ini versi simplified.
-- Untuk seed lengkap dengan UUID, jalankan script Python di docs/seed_recommendations.py
-- atau gunakan data dari Supabase cloud (export/import).

-- ── Catatan untuk developer ───────────────────────────────────
-- Data cuaca dan harga komoditas dikumpulkan otomatis oleh Azure Functions:
--   - Cuaca: POST /api/collect-weather  {"year": 2026, "month": 1}
--   - Harga: POST /api/scrape-prices    {"province": "DIY"}
--
-- Untuk seed manual dengan data historis, gunakan:
--   python api/seed_local.py
-- (file ini belum ada — perlu dibuat saat Phase 3)
