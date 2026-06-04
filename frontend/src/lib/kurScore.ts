import type { WeatherSummary } from '../components/WeatherChart'

/**
 * Transparent, data-driven KUR (Kredit Usaha Rakyat) feasibility scoring.
 *
 * Sebelumnya skor ditampilkan statis (selalu 74). Modul ini menghitung skor 0–100
 * dari data nyata yang sudah ada di layar hasil — sehingga BISA DIAUDIT: setiap
 * faktor punya kontribusi poin dan penjelasan berbasis angka, jadi petani maupun
 * pemeriksa (inspector) dapat melihat DASAR penilaiannya.
 *
 * Bobot faktor (total 100):
 *   - Tren harga 30 hari ............ 30  (kemampuan bayar dari arah harga)
 *   - Keyakinan analisis (confidence) 25  (kelengkapan data harga & cuaca)
 *   - Kesesuaian cuaca .............. 20  (risiko gagal panen)
 *   - Risiko komoditas .............. 15  (stabilitas arus kas)
 *   - Skala lahan ................... 10  (kapasitas pendapatan vs cicilan)
 */

export type FactorStatus = 'ok' | 'warn' | 'info'

export interface KurFactor {
  key: string
  label: string
  detail: string
  status: FactorStatus
  points: number
  max: number
}

export interface KurAssessment {
  score: number
  label: string
  tone: 'ok' | 'mid' | 'low'
  factors: KurFactor[]
}

export interface KurInput {
  confidence: number
  avgPrice: number
  predictedPrice: number
  risk?: string
  weatherStatus?: WeatherSummary['status'] | null
  luasHa: number
}

const ICON: Record<FactorStatus, string> = { ok: '✅', warn: '⚠️', info: 'ℹ️' }
export const factorIcon = (s: FactorStatus) => ICON[s]

export function computeKurScore(input: KurInput): KurAssessment {
  const { confidence, avgPrice, predictedPrice, risk, weatherStatus, luasHa } = input
  const factors: KurFactor[] = []

  // 1) Tren harga 30 hari (max 30)
  const priceDelta = avgPrice > 0 ? ((predictedPrice - avgPrice) / avgPrice) * 100 : 0
  {
    const max = 30
    let points: number, status: FactorStatus, detail: string
    if (priceDelta >= 5) {
      points = 30; status = 'ok'
      detail = `Harga diprediksi naik ${priceDelta.toFixed(1)}% dalam 30 hari — mendukung kemampuan bayar cicilan.`
    } else if (priceDelta >= -5) {
      points = 22; status = 'ok'
      detail = `Harga diprediksi relatif stabil (${priceDelta >= 0 ? '+' : ''}${priceDelta.toFixed(1)}%) — pendapatan terjaga.`
    } else {
      points = 10; status = 'warn'
      detail = `Harga diprediksi turun ${Math.abs(priceDelta).toFixed(1)}% — sebaiknya sisihkan cadangan untuk cicilan.`
    }
    factors.push({ key: 'price', label: 'Tren harga 30 hari ke depan', detail, status, points, max })
  }

  // 2) Keyakinan analisis AI (max 25)
  {
    const max = 25
    const c = Math.max(0, Math.min(100, Math.round(confidence)))
    const points = Math.round((c / 100) * max)
    const status: FactorStatus = c >= 75 ? 'ok' : c >= 55 ? 'info' : 'warn'
    factors.push({
      key: 'confidence',
      label: 'Keyakinan analisis data',
      detail: `Keyakinan model pada rekomendasi ini ${c}% — dari kelengkapan data harga & cuaca daerah Anda.`,
      status, points, max,
    })
  }

  // 3) Kesesuaian cuaca (max 20)
  {
    const max = 20
    let points: number, status: FactorStatus, detail: string
    if (!weatherStatus) {
      points = 13; status = 'info'
      detail = 'Data cuaca daerah sedang dimuat — faktor ini dinilai netral untuk sementara.'
    } else if (weatherStatus === 'normal') {
      points = 20; status = 'ok'
      detail = 'Cuaca normal — risiko gagal panen relatif rendah.'
    } else if (weatherStatus === 'kemarau') {
      points = 12; status = 'warn'
      detail = 'Cenderung kemarau — siapkan irigasi tambahan agar panen tetap aman.'
    } else {
      points = 12; status = 'warn'
      detail = 'Curah hujan tinggi — waspadai genangan & penyakit tanaman.'
    }
    factors.push({ key: 'weather', label: 'Kesesuaian cuaca daerah', detail, status, points, max })
  }

  // 4) Risiko komoditas (max 15)
  {
    const max = 15
    const r = (risk ?? '').toLowerCase()
    let points: number, status: FactorStatus, detail: string
    if (r.includes('kecil') || r.includes('rendah')) {
      points = 15; status = 'ok'; detail = 'Komoditas berisiko kecil — arus kas lebih dapat diandalkan untuk cicilan.'
    } else if (r.includes('besar') || r.includes('tinggi')) {
      points = 6; status = 'warn'; detail = 'Komoditas berisiko tinggi — pertimbangkan diversifikasi tanaman.'
    } else {
      points = 10; status = 'info'; detail = 'Komoditas berisiko sedang — kelola modal dengan hati-hati.'
    }
    factors.push({ key: 'risk', label: 'Risiko komoditas', detail, status, points, max })
  }

  // 5) Skala lahan (max 10)
  {
    const max = 10
    const ha = Number.isFinite(luasHa) ? luasHa : 0
    let points: number, status: FactorStatus, detail: string
    if (ha >= 1) { points = 10; status = 'ok'; detail = `Luas ${ha} ha memberi skala pendapatan memadai untuk cicilan.` }
    else if (ha >= 0.3) { points = 7; status = 'info'; detail = `Luas ${ha} ha tergolong kecil-menengah — sesuai plafon KUR Mikro.` }
    else { points = 4; status = 'warn'; detail = `Luas ${ha} ha relatif kecil — ajukan plafon yang realistis.` }
    factors.push({ key: 'scale', label: 'Skala lahan', detail, status, points, max })
  }

  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)))

  let label: string, tone: 'ok' | 'mid' | 'low'
  if (score >= 75) { label = 'Sangat layak diajukan'; tone = 'ok' }
  else if (score >= 60) { label = 'Layak diajukan'; tone = 'ok' }
  else if (score >= 45) { label = 'Cukup layak — perkuat dokumen'; tone = 'mid' }
  else { label = 'Perlu dikaji ulang dulu'; tone = 'low' }

  return { score, label, tone, factors }
}
