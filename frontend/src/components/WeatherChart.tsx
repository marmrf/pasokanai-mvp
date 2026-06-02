import { useState, useEffect } from 'react'

const DISTRICT_COORDS: Record<string, { lat: number; lon: number }> = {
  '11111111-1111-1111-1111-111111111101': { lat: -7.718, lon: 110.363 },
  '11111111-1111-1111-1111-111111111102': { lat: -7.889, lon: 110.328 },
  '11111111-1111-1111-1111-111111111103': { lat: -7.832, lon: 110.162 },
  '11111111-1111-1111-1111-111111111104': { lat: -7.983, lon: 110.614 },
  '11111111-1111-1111-1111-111111111105': { lat: -7.797, lon: 110.366 },
}

const MONTH_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des']

interface WDay {
  date: string
  rain: number
  tMax: number
  tMin: number
  isFcast: boolean
}

export interface WeatherSummary {
  avgRain: number
  avgTemp: number
  forecastRain14: number
  forecastTemp: number
  status: 'kemarau' | 'normal' | 'hujan'
}

interface Props {
  districtId: string
  districtLabel?: string
  onSummary?: (s: WeatherSummary) => void
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function fmtLabel(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTH_ID[d.getMonth()]}`
}

function avg(arr: number[]) {
  if (!arr.length) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

export default function WeatherChart({ districtId, districtLabel, onSummary }: Props) {
  const [days, setDays]       = useState<WDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)

  useEffect(() => {
    const coords = DISTRICT_COORDS[districtId]
    if (!coords) { setLoading(false); return }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday  = addDays(today, -1)
    const histStart  = addDays(today, -30)

    const histUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${coords.lat}&longitude=${coords.lon}&start_date=${fmtDate(histStart)}&end_date=${fmtDate(yesterday)}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=Asia%2FJakarta`
    const fcastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&forecast_days=16&timezone=Asia%2FJakarta`

    Promise.all([fetch(histUrl), fetch(fcastUrl)])
      .then(async ([h, f]) => {
        const hd = await h.json()
        const fd = await f.json()
        const result: WDay[] = []

        const hDates: string[] = hd.daily?.time ?? []
        const hRain:  number[] = hd.daily?.precipitation_sum ?? []
        const hTMax:  number[] = hd.daily?.temperature_2m_max ?? []
        const hTMin:  number[] = hd.daily?.temperature_2m_min ?? []
        hDates.forEach((date, i) => result.push({
          date, rain: hRain[i] ?? 0, tMax: hTMax[i] ?? 30, tMin: hTMin[i] ?? 22, isFcast: false,
        }))

        const fDates: string[] = fd.daily?.time ?? []
        const fRain:  number[] = fd.daily?.precipitation_sum ?? []
        const fTMax:  number[] = fd.daily?.temperature_2m_max ?? []
        const fTMin:  number[] = fd.daily?.temperature_2m_min ?? []
        fDates.forEach((date, i) => result.push({
          date, rain: fRain[i] ?? 0, tMax: fTMax[i] ?? 30, tMin: fTMin[i] ?? 22, isFcast: true,
        }))

        setDays(result)

        const hist   = result.filter(d => !d.isFcast)
        const fcast  = result.filter(d => d.isFcast)
        const avgRain      = avg(hist.map(d => d.rain))
        const avgTemp      = avg(hist.map(d => (d.tMax + d.tMin) / 2))
        const forecastRain14 = avg(fcast.slice(0, 14).map(d => d.rain))
        const forecastTemp = avg(fcast.map(d => (d.tMax + d.tMin) / 2))
        const status: WeatherSummary['status'] = avgRain < 2.5 ? 'kemarau' : avgRain > 8 ? 'hujan' : 'normal'
        onSummary?.({ avgRain, avgTemp, forecastRain14, forecastTemp, status })
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [districtId])

  if (loading) return (
    <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '0.85rem' }}>
      Memuat data cuaca Open-Meteo...
    </div>
  )
  if (error || days.length === 0) return null

  // ── Chart dimensions ──────────────────────────────────────────────────────
  const W = 400, H = 170
  const PL = 36, PR = 8, PT = 12, PB = 26
  const cW = W - PL - PR, cH = H - PT - PB
  const n = days.length

  const xOf = (i: number) => PL + (i / (n - 1)) * cW
  const barW = Math.max(3, (cW / n) * 0.65)

  const maxRain = Math.max(...days.map(d => d.rain), 12)
  const rainH   = (r: number) => (r / maxRain) * cH
  const rainY   = (r: number) => PT + cH - rainH(r)

  const tLo = 18, tHi = 40
  const tempY = (t: number) => PT + cH - ((Math.min(tHi, Math.max(tLo, t)) - tLo) / (tHi - tLo)) * cH

  // Temperature midpoint line path
  const tempPath = days.map((d, i) => {
    const t = (d.tMax + d.tMin) / 2
    return `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${tempY(t).toFixed(1)}`
  }).join(' ')

  // Today divider index
  const todayIdx = days.findIndex(d => d.isFcast)

  // X-axis labels (every 7 days)
  const xLabels = days.filter((_, i) => i % 7 === 0 || i === n - 1)

  // Y rain axis
  const rainLevels = [0, Math.round(maxRain / 2), Math.round(maxRain)]

  // Summary values
  const hist  = days.filter(d => !d.isFcast)
  const fcast = days.filter(d => d.isFcast)
  const avgRainVal  = avg(hist.map(d => d.rain))
  const avgTempVal  = avg(hist.map(d => (d.tMax + d.tMin) / 2))
  const fcastRain14 = avg(fcast.slice(0, 14).map(d => d.rain))
  const status = avgRainVal < 2.5 ? 'kemarau' : avgRainVal > 8 ? 'hujan' : 'normal'

  const statusConfig = {
    kemarau: { icon: '🌞', label: 'Musim Kemarau', color: '#b45309', bg: '#fef3c7', border: '#fcd34d', insight: 'Curah hujan rendah — siapkan irigasi tambahan sebelum menanam' },
    normal:  { icon: '⛅', label: 'Cuaca Normal',  color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', insight: 'Curah hujan ideal — kondisi baik untuk mulai tanam' },
    hujan:   { icon: '🌧️', label: 'Musim Hujan',  color: '#1e40af', bg: '#dbeafe', border: '#93c5fd', insight: 'Hujan deras — waspadai genangan, pilih varietas tahan air' },
  }
  const sc = statusConfig[status]

  return (
    <div style={{
      background: 'linear-gradient(160deg, #f0f9ff 0%, #e0f2fe 60%, #f7fcff 100%)',
      border: `1.5px solid ${sc.border}`,
      borderRadius: '16px',
      padding: '14px 14px 12px',
      marginBottom: '20px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0c4a6e' }}>
            🌤️ Cuaca & Prakiraan 16 Hari
          </div>
          <div style={{ fontSize: '0.72rem', color: '#0284c7', marginTop: '3px', opacity: 0.9 }}>
            {districtLabel ?? 'DIY'} · Open-Meteo · 30 hari historis + 16 hari ke depan
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          background: sc.bg, border: `1px solid ${sc.border}`,
          borderRadius: '20px', padding: '4px 10px',
        }}>
          <span style={{ fontSize: '0.9rem' }}>{sc.icon}</span>
          <span style={{ fontWeight: 700, fontSize: '0.78rem', color: sc.color }}>{sc.label}</span>
        </div>
      </div>

      {/* SVG Chart */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', marginBottom: '8px' }}>
        <defs>
          <linearGradient id="rainHistGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="rainFcastGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="tempAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines (rainfall) */}
        {rainLevels.map((v, i) => (
          <g key={i}>
            <line x1={PL} y1={rainY(v)} x2={PL + cW} y2={rainY(v)} stroke="#e0f2fe" strokeWidth="0.7" />
            <text x={PL - 3} y={rainY(v) + 3.5} textAnchor="end" fontSize="7.5" fill="#94a3b8">
              {v}
            </text>
          </g>
        ))}
        <text x={PL - 3} y={PT - 2} textAnchor="end" fontSize="6.5" fill="#64748b">mm</text>

        {/* Today divider */}
        {todayIdx > 0 && (
          <>
            <line
              x1={xOf(todayIdx)} y1={PT}
              x2={xOf(todayIdx)} y2={PT + cH}
              stroke="#6b7280" strokeWidth="1" strokeDasharray="3,3"
            />
            <text x={xOf(todayIdx) + 3} y={PT + 8} fontSize="7" fill="#6b7280">Hari ini</text>
          </>
        )}

        {/* Rainfall bars */}
        {days.map((d, i) => {
          const bh = rainH(d.rain)
          if (bh < 0.5) return null
          return (
            <rect
              key={i}
              x={xOf(i) - barW / 2}
              y={rainY(d.rain)}
              width={barW}
              height={bh}
              fill={d.isFcast ? 'url(#rainFcastGrad)' : 'url(#rainHistGrad)'}
              rx="1"
            />
          )
        })}

        {/* Temperature area fill */}
        <path
          d={tempPath + ` L${xOf(n - 1)},${PT + cH} L${PL},${PT + cH} Z`}
          fill="url(#tempAreaGrad)"
        />

        {/* Temperature line — historical */}
        <path
          d={days.filter(d => !d.isFcast).map((d, i) => {
            const t = (d.tMax + d.tMin) / 2
            return `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${tempY(t).toFixed(1)}`
          }).join(' ')}
          fill="none" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        />

        {/* Temperature line — forecast (dashed) */}
        {todayIdx > 0 && (
          <path
            d={days.filter(d => d.isFcast).map((d, j) => {
              const i = todayIdx + j
              const t = (d.tMax + d.tMin) / 2
              return `${j === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${tempY(t).toFixed(1)}`
            }).join(' ')}
            fill="none" stroke="#fb923c" strokeWidth="1.5" strokeDasharray="4,3" strokeLinecap="round"
          />
        )}

        {/* X axis */}
        <line x1={PL} y1={PT + cH} x2={PL + cW} y2={PT + cH} stroke="#bae6fd" strokeWidth="1" />

        {/* X labels */}
        {xLabels.map((d, i) => {
          const idx = days.indexOf(d)
          return (
            <text key={i} x={xOf(idx)} y={H - 3} textAnchor="middle" fontSize="7.5" fill="#64748b">
              {fmtLabel(d.date)}
            </text>
          )
        })}

        {/* Legend */}
        <rect x={W - PR - 80} y={PT} width={8} height={6} fill="url(#rainHistGrad)" rx="1" />
        <text x={W - PR - 70} y={PT + 5.5} fontSize="7" fill="#0369a1">Hujan historis</text>
        <rect x={W - PR - 80} y={PT + 10} width={8} height={6} fill="url(#rainFcastGrad)" rx="1" />
        <text x={W - PR - 70} y={PT + 15.5} fontSize="7" fill="#0284c7">Hujan prakiraan</text>
        <line x1={W - PR - 80} y1={PT + 23} x2={W - PR - 72} y2={PT + 23} stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" />
        <text x={W - PR - 70} y={PT + 26} fontSize="7" fill="#ea580c">Suhu (°C)</text>
      </svg>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px', marginTop: '4px' }}>
        <div style={{ background: 'white', border: '1px solid #bae6fd', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.58rem', color: '#64748b', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase' }}>Hujan 30 hari</div>
          <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0c4a6e' }}>{avgRainVal.toFixed(1)} mm</div>
          <div style={{ fontSize: '0.58rem', color: '#94a3b8', marginTop: '2px' }}>rata-rata/hari</div>
        </div>
        <div style={{ background: 'white', border: '1px solid #fed7aa', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.58rem', color: '#64748b', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase' }}>Suhu rata-rata</div>
          <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#c2410c' }}>{avgTempVal.toFixed(1)}°C</div>
          <div style={{ fontSize: '0.58rem', color: '#94a3b8', marginTop: '2px' }}>historis 30 hari</div>
        </div>
        <div style={{ background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.58rem', color: '#64748b', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase' }}>Prakiraan 14hr</div>
          <div style={{ fontWeight: 800, fontSize: '0.82rem', color: sc.color }}>{fcastRain14.toFixed(1)} mm</div>
          <div style={{ fontSize: '0.58rem', color: sc.color, marginTop: '2px', opacity: 0.8 }}>{sc.icon} {sc.label}</div>
        </div>
      </div>

      {/* Farming insight */}
      <div style={{
        marginTop: '8px', fontSize: '0.72rem', lineHeight: 1.4,
        background: sc.bg, borderLeft: `3px solid ${sc.border}`,
        borderRadius: '0 8px 8px 0', padding: '6px 10px', color: sc.color,
      }}>
        🌾 <strong>Dampak ke pertanian:</strong> {sc.insight}
      </div>
    </div>
  )
}
