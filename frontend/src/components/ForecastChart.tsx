import { useState, useEffect } from 'react'

interface HistPoint { date: string; price: number }
interface FcastPoint { date: string; yhat: number; yhat_lower: number; yhat_upper: number }

interface ForecastData {
  commodity: string
  district: string
  historical: HistPoint[]
  forecast: FcastPoint[]
  forecast_source: 'prophet_local' | 'linear_trend' | 'none' | string
}

interface Props {
  districtId: string
  commodity: string
  currentPrice?: number
}

const MONTH_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des']

function dateMs(d: string) { return new Date(d).getTime() }

function fmtPrice(p: number): string {
  if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(1)}jt`
  if (p >= 1_000)     return `${Math.round(p / 1_000)}rb`
  return String(Math.round(p))
}

function fmtPriceFull(p: number): string {
  return 'Rp ' + Math.round(p).toLocaleString('id-ID')
}

function fmtDateLabel(d: string): string {
  const dt = new Date(d)
  return `${MONTH_ID[dt.getMonth()]} '${String(dt.getFullYear()).slice(2)}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function findClosest(arr: FcastPoint[], targetDate: string): FcastPoint | null {
  if (arr.length === 0) return null
  const target = dateMs(targetDate)
  return arr.reduce((prev, curr) =>
    Math.abs(dateMs(curr.date) - target) < Math.abs(dateMs(prev.date) - target) ? curr : prev
  )
}

const SOURCE_LABEL: Record<string, string> = {
  prophet_local: 'Prophet ML',
  linear_trend:  'Tren linear',
  none:          'Tidak ada data',
}

export default function ForecastChart({ districtId, commodity, currentPrice }: Props) {
  const [data, setData]       = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)

  useEffect(() => {
    if (!districtId || !commodity) return
    setLoading(true); setError(false); setData(null)
    fetch(`/api/forecast?district_id=${encodeURIComponent(districtId)}&commodity=${encodeURIComponent(commodity)}&historical_months=8`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => { if (d.error) throw new Error(); setData(d) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [districtId, commodity])

  if (loading) return (
    <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '0.85rem' }}>
      Memuat grafik prediksi harga...
    </div>
  )
  if (error || !data) return null

  const hist = data.historical
  const fcastAll = data.forecast

  // Sample forecast for rendering (every 5 days + last)
  const fcast = fcastAll.filter((_, i) => i % 5 === 0 || i === fcastAll.length - 1)

  if (hist.length === 0 && fcast.length === 0) return null

  // ── Milestone points ──────────────────────────────────────────────────────
  const nowDate    = hist.length > 0 ? hist[hist.length - 1].date : new Date().toISOString().slice(0, 10)
  const d30Date    = addDays(nowDate, 30)
  const d90Date    = addDays(nowDate, 90)
  const ms30       = findClosest(fcastAll, d30Date)
  const ms90       = findClosest(fcastAll, d90Date)
  const refPrice   = hist.length > 0 ? hist[hist.length - 1].price : (currentPrice ?? 0)
  const endForecast = ms90?.yhat ?? (fcast.length > 0 ? fcast[fcast.length - 1].yhat : refPrice)
  const trendPct   = refPrice > 0 ? ((endForecast - refPrice) / refPrice) * 100 : 0
  const trendUp    = trendPct >= 0

  // ── Timeline & price range ────────────────────────────────────────────────
  const allDates = [
    ...hist.map(h => h.date),
    ...fcast.map(f => f.date),
  ]
  const t0 = dateMs(allDates[0])
  const t1 = dateMs(allDates[allDates.length - 1])
  const tSpan = Math.max(t1 - t0, 1)

  const allPrices = [
    ...hist.map(h => h.price),
    ...fcast.map(f => f.yhat_upper),
    ...fcast.map(f => f.yhat_lower),
    ...(currentPrice ? [currentPrice] : []),
  ]
  const minP = Math.min(...allPrices) * 0.88
  const maxP = Math.max(...allPrices) * 1.12

  // ── SVG layout ────────────────────────────────────────────────────────────
  const W  = 340
  const H  = 175
  const PL = 48
  const PR = 12
  const PT = 14
  const PB = 28
  const cW = W - PL - PR
  const cH = H - PT - PB

  const tx = (d: string) => PL + ((dateMs(d) - t0) / tSpan) * cW
  const ty = (p: number) => PT + cH - ((p - minP) / (maxP - minP)) * cH

  // ── Path builders ─────────────────────────────────────────────────────────
  const joinX = hist.length > 0 ? tx(hist[hist.length - 1].date) : PL
  const joinY = hist.length > 0 ? ty(hist[hist.length - 1].price) : ty((minP + maxP) / 2)

  // Historical: line path + area path
  const histLinePath = hist
    .map((h, i) => `${i === 0 ? 'M' : 'L'}${tx(h.date).toFixed(1)},${ty(h.price).toFixed(1)}`)
    .join(' ')

  const histAreaPath = hist.length > 0
    ? `${histLinePath} L${tx(hist[hist.length - 1].date).toFixed(1)},${(PT + cH).toFixed(1)} L${tx(hist[0].date).toFixed(1)},${(PT + cH).toFixed(1)} Z`
    : ''

  // Forecast line
  const fcastPath = fcast.length > 0
    ? [`M${joinX.toFixed(1)},${joinY.toFixed(1)}`, ...fcast.map(f => `L${tx(f.date).toFixed(1)},${ty(f.yhat).toFixed(1)}`)].join(' ')
    : ''

  // Confidence band
  const bandUpper = fcast.map(f => `${tx(f.date).toFixed(1)},${ty(f.yhat_upper).toFixed(1)}`).join(' L')
  const bandLower = [...fcast].reverse().map(f => `${tx(f.date).toFixed(1)},${ty(f.yhat_lower).toFixed(1)}`).join(' L')
  const bandPath = fcast.length > 0
    ? `M${joinX.toFixed(1)},${joinY.toFixed(1)} L${bandUpper} L${bandLower} Z`
    : ''

  // ── Y axis labels ─────────────────────────────────────────────────────────
  const yLevels = 4
  const yLabels = Array.from({ length: yLevels + 1 }, (_, i) => {
    const p = minP + (maxP - minP) * (i / yLevels)
    return { p, y: ty(p) }
  }).reverse()

  // ── X axis labels ─────────────────────────────────────────────────────────
  const xLabels: { label: string; x: number; bold?: boolean }[] = []
  if (hist.length > 0) xLabels.push({ label: fmtDateLabel(hist[0].date), x: tx(hist[0].date) })
  if (hist.length > 0) xLabels.push({ label: '▶ Kini', x: joinX, bold: true })
  if (fcast.length > 0) xLabels.push({ label: fmtDateLabel(fcast[fcast.length - 1].date), x: tx(fcast[fcast.length - 1].date) })

  const sourceLabel = SOURCE_LABEL[data.forecast_source] ?? data.forecast_source

  // ── Milestone helpers ─────────────────────────────────────────────────────
  const pct30 = ms30 && refPrice > 0 ? ((ms30.yhat - refPrice) / refPrice) * 100 : null
  const pct90 = ms90 && refPrice > 0 ? ((ms90.yhat - refPrice) / refPrice) * 100 : null

  function PctBadge({ pct }: { pct: number | null }) {
    if (pct === null) return null
    const up = pct >= 0
    return (
      <span style={{
        display: 'inline-block',
        fontSize: '0.65rem',
        fontWeight: 700,
        color: up ? '#166534' : '#991b1b',
        background: up ? '#dcfce7' : '#fee2e2',
        borderRadius: '10px',
        padding: '1px 6px',
        marginLeft: '4px',
      }}>
        {up ? '+' : ''}{pct.toFixed(1)}%
      </span>
    )
  }

  return (
    <div style={{
      background: 'linear-gradient(160deg, #f0fdf4 0%, #ecfdf5 60%, #f7fdf9 100%)',
      border: '1.5px solid #bbf7d0',
      borderRadius: '16px',
      padding: '14px 14px 12px',
      marginBottom: '20px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#14532d', lineHeight: 1.2 }}>
            📈 Prediksi Harga 90 Hari
          </div>
          <div style={{ fontSize: '0.72rem', color: '#16a34a', marginTop: '3px', opacity: 0.9 }}>
            {data.commodity.replace(/_/g, ' ')} · {data.district}
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: trendUp ? '#dcfce7' : '#fee2e2',
          borderRadius: '20px', padding: '4px 10px',
        }}>
          <span style={{ fontSize: '1rem' }}>{trendUp ? '↑' : '↓'}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: trendUp ? '#16a34a' : '#dc2626', lineHeight: 1 }}>
              {Math.abs(trendPct).toFixed(1)}%
            </div>
            <div style={{ fontSize: '0.6rem', color: trendUp ? '#16a34a' : '#dc2626', opacity: 0.8 }}>
              90 hari
            </div>
          </div>
        </div>
      </div>

      {/* Chart SVG */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block', overflow: 'visible' }}
        aria-label="Grafik prediksi harga"
      >
        <defs>
          {/* Gradient for historical area */}
          <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.03" />
          </linearGradient>
          {/* Gradient for forecast area */}
          <linearGradient id="fcastGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#15803d" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#15803d" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yLabels.map(({ p, y }) => (
          <g key={p}>
            <line x1={PL} y1={y} x2={PL + cW} y2={y} stroke="#d1fae5" strokeWidth="0.7" />
            <text x={PL - 4} y={y + 3.5} textAnchor="end" fontSize="7.5" fill="#9ca3af">
              {fmtPrice(p)}
            </text>
          </g>
        ))}

        {/* Confidence band */}
        {bandPath && <path d={bandPath} fill="url(#fcastGrad)" />}
        {bandPath && <path d={bandPath} fill="#bbf7d0" opacity="0.35" />}

        {/* Historical area fill */}
        {histAreaPath && <path d={histAreaPath} fill="url(#histGrad)" />}

        {/* Today marker */}
        {hist.length > 0 && (
          <line x1={joinX} y1={PT} x2={joinX} y2={PT + cH}
            stroke="#4ade80" strokeWidth="1.5" strokeDasharray="4,2.5" opacity="0.7" />
        )}

        {/* Historical line */}
        {histLinePath && (
          <path d={histLinePath} fill="none" stroke="#16a34a" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Forecast line */}
        {fcastPath && (
          <path d={fcastPath} fill="none" stroke="#15803d" strokeWidth="2"
            strokeDasharray="6,3" strokeLinecap="round" />
        )}

        {/* Milestone: 30-day */}
        {ms30 && (() => {
          const cx = tx(ms30.date)
          const cy = ty(ms30.yhat)
          const showLabel = pct30 !== null
          return (
            <g>
              <circle cx={cx} cy={cy} r="5" fill="white" stroke="#16a34a" strokeWidth="1.5" />
              <circle cx={cx} cy={cy} r="2.5" fill="#16a34a" />
              {showLabel && (
                <text x={cx} y={cy - 9} textAnchor="middle" fontSize="7.5" fill="#166534" fontWeight="700">
                  30h
                </text>
              )}
            </g>
          )
        })()}

        {/* Milestone: 90-day (end) */}
        {ms90 && (() => {
          const cx = tx(ms90.date)
          const cy = ty(ms90.yhat)
          return (
            <g>
              <circle cx={cx} cy={cy} r="6" fill="white" stroke="#15803d" strokeWidth="2" />
              <circle cx={cx} cy={cy} r="3" fill="#15803d" />
              <text x={cx} y={cy - 11} textAnchor="middle" fontSize="8.5" fill="#14532d" fontWeight="800">
                Rp{fmtPrice(ms90.yhat)}
              </text>
            </g>
          )
        })()}

        {/* Historical dots */}
        {hist.map((h, i) => (
          <circle key={i} cx={tx(h.date)} cy={ty(h.price)} r="2.5" fill="#16a34a" opacity="0.8" />
        ))}

        {/* X axis */}
        <line x1={PL} y1={PT + cH} x2={PL + cW} y2={PT + cH} stroke="#d1fae5" strokeWidth="1" />

        {/* X labels */}
        {xLabels.map(({ label, x, bold }, i) => (
          <text
            key={i} x={x} y={H - 4}
            textAnchor={x < PL + cW * 0.25 ? 'start' : x > PL + cW * 0.75 ? 'end' : 'middle'}
            fontSize={bold ? '8.5' : '7.5'}
            fill={bold ? '#16a34a' : '#9ca3af'}
            fontWeight={bold ? '700' : '400'}
          >
            {label}
          </text>
        ))}
      </svg>

      {/* ── Catatan Prediksi — 3 milestone cards ───────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: '6px',
        marginTop: '10px',
      }}>
        {/* Sekarang */}
        <div style={{
          background: 'white',
          border: '1px solid #d1fae5',
          borderRadius: '10px',
          padding: '8px 8px 6px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.6rem', color: '#6b7280', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Harga Kini
          </div>
          <div style={{ fontWeight: 800, fontSize: '0.78rem', color: '#14532d', lineHeight: 1.1, wordBreak: 'break-all' }}>
            {fmtPriceFull(refPrice)}
          </div>
          <div style={{ fontSize: '0.58rem', color: '#9ca3af', marginTop: '3px' }}>per kg</div>
        </div>

        {/* 30 hari */}
        <div style={{
          background: ms30 ? (pct30 !== null && pct30 >= 0 ? '#f0fdf4' : '#fff8f8') : '#f9fafb',
          border: `1px solid ${ms30 ? (pct30 !== null && pct30 >= 0 ? '#86efac' : '#fca5a5') : '#e5e7eb'}`,
          borderRadius: '10px',
          padding: '8px 8px 6px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.6rem', color: '#6b7280', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            30 Hari
          </div>
          {ms30 ? (
            <>
              <div style={{ fontWeight: 800, fontSize: '0.78rem', color: pct30 !== null && pct30 >= 0 ? '#16a34a' : '#dc2626', lineHeight: 1.1, wordBreak: 'break-all' }}>
                {fmtPriceFull(ms30.yhat)}
              </div>
              <div style={{ marginTop: '3px' }}>
                <PctBadge pct={pct30} />
              </div>
            </>
          ) : (
            <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>—</div>
          )}
        </div>

        {/* 90 hari */}
        <div style={{
          background: ms90 ? (trendUp ? '#f0fdf4' : '#fff8f8') : '#f9fafb',
          border: `1px solid ${ms90 ? (trendUp ? '#86efac' : '#fca5a5') : '#e5e7eb'}`,
          borderRadius: '10px',
          padding: '8px 8px 6px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.6rem', color: '#6b7280', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            90 Hari
          </div>
          {ms90 ? (
            <>
              <div style={{ fontWeight: 800, fontSize: '0.78rem', color: trendUp ? '#16a34a' : '#dc2626', lineHeight: 1.1, wordBreak: 'break-all' }}>
                {fmtPriceFull(ms90.yhat)}
              </div>
              <div style={{ marginTop: '3px' }}>
                <PctBadge pct={pct90} />
              </div>
            </>
          ) : (
            <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>—</div>
          )}
        </div>
      </div>

      {/* ── Insight note ──────────────────────────────────────────────────── */}
      {ms30 && ms90 && (
        <div style={{
          marginTop: '8px',
          background: trendUp ? '#f0fdf4' : '#fff7ed',
          borderLeft: `3px solid ${trendUp ? '#22c55e' : '#f59e0b'}`,
          borderRadius: '0 8px 8px 0',
          padding: '6px 10px',
          fontSize: '0.72rem',
          color: trendUp ? '#14532d' : '#92400e',
          lineHeight: 1.5,
        }}>
          {trendUp
            ? `Harga ${data.commodity.replace(/_/g, ' ')} di ${data.district} diperkirakan naik sekitar ${Math.abs(trendPct).toFixed(0)}% dalam 90 hari ke depan. Waktu yang baik untuk panen di akhir periode.`
            : `Harga ${data.commodity.replace(/_/g, ' ')} di ${data.district} diperkirakan turun sekitar ${Math.abs(trendPct).toFixed(0)}% dalam 90 hari. Pertimbangkan penjualan lebih awal.`
          }
        </div>
      )}

      {/* Legend */}
      <div style={{
        display: 'flex', gap: '10px', flexWrap: 'wrap',
        fontSize: '0.63rem', color: '#9ca3af', marginTop: '8px',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <svg width="18" height="6">
            <line x1="0" y1="3" x2="18" y2="3" stroke="#16a34a" strokeWidth="2.5" />
          </svg>
          Aktual
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <svg width="18" height="6">
            <line x1="0" y1="3" x2="18" y2="3" stroke="#15803d" strokeWidth="2" strokeDasharray="5,3" />
          </svg>
          Prediksi
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '12px', height: '8px', background: '#bbf7d0', borderRadius: '2px', opacity: 0.7 }} />
          Rentang keyakinan
        </div>
        <div style={{ marginLeft: 'auto', color: '#9ca3af', fontSize: '0.6rem', fontStyle: 'italic' }}>
          {sourceLabel}
        </div>
      </div>

      {data.forecast_source === 'linear_trend' && (
        <div style={{
          marginTop: '8px', fontSize: '0.7rem',
          background: '#fffbeb', border: '1px solid #fcd34d',
          borderRadius: '8px', padding: '6px 10px', color: '#92400e',
        }}>
          ⚡ Prediksi sementara (tren linear). Jalankan{' '}
          <code style={{ fontSize: '0.68rem', background: '#fef3c7', padding: '1px 4px', borderRadius: '3px' }}>
            python api/prophet_forecaster.py
          </code>{' '}
          untuk prediksi Prophet ML yang lebih akurat.
        </div>
      )}
    </div>
  )
}
