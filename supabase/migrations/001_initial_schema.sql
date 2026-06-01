-- ============================================================
-- PasokanAI MVP — Initial Database Schema
-- Run via: supabase db reset (local) atau SQL Editor (cloud)
-- ============================================================

-- 1. districts
create table if not exists public.districts (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  province  text not null default 'Daerah Istimewa Yogyakarta',
  latitude  numeric(10,6) not null,
  longitude numeric(10,6) not null
);

-- 2. weather_data
create table if not exists public.weather_data (
  id           uuid primary key default gen_random_uuid(),
  district_id  uuid references public.districts(id) on delete cascade,
  weather_date date not null,
  rainfall     numeric(8,2),
  temperature  numeric(5,2),
  humidity     numeric(5,2),
  unique (district_id, weather_date)
);
create index if not exists idx_weather_district_date on public.weather_data (district_id, weather_date desc);

-- 3. commodity_prices
create table if not exists public.commodity_prices (
  id          uuid primary key default gen_random_uuid(),
  district_id uuid references public.districts(id) on delete cascade,
  commodity   text not null,
  price       numeric(12,2) not null,
  price_date  date not null
);
create index if not exists idx_cp_district_commodity on public.commodity_prices (district_id, commodity);
create index if not exists idx_cp_date on public.commodity_prices (price_date desc);

-- 4. forecast_results (output Azure ML Prophet)
create table if not exists public.forecast_results (
  id             uuid primary key default gen_random_uuid(),
  district_id    uuid references public.districts(id) on delete cascade,
  commodity      text not null,
  forecast_price numeric(12,2) not null,
  confidence     numeric(5,2),
  forecast_date  date not null
);
create index if not exists idx_fr_district_commodity on public.forecast_results (district_id, commodity);
create index if not exists idx_fr_date on public.forecast_results (forecast_date desc);

-- 5. market_insights (output Azure OpenAI)
create table if not exists public.market_insights (
  id           uuid primary key default gen_random_uuid(),
  district_id  uuid references public.districts(id) on delete cascade,
  commodity    text not null,
  summary      text not null,
  impact_score numeric(4,2),
  created_at   timestamptz default now()
);

-- 6. buyers (koperasi, BULOG, offtaker)
create table if not exists public.buyers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  buyer_type text not null check (buyer_type in ('koperasi', 'bulog', 'offtaker')),
  commodity  text not null,
  latitude   numeric(10,6),
  longitude  numeric(10,6),
  contact    text
);

-- 7. middleman_offers (crowdsourced dari Gap Alert)
create table if not exists public.middleman_offers (
  id            uuid primary key default gen_random_uuid(),
  district_id   uuid references public.districts(id) on delete cascade,
  commodity     text not null,
  offered_price numeric(12,2) not null,
  offer_date    date default current_date
);

-- 8. farmer_prices (crowdsourced harga aktual)
create table if not exists public.farmer_prices (
  id           uuid primary key default gen_random_uuid(),
  district_id  uuid references public.districts(id) on delete cascade,
  commodity    text not null,
  actual_price numeric(12,2) not null,
  report_date  date default current_date
);

-- 9. recommendations (cache rekomendasi per kabupaten)
create table if not exists public.recommendations (
  id                  uuid primary key default gen_random_uuid(),
  district_id         uuid references public.districts(id) on delete cascade,
  commodity           text not null,
  priority            text not null check (priority in ('profit', 'safe')),
  recommendation_text jsonb not null,
  confidence          numeric(5,2),
  created_at          timestamptz default now()
);
create index if not exists idx_rec_district_priority on public.recommendations (district_id, priority);

-- ── Row Level Security ──────────────────────────────────────────
alter table public.districts        enable row level security;
alter table public.weather_data     enable row level security;
alter table public.commodity_prices enable row level security;
alter table public.forecast_results enable row level security;
alter table public.market_insights  enable row level security;
alter table public.buyers           enable row level security;
alter table public.middleman_offers enable row level security;
alter table public.farmer_prices    enable row level security;
alter table public.recommendations  enable row level security;

-- Public read untuk frontend tanpa auth (RLS enforced)
create policy "public read" on public.districts        for select using (true);
create policy "public read" on public.weather_data     for select using (true);
create policy "public read" on public.commodity_prices for select using (true);
create policy "public read" on public.forecast_results for select using (true);
create policy "public read" on public.market_insights  for select using (true);
create policy "public read" on public.buyers           for select using (true);
create policy "public read" on public.middleman_offers for select using (true);
create policy "public read" on public.farmer_prices    for select using (true);
create policy "public read" on public.recommendations  for select using (true);

-- Service role key (Azure Functions) bisa write
create policy "service write" on public.weather_data     for insert with check (true);
create policy "service write" on public.commodity_prices for insert with check (true);
create policy "service write" on public.forecast_results for insert with check (true);
create policy "service write" on public.market_insights  for insert with check (true);
create policy "service write" on public.middleman_offers for insert with check (true);
create policy "service write" on public.farmer_prices    for insert with check (true);
create policy "service write" on public.recommendations  for insert with check (true);
