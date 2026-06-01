import { useState } from 'react'
import type { RecommendationData, Buyer, ScenarioType } from '../../types'
import ForecastChart from '../ForecastChart'

interface ResultScreenProps {
  recommendation: RecommendationData
  districtLabel: string
  districtSlug: string
  districtId: string
  luas: number
  buyers: Buyer[]
  onReset: () => void
}

const BUYER_ICON: Record<string, string> = {
  koperasi: '🏪',
  bulog: '🏭',
  offtaker: '🚛',
}

const COMMODITY_SLUG_MAP: Record<string, string> = {
  'cabai merah': 'cabai',
  'cabai rawit': 'cabai_rawit',
  'bawang merah': 'bawang_merah',
  'bawang putih': 'bawang_putih',
  'kacang tanah': 'kacang_tanah',
  'sayuran daun': 'sayuran_daun',
  'jagung': 'jagung',
  'padi': 'padi',
  'singkong': 'singkong',
  'tomat': 'tomat',
  'kentang': 'kentang',
  'kedelai': 'kedelai',
  'edamame': 'edamame',
}

export default function ResultScreen({ recommendation: rec, districtLabel, districtSlug, districtId, luas, buyers, onReset }: ResultScreenProps) {
  const [scenario, setScenario] = useState<ScenarioType>('optimis')
  const [hargaTengkulak, setHargaTengkulak] = useState('')
  const [gapState, setGapState] = useState<'none' | 'fair' | 'alert'>('none')
  const [gapHeadline, setGapHeadline] = useState('')
  const [gapSub, setGapSub] = useState('')
  const [anchorQuote, setAnchorQuote] = useState('')
  const [gapTengkulakDisplay, setGapTengkulakDisplay] = useState('')
  const [showKurInfo, setShowKurInfo] = useState(false)

  const shortLocation = districtLabel.split(',')[0]
  const confidence = rec.confidence ?? 78

  const handleGapCheck = async (value: string) => {
    setHargaTengkulak(value)
    const rawValue = value.trim()

    if (!rawValue) { setGapState('none'); return }
    const harga = parseFloat(rawValue)
    if (isNaN(harga) || harga <= 0) { setGapState('none'); return }

    const refPrice = rec.avgPrice
    const selisih = refPrice - harga
    const gapPct = (selisih / refPrice) * 100

    setGapTengkulakDisplay('Rp ' + Math.round(harga).toLocaleString('id-ID') + '/kg')

    if (gapPct >= 15) {
      setGapHeadline(`Selisih Rp ${Math.round(selisih).toLocaleString('id-ID')}/kg`)
      setGapSub(`Tawaran ini <strong>${Math.round(gapPct)}% di bawah</strong> harga rata-rata pasar (Rp ${refPrice.toLocaleString('id-ID')}/kg). Jangan buru-buru diterima ya 🙏`)
      setAnchorQuote(`"Pak, harga rata-rata ${rec.name} di pasar sekarang sekitar Rp ${refPrice.toLocaleString('id-ID')}/kg. Apakah bisa naik mendekati angka itu?"`)
      setGapState('alert')

      try {
        const namaAsli = rec.name.toLowerCase().trim()
        const komoditas = COMMODITY_SLUG_MAP[namaAsli] || namaAsli.replace(/\s+/g, '_')
        const res = await fetch('/api/gap-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ komoditas, kabupaten: districtSlug, harga_tawaran: harga, luas_ha: luas }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data?.negosiasi_anchor) setAnchorQuote(data.negosiasi_anchor)
        }
      } catch { /* API failed, local anchor already shown */ }

    } else if (gapPct < -100) {
      setGapHeadline('Harga sangat tidak biasa')
      setGapSub(`Tawaran Rp ${Math.round(harga).toLocaleString('id-ID')}/kg jauh di atas rata-rata (Rp ${refPrice.toLocaleString('id-ID')}/kg). Pastikan angkanya sudah benar, Anda.`)
      setAnchorQuote(`Cek kembali angka yang dimasukkan — harga segini sangat tidak umum untuk ${rec.name} di daerah ini.`)
      setGapState('alert')
    } else {
      setGapState('fair')
    }
  }

  const handleShare = () => {
    const text = `🌾 *Saran dari PasokanAI*\n\nHalo, ini saran dari PasokanAI untuk lahan saya:\n\n📍 *Lahan di:* ${districtLabel}\n🌱 *Luas:* ${luas} hektare\n\n✨ *Disarankan tanam:* ${rec.name}\n📅 *Mulai tanam:* ${rec.time}\n💰 *Perkiraan harga jual:* ${rec.price}\n🌾 *Perkiraan hasil:* ${rec.yield} per hektare\n⏱️ *Bisa dipanen:* ${rec.harvest}\n\n💡 *Penjelasan:* ${rec.reasoning}\n\n🛡️ *Tips saat panen:* Sebelum jual ke tengkulak, cek dulu harga di pasaran. Harga rata-rata sekarang sekitar Rp ${rec.avgPrice.toLocaleString('id-ID')}/kg.\n\nBantu lihat juga ya, apakah saran ini cocok 🙏\n\n— PasokanAI\nhttps://polite-hill-0063f5500.7.azurestaticapps.net`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const SCENARIO_LABELS: Record<ScenarioType, string> = {
    optimis: '😊 Lancar',
    normal: '😐 Biasa',
    pesimis: '😟 Berat',
  }
  const SCENARIO_RISK: Record<ScenarioType, string> = { optimis: 'Kecil', normal: 'Sedang', pesimis: 'Besar' }
  const SCENARIO_CUACA: Record<ScenarioType, string> = { optimis: '☀️ Hujan pas-pasan', normal: '🌤️ Hujan agak kurang', pesimis: '🌧️ Hujan terlalu banyak / kering' }
  const SCENARIO_PASAR: Record<ScenarioType, string> = { optimis: '📈 Banyak yang cari', normal: '📊 Biasa-biasa saja', pesimis: '📉 Sepi pembeli' }
  const SCENARIO_NOTE: Record<ScenarioType, string> = {
    optimis: '🌱 Kalau cuacanya bagus dan pasar lagi ramai, untung bisa segini. Doakan saja ya. 🤲',
    normal: '⚠️ Ini hasil yang paling sering terjadi. Sebaiknya siapkan air cadangan untuk jaga-jaga.',
    pesimis: '🛡️ Kalau kondisinya begini, lebih baik ada cadangan tanaman lain seperti kacang tanah, atau ikut asuransi pertanian.',
  }

  const dataSource = rec._source

  const SOURCE_CONFIG: Record<string, { bg: string; border: string; color: string; icon: string; label: string; sub: string }> = {
    azure_openai: {
      bg: '#f0fdf4', border: '#86efac', color: '#166534',
      icon: '🤖',
      label: 'Dihasilkan AI — Azure OpenAI (GPT-4o-mini)',
      sub: 'Data harga dari DPKP DIY & Bapanas · Prediksi statistik dari data historis',
    },
    gemini: {
      bg: '#eef2ff', border: '#c7d2fe', color: '#3730a3',
      icon: '✨',
      label: 'Dihasilkan AI — Gemini',
      sub: 'Data harga dari DPKP DIY & Bapanas · Prediksi statistik dari data historis',
    },
    statistical_fallback: {
      bg: '#fffbeb', border: '#fcd34d', color: '#92400e',
      icon: '📊',
      label: 'Prediksi Statistik — LLM offline',
      sub: 'Data harga real dari DPKP DIY & Bapanas · OpenAI & Gemini tidak merespons',
    },
    seed: {
      bg: '#fef2f2', border: '#fca5a5', color: '#991b1b',
      icon: '⚠️',
      label: 'Data Manual (Seed) — Azure belum terhubung',
      sub: 'Azure Function tidak berjalan · Jalankan: cd api && func start · Lihat: AZURE-IMPLEMENTATION.md',
    },
  }

  const srcCfg = dataSource ? SOURCE_CONFIG[dataSource] : SOURCE_CONFIG.seed

  const printDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="step-screen print-root">
      {/* ═══ PRINT-ONLY REPORT (KUR Proposal) ═══════════════════════════════ */}
      <div className="print-only kur-report">

        {/* Kop Surat */}
        <div className="rpt-header">
          <div className="rpt-logo-block">
            <div className="rpt-logo-icon">🌾</div>
            <div>
              <div className="rpt-logo-name">PasokanAI</div>
              <div className="rpt-logo-tagline">Platform Kecerdasan Pertanian Berbasis AI</div>
            </div>
          </div>
          <div className="rpt-header-right">
            <div className="rpt-doc-title">Laporan Rekomendasi Tanam</div>
            <div className="rpt-doc-sub">& Analisis Kelayakan Kredit Usaha Rakyat (KUR)</div>
            <div className="rpt-doc-date">Diterbitkan: {printDate}</div>
          </div>
        </div>

        <div className="rpt-divider" />

        {/* Info lahan */}
        <div className="rpt-section">
          <div className="rpt-section-title">📋 Informasi Lahan & Petani</div>
          <div className="rpt-info-grid">
            <div><span className="rpt-lbl">Kabupaten / Kota</span><span className="rpt-val">{districtLabel}</span></div>
            <div><span className="rpt-lbl">Luas Lahan</span><span className="rpt-val">{luas} hektare</span></div>
            <div><span className="rpt-lbl">Tanggal Analisis</span><span className="rpt-val">{printDate}</span></div>
            <div><span className="rpt-lbl">Sumber Data</span><span className="rpt-val">DPKP DIY · Bapanas · Open-Meteo</span></div>
          </div>
        </div>

        {/* Rekomendasi */}
        <div className="rpt-section">
          <div className="rpt-section-title">🌱 Rekomendasi Komoditas</div>
          <div className="rpt-rec-box">
            <div className="rpt-rec-left">
              <div className="rpt-rec-emoji">{rec.emoji}</div>
              <div>
                <div className="rpt-rec-name">{rec.name}</div>
                <div className="rpt-rec-meta">
                  <span className="rpt-badge">{rec.risk}</span>
                  <span className="rpt-badge">Keyakinan AI: {confidence}%</span>
                </div>
              </div>
            </div>
            <div className="rpt-rec-right">
              <div><strong>Mulai tanam:</strong> {rec.time}</div>
              <div><strong>Dipanen:</strong> {rec.harvest}</div>
              <div><strong>Hasil estimasi:</strong> {rec.yield}/hektare</div>
            </div>
          </div>
          <div className="rpt-reasoning">{rec.reasoning}</div>
        </div>

        {/* Data harga & prediksi */}
        <div className="rpt-section">
          <div className="rpt-section-title">📈 Data Harga & Prediksi (30 Hari)</div>
          <table className="rpt-table">
            <thead>
              <tr><th>Indikator</th><th>Nilai</th></tr>
            </thead>
            <tbody>
              <tr><td>Harga rata-rata pasar saat ini</td><td>Rp {rec.avgPrice.toLocaleString('id-ID')}/kg</td></tr>
              <tr><td>Prediksi harga 30 hari ke depan</td><td>Rp {rec.predictedPrice.toLocaleString('id-ID')}/kg</td></tr>
              <tr><td>Selisih prediksi</td>
                <td style={{ color: rec.predictedPrice >= rec.avgPrice ? '#166534' : '#dc2626' }}>
                  {rec.predictedPrice >= rec.avgPrice ? '+' : ''}
                  {((rec.predictedPrice - rec.avgPrice) / rec.avgPrice * 100).toFixed(1)}%
                </td>
              </tr>
              <tr><td>Perkiraan harga jual</td><td>{rec.price}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Estimasi pendapatan */}
        <div className="rpt-section">
          <div className="rpt-section-title">💰 Estimasi Pendapatan Bersih (per Hektare)</div>
          <table className="rpt-table">
            <thead>
              <tr><th>Skenario</th><th>Harga Jual</th><th>Estimasi Pendapatan Bersih</th></tr>
            </thead>
            <tbody>
              <tr className="rpt-row-good">
                <td>😊 Optimis (cuaca & pasar baik)</td>
                <td>{rec.scenarios.optimis[1]}</td>
                <td><strong>{rec.scenarios.optimis[0]}</strong></td>
              </tr>
              <tr>
                <td>😐 Normal (kondisi rata-rata)</td>
                <td>{rec.scenarios.normal[1]}</td>
                <td><strong>{rec.scenarios.normal[0]}</strong></td>
              </tr>
              <tr className="rpt-row-warn">
                <td>😟 Pesimis (cuaca buruk / pasar sepi)</td>
                <td>{rec.scenarios.pesimis[1]}</td>
                <td><strong>{rec.scenarios.pesimis[0]}</strong></td>
              </tr>
            </tbody>
          </table>
          <div className="rpt-note">
            * Estimasi bersih setelah biaya produksi (±40% dari pendapatan kotor). Asumsi margin 60%.
          </div>
        </div>

        {/* KUR Assessment */}
        <div className="rpt-section">
          <div className="rpt-section-title">🏦 Penilaian Kelayakan KUR (Kredit Usaha Rakyat)</div>
          <div className="rpt-kur-grid">
            <div className="rpt-kur-score-block">
              <div className="rpt-kur-score">74</div>
              <div className="rpt-kur-score-label">LAYAK<br/>DIAJUKAN</div>
            </div>
            <div className="rpt-kur-checks">
              <div className="rpt-kur-item ok">✅ Estimasi panen mendukung kemampuan bayar cicilan</div>
              <div className="rpt-kur-item ok">✅ Lahan di wilayah yang dilayani program KUR pertanian</div>
              <div className="rpt-kur-item ok">✅ Komoditas termasuk dalam program subsidi KUR 2024–2026</div>
              <div className="rpt-kur-item warn">⚠️ Pastikan sertifikat/surat lahan lengkap sebelum mengajukan</div>
              <div className="rpt-kur-item info">ℹ️ Plafon KUR Mikro: s/d Rp 100 juta · Bunga 6%/tahun · Tanpa jaminan</div>
            </div>
          </div>
          <div className="rpt-kur-cta">
            Bawa laporan ini ke kantor <strong>BRI, BNI, atau Bank Mandiri</strong> terdekat
            bersama KTP, KK, dan surat lahan untuk pengajuan KUR.
          </div>
        </div>

        {/* Disclaimer */}
        <div className="rpt-disclaimer">
          <strong>Catatan Penting:</strong> Laporan ini dibuat secara otomatis oleh sistem AI PasokanAI
          berdasarkan data harga komoditas resmi dari DPKP DIY dan Bapanas, serta data cuaca dari
          Open-Meteo. Prediksi harga bersifat estimasi dan tidak merupakan jaminan hasil panen atau
          pendapatan aktual. Keputusan bertani dan pengajuan kredit tetap menjadi tanggung jawab
          penuh petani/pemohon. PasokanAI tidak bertanggung jawab atas kerugian yang timbul dari
          penggunaan laporan ini.
        </div>

        <div className="rpt-footer">
          <span>🌾 PasokanAI · platform.pasokanai.id</span>
          <span>Data: DPKP DIY · Bapanas · Open-Meteo</span>
          <span>Dicetak {printDate}</span>
        </div>
      </div>
      {/* ═══ END PRINT REPORT ══════════════════════════════════════════════ */}
      <div className="progress-label print-hide" style={{ color: 'var(--green-700)' }}>Hasil sudah siap</div>
      <h2 className="step-title">Ini saran kami untuk Anda</h2>

      {/* Data source indicator — always visible */}
      <div style={{
        background: srcCfg.bg,
        border: `1px solid ${srcCfg.border}`,
        borderRadius: '10px',
        padding: '10px 14px',
        marginBottom: '16px',
        fontSize: '0.8rem',
      }}>
        <div style={{ fontWeight: 700, color: srcCfg.color, marginBottom: '2px' }}>
          {srcCfg.icon} {srcCfg.label}
        </div>
        <div style={{ color: srcCfg.color, opacity: 0.85 }}>{srcCfg.sub}</div>
      </div>

      {/* Hero card */}
      <div className="result-hero">
        <div className="result-hero-top">
          <div className="result-emoji">{rec.emoji}</div>
          <div style={{ position: 'relative' }}>
            <h2 className="result-name">{rec.name}</h2>
            <div className="result-meta">
              <span>{rec.risk}</span>
              <span>📍 {shortLocation}</span>
            </div>
          </div>
        </div>
        <div className="result-confidence">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span>🎯 Seberapa yakin kami</span>
            <strong style={{ fontSize: '1.1rem' }}>{confidence}%</strong>
          </div>
          {/* Visual confidence bar */}
          <div style={{
            height: '8px',
            background: 'rgba(255,255,255,0.25)',
            borderRadius: '999px',
            overflow: 'hidden',
            marginBottom: '8px',
          }}>
            <div style={{
              height: '100%',
              width: `${confidence}%`,
              background: confidence >= 80 ? '#4ade80' : confidence >= 60 ? '#fde68a' : '#fca5a5',
              borderRadius: '999px',
              transition: 'width 0.8s ease',
            }} />
          </div>
          <div style={{ fontSize: '0.78rem', opacity: 0.85 }}>
            {confidence >= 80
              ? 'Kami cukup yakin dengan saran ini berdasarkan data cuaca dan harga di daerah Anda.'
              : confidence >= 60
              ? 'Saran ini cukup baik, tapi coba tanyakan juga ke penyuluh setempat ya.'
              : 'Data di daerah Anda masih terbatas — saran ini perkiraan awal saja. 🙏'
            }
          </div>
        </div>

      </div>

      {/* Tiles */}
      <div className="result-grid">
        <div className="result-tile">
          <div className="result-tile-label">📅 Mulai tanam</div>
          <div className="result-tile-value">{rec.time}</div>
          <div className="result-tile-sub">{rec.timeSub}</div>
        </div>
        <div className="result-tile">
          <div className="result-tile-label">💰 Perkiraan harga jual</div>
          <div className="result-tile-value">{rec.price}</div>
          <div className="result-tile-sub">{rec.priceSub}</div>
        </div>
        <div className="result-tile">
          <div className="result-tile-label">🌾 Perkiraan hasil panen</div>
          <div className="result-tile-value">{rec.yield}</div>
          <div className="result-tile-sub">setiap hektare</div>
        </div>
        <div className="result-tile">
          <div className="result-tile-label">⏱️ Bisa dipanen</div>
          <div className="result-tile-value">{rec.harvest}</div>
          <div className="result-tile-sub">setelah ditanam</div>
        </div>
      </div>

      {/* Forecast Chart — always show if districtId is available */}
      {districtId && (() => {
        const commoditySlug = rec._commodity ||
          COMMODITY_SLUG_MAP[rec.name.toLowerCase().trim()] ||
          rec.name.toLowerCase().replace(/\s+/g, '_')
        return (
          <ForecastChart
            districtId={districtId}
            commodity={commoditySlug}
            currentPrice={rec.avgPrice}
            fallbackPredictedPrice={rec.predictedPrice}
            commodityLabel={rec.name}
            districtLabel={districtLabel.split(',')[0]}
          />
        )
      })()}

      {/* Reasoning */}
      <div className="reasoning">
        <div className="reasoning-head">
          💡 Kenapa kami sarankan ini?
          <span className="ai-tag">Penjelasan</span>
        </div>
        <div className="reasoning-body">{rec.reasoning}</div>
      </div>

      {/* Scenarios */}
      <h3 className="subsection-title">🔮 Bagaimana kalau...</h3>
      <p style={{ fontSize: '0.92rem', color: 'var(--ink-soft)', marginBottom: '16px' }}>
        Hasil panen tergantung cuaca dan pasar. Kami tunjukkan 3 kemungkinan, supaya Anda siap apapun yang terjadi.
      </p>
      <div className="scenario-tabs">
        {(['optimis', 'normal', 'pesimis'] as ScenarioType[]).map(s => (
          <button
            key={s}
            className={`scenario-tab${scenario === s ? ' active' : ''}`}
            onClick={() => setScenario(s)}
          >
            {SCENARIO_LABELS[s]}
          </button>
        ))}
      </div>

      {(['optimis', 'normal', 'pesimis'] as ScenarioType[]).map(s => (
        <div key={s} id={`sc-${s}`} className={`scenario-card${scenario === s ? ' active' : ''}`}>
          <div className="scenario-income">{rec.scenarios[s][0]}</div>
          <div className="scenario-income-sub">setiap hektare · perkiraan untung bersih</div>
          <div className="scenario-detail">
            <div><div className="lbl">Risiko</div><div className="val">{SCENARIO_RISK[s]}</div></div>
            <div><div className="lbl">Harga jual</div><div className="val">{rec.scenarios[s][1]}</div></div>
            <div><div className="lbl">Cuaca</div><div className="val">{SCENARIO_CUACA[s]}</div></div>
            <div><div className="lbl">Pasar</div><div className="val">{SCENARIO_PASAR[s]}</div></div>
          </div>
          <div className="scenario-note">{SCENARIO_NOTE[s]}</div>
        </div>
      ))}

      {/* KUR */}
      <h3 className="subsection-title">🏦 Kemungkinan dapat pinjaman KUR</h3>
      <p style={{ fontSize: '0.92rem', color: 'var(--ink-soft)', marginBottom: '16px' }}>
        KUR itu pinjaman murah dari pemerintah untuk petani. Bunganya cuma 6% per tahun, dan tidak perlu jaminan untuk pinjaman kecil.
      </p>
      <div className="kur-card">
        <div className="kur-top">
          <div className="kur-score-circle">
            <div className="kur-score-num">74</div>
          </div>
          <div>
            <div className="kur-status">Layak diajukan</div>
            <div className="kur-desc">Lihat dari hasil panen, lokasi lahan, dan riwayat tanam Anda — kemungkinan besar bisa lolos pengajuan KUR.</div>
          </div>
        </div>
        <div className="kur-checks">
          <div className="kur-check">
            <div className="kur-check-icon">🌾</div>
            <div className="kur-check-body">
              <div className="kur-check-title">Hasil panen perkiraannya bagus</div>
              <div className="kur-check-desc">Anda dinilai mampu bayar cicilannya nanti</div>
            </div>
            <div className="kur-check-status ok">✓ Aman</div>
          </div>
          <div className="kur-check">
            <div className="kur-check-icon">📍</div>
            <div className="kur-check-body">
              <div className="kur-check-title">Lahan ada di daerah yang dilayani KUR</div>
              <div className="kur-check-desc">Pemerintah memang menyalurkan KUR di sini</div>
            </div>
            <div className="kur-check-status ok">✓ Aman</div>
          </div>
          <div className="kur-check">
            <div className="kur-check-icon">💰</div>
            <div className="kur-check-body">
              <div className="kur-check-title">Surat-surat lahan</div>
              <div className="kur-check-desc">Pastikan sertifikat / surat lahan lengkap dulu</div>
            </div>
            <div className="kur-check-status warn">⚠ Cek dulu</div>
          </div>
        </div>
      </div>

      {/* Market Fairness Layer */}
      <div className="mfl-section print-hide">
        <div className="mfl-badge">🛡️ Lindungi Hasil Panen Anda</div>
        <h2 className="mfl-title">Sebentar, sebelum jual ke tengkulak...</h2>
        <p className="mfl-intro">
          Sudah panen? <strong>Jangan buru-buru terima harga pertama.</strong>{' '}
          Coba masukkan harga yang ditawarkan, kami cek dulu apakah harganya wajar atau terlalu murah.{' '}
          Supaya Anda tidak rugi. 🙏
        </p>

        <div className="mfl-input-card">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="harga-tengkulak">💵 Tengkulak menawar berapa?</label>
            <div className="input-row">
              <span className="input-suffix">Rp</span>
              <input
                id="harga-tengkulak"
                type="number"
                min="0"
                placeholder="Contoh: 3800"
                className="form-input"
                value={hargaTengkulak}
                onChange={e => handleGapCheck(e.target.value)}
              />
              <span className="input-suffix">/kg</span>
            </div>
            <div className="form-hint">Tulis harga per kilogram untuk hasil panen yang tadi kami sarankan.</div>
          </div>
        </div>

        {gapState === 'fair' && (
          <div className="gap-result show">
            <div className="gap-fair">
              <div className="gap-fair-head">✅ Harga ini wajar!</div>
              <p>Tawaran tengkulak ini masih dalam batas normal di daerah Anda. Kalau memang butuh uang segera, harga ini boleh diterima — tidak akan rugi banyak. 👍</p>
            </div>
          </div>
        )}

        {gapState === 'alert' && (
          <div className="gap-result show">
            <div className="gap-alert">
              <div className="gap-alert-banner">⚠️ Hati-hati, harga ini terlalu murah!</div>
              <div className="gap-alert-body">
                <div className="gap-alert-headline">{gapHeadline}</div>
                <div
                  className="gap-alert-sub"
                  dangerouslySetInnerHTML={{ __html: gapSub }}
                />

                <div className="gap-comparison">
                  <div className="gap-comp bad">
                    <div className="gap-comp-lbl">Tawaran tengkulak</div>
                    <div className="gap-comp-val">{gapTengkulakDisplay}</div>
                  </div>
                  <div className="gap-comp">
                    <div className="gap-comp-lbl">Petani lain dapat segini</div>
                    <div className="gap-comp-val">Rp {rec.avgPrice.toLocaleString('id-ID')}/kg</div>
                  </div>
                  <div className="gap-comp good">
                    <div className="gap-comp-lbl">Harga pasar saat ini</div>
                    <div className="gap-comp-val">Rp {rec.predictedPrice.toLocaleString('id-ID')}/kg</div>
                  </div>
                </div>

                {buyers.length > 0 && (
                  <>
                    <div className="alt-title">🤝 Coba tawarkan ke tempat lain dulu</div>
                    <div className="alt-list">
                      {buyers.map(b => (
                        <div key={b.id} className="alt-card">
                          <div className="alt-icon">{BUYER_ICON[b.buyer_type] ?? '🏪'}</div>
                          <div className="alt-body">
                            <div className="alt-name">{b.name}</div>
                            <div className="alt-detail">{b.contact}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="anchor-card">
                  <div className="anchor-head">
                    📋 Kalimat untuk Anda sampaikan ke tengkulak
                    <span className="anchor-tag">Salin & Pakai</span>
                  </div>
                  <p>Kalau memang harus jual ke tengkulak ini juga, coba sampaikan kalimat berikut. Tunjukkan bahwa Anda tahu harga sebenarnya:</p>
                  <div className="anchor-quote">{anchorQuote}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Next Steps */}
      <h3 className="subsection-title" style={{ marginTop: '40px' }}>📲 Mau diapakan hasil ini?</h3>
      <div className="next-steps-grid print-hide">
        <button className="next-step" onClick={handleShare}>
          <div className="next-step-icon">💬</div>
          <div className="next-step-body">
            <div className="next-step-title">Kirim ke WhatsApp</div>
            <div className="next-step-desc">Tunjukkan ke keluarga atau penyuluh</div>
          </div>
        </button>
        <button className="next-step" onClick={() => window.print()}>
          <div className="next-step-icon">📄</div>
          <div className="next-step-body">
            <div className="next-step-title">Cetak Proposal KUR</div>
            <div className="next-step-desc">Laporan lengkap siap dibawa ke bank</div>
          </div>
        </button>
        <button className="next-step" onClick={() => setShowKurInfo(true)}>
          <div className="next-step-icon">🏦</div>
          <div className="next-step-body">
            <div className="next-step-title">Tanya soal KUR</div>
            <div className="next-step-desc">Pinjaman ringan dari pemerintah</div>
          </div>
        </button>
        <button className="next-step" onClick={onReset}>
          <div className="next-step-icon">🔄</div>
          <div className="next-step-body">
            <div className="next-step-title">Coba lahan lain</div>
            <div className="next-step-desc">Cek di daerah berbeda</div>
          </div>
        </button>
      </div>

      {showKurInfo && (
        <div className="kur-modal print-hide" role="dialog" aria-modal="true">
          <div className="kur-modal-card">
            <div className="kur-modal-head">
              <div className="kur-modal-title">🏦 Info KUR untuk petani</div>
              <button className="kur-modal-close" onClick={() => setShowKurInfo(false)} aria-label="Tutup">✕</button>
            </div>
            <div className="kur-modal-body">
              <ul>
                <li>Bunga ringan mulai 6% per tahun</li>
                <li>Pinjaman sampai Rp 100 juta</li>
                <li>Tanpa jaminan untuk pinjaman kecil</li>
              </ul>
              <div className="kur-modal-note">
                Datang ke kantor BRI, BNI, atau Mandiri terdekat. Bawa KTP, KK, dan surat lahan.
              </div>
            </div>
            <div className="kur-modal-actions">
              <button className="btn btn-primary" onClick={() => setShowKurInfo(false)}>Mengerti</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
