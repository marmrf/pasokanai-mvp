import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { District, Buyer } from '../types'

// Leaflet CSS import via index.css (added below)
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix Leaflet default marker icon (broken in Vite builds)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

interface WeatherData {
  district_id: string
  weather_date: string
  rainfall: number
  temperature: number
  humidity: number
}

interface DistrictWithWeather extends District {
  weather?: WeatherData
  latestPrice?: { commodity: string; price: number }
}

const LAYER_COLORS = {
  low_rain:  '#2563eb',  // blue — banyak hujan
  mid_rain:  '#16a34a',  // green — normal
  high_rain: '#d97706',  // amber — kering/sedikit hujan
}

const getRainfallColor = (rainfall: number) => {
  if (rainfall > 10)  return LAYER_COLORS.low_rain   // > 10mm/hari avg = musim hujan
  if (rainfall > 4)   return LAYER_COLORS.mid_rain   // normal
  return LAYER_COLORS.high_rain                       // < 4mm = mulai kering
}

const getRainfallLabel = (rainfall: number) => {
  if (rainfall > 10) return '🌧️ Musim Hujan'
  if (rainfall > 4)  return '⛅ Normal'
  return '☀️ Mulai Kering'
}

export default function MapDashboard() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [activeLayer, setActiveLayer] = useState<'weather' | 'recommendation' | 'buyer'>('weather')
  const [loading, setLoading] = useState(true)
  const [districts, setDistricts] = useState<DistrictWithWeather[]>([])
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const markersRef = useRef<L.LayerGroup | null>(null)

  // Load data from Supabase
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const [dRes, wRes, bRes, pRes] = await Promise.all([
        supabase.from('districts').select('*').order('name'),
        supabase.from('weather_data').select('*').order('weather_date', { ascending: false }),
        supabase.from('buyers').select('*').limit(20),
        supabase.from('commodity_prices').select('*').order('price_date', { ascending: false }),
      ])

      const dists = (dRes.data || []) as District[]
      const weather = (wRes.data || []) as WeatherData[]
      const buyerData = (bRes.data || []) as Buyer[]
      const prices = pRes.data || []

      // Attach latest weather & price per district
      const enriched: DistrictWithWeather[] = dists.map(d => {
        const latestWeather = weather.find(w => w.district_id === d.id)
        const latestPrice = prices.find(p => p.district_id === d.id)
        return {
          ...d,
          weather: latestWeather,
          latestPrice: latestPrice ? { commodity: latestPrice.commodity, price: latestPrice.price } : undefined,
        }
      })

      setDistricts(enriched)
      setBuyers(buyerData)
      setLoading(false)
    }
    loadData()
  }, [])

  // Init Leaflet map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      center: [-7.80, 110.37],
      zoom: 10,
      zoomControl: true,
    })

    // OpenStreetMap tiles (free, no API key)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map)

    mapInstanceRef.current = map
    markersRef.current = L.layerGroup().addTo(map)

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // Update markers when layer or data changes
  useEffect(() => {
    if (!mapInstanceRef.current || !markersRef.current || loading) return

    markersRef.current.clearLayers()

    if (activeLayer === 'weather') {
      districts.forEach(d => {
        const w = d.weather
        const color = w ? getRainfallColor(w.rainfall) : '#6b7280'
        const marker = L.circleMarker([d.latitude, d.longitude], {
          radius: 22,
          fillColor: color,
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.85,
        })
        marker.bindPopup(`
          <div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:180px">
            <strong style="font-size:1rem">📍 ${d.name}</strong><br/>
            ${w ? `
              <div style="margin-top:8px">
                ${getRainfallLabel(w.rainfall)}<br/>
                🌧️ Curah hujan: <b>${w.rainfall} mm/hari</b><br/>
                🌡️ Suhu: <b>${w.temperature}°C</b><br/>
                💧 Kelembapan: <b>${w.humidity}%</b><br/>
                <small style="color:#888">${w.weather_date}</small>
              </div>
            ` : '<div style="margin-top:8px;padding:8px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;color:#15803d;font-size:0.82rem">🌦️ Data cuaca daerah ini sedang kami kumpulkan — segera tersedia 🙏</div>'}
          </div>
        `)
        markersRef.current!.addLayer(marker)
      })
    }

    if (activeLayer === 'recommendation') {
      districts.forEach(d => {
        const marker = L.circleMarker([d.latitude, d.longitude], {
          radius: 22,
          fillColor: '#16a34a',
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.85,
        })
        marker.bindPopup(`
          <div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:180px">
            <strong>📍 ${d.name}</strong><br/>
            ${d.latestPrice ? `
              <div style="margin-top:8px">
                💰 <b>${d.latestPrice.commodity.replace(/_/g, ' ')}</b><br/>
                Harga terkini: <b>Rp ${d.latestPrice.price.toLocaleString('id-ID')}/kg</b>
              </div>
            ` : '<div style="margin-top:8px;padding:8px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;color:#15803d;font-size:0.82rem">💰 Data harga daerah ini sedang kami siapkan — segera tersedia 🙏</div>'}
            <div style="margin-top:8px;color:#6b7280;font-size:0.8rem">
              📊 Sumber: DPKP DIY &amp; Bapanas
            </div>
          </div>
        `)
        markersRef.current!.addLayer(marker)
      })
    }

    if (activeLayer === 'buyer') {
      buyers.forEach(b => {
        if (!b.latitude || !b.longitude) return
        const icon = L.divIcon({
          html: `<div style="background:#1f6b43;color:white;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:700;white-space:nowrap;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${b.buyer_type === 'bulog' ? '🏭' : b.buyer_type === 'koperasi' ? '🏪' : '🚛'}</div>`,
          className: '',
          iconAnchor: [20, 14],
        })
        const marker = L.marker([b.latitude, b.longitude], { icon })
        marker.bindPopup(`
          <div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:160px">
            <strong>${b.name}</strong><br/>
            <span style="text-transform:capitalize;color:#6b7280">${b.buyer_type}</span><br/>
            🌾 ${b.commodity.replace(/_/g, ' ')}<br/>
            📞 ${b.contact}
          </div>
        `)
        markersRef.current!.addLayer(marker)
      })
    }
  }, [activeLayer, districts, buyers, loading])

  const LAYERS = [
    { key: 'weather',        label: '🌧️ Cuaca',       desc: 'Data cuaca real dari Open-Meteo' },
    { key: 'recommendation', label: '🌾 Harga',        desc: 'Harga komoditas terkini per kabupaten' },
    { key: 'buyer',          label: '🤝 Pembeli',      desc: 'Lokasi koperasi, BULOG, dan offtaker' },
  ] as const

  return (
    <section style={{ padding: '60px 24px' }}>
      <div className="container">
        <div className="section-head">
          <span className="kicker">Peta DIY</span>
          <h2>Lihat kondisi di daerahmu</h2>
          <p>Peta interaktif yang menampilkan data cuaca, harga komoditas, dan lokasi pembeli di Daerah Istimewa Yogyakarta.</p>
        </div>

        {/* Layer toggle */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {LAYERS.map(l => (
            <button
              key={l.key}
              onClick={() => setActiveLayer(l.key)}
              style={{
                padding: '10px 20px',
                borderRadius: '999px',
                border: activeLayer === l.key ? '2px solid var(--green-500)' : '2px solid var(--line)',
                background: activeLayer === l.key ? 'var(--green-50)' : 'var(--paper)',
                color: activeLayer === l.key ? 'var(--green-900)' : 'var(--ink-soft)',
                fontFamily: 'inherit',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {l.label}
            </button>
          ))}
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--ink-mute)', marginBottom: '16px' }}>
          {LAYERS.find(l => l.key === activeLayer)?.desc}
        </p>

        {/* Legend for weather layer */}
        {activeLayer === 'weather' && (
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '12px', flexWrap: 'wrap', fontSize: '0.82rem' }}>
            <span><span style={{ background: LAYER_COLORS.low_rain, borderRadius: '50%', display: 'inline-block', width: 12, height: 12, marginRight: 4 }}></span>Musim Hujan (&gt;10mm/hr)</span>
            <span><span style={{ background: LAYER_COLORS.mid_rain, borderRadius: '50%', display: 'inline-block', width: 12, height: 12, marginRight: 4 }}></span>Normal (4–10mm/hr)</span>
            <span><span style={{ background: LAYER_COLORS.high_rain, borderRadius: '50%', display: 'inline-block', width: 12, height: 12, marginRight: 4 }}></span>Mulai Kering (&lt;4mm/hr)</span>
          </div>
        )}

        {/* Map container */}
        <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--line)', boxShadow: 'var(--shadow-lg)' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', color: 'var(--ink-soft)' }}>
              🌿 Memuat peta...
            </div>
          )}
          <div ref={mapRef} style={{ height: '420px', width: '100%' }} />
        </div>

        <p style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.8rem', color: 'var(--ink-mute)' }}>
          Peta: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: 'var(--green-700)' }}>© OpenStreetMap</a> · Cuaca: <a href="https://open-meteo.com" target="_blank" rel="noreferrer" style={{ color: 'var(--green-700)' }}>Open-Meteo</a> · Harga: DPKP DIY &amp; Bapanas
        </p>
      </div>
    </section>
  )
}
