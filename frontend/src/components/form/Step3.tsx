import type { Priority } from '../../types'

interface Step3Props {
  districtLabel: string
  luas: string
  modal: string
  priority: Priority
  onBack: () => void
  onStart: () => void
}

export default function Step3({ districtLabel, luas, modal, priority, onBack, onStart }: Step3Props) {
  const modalNum = parseFloat(modal) || 0
  const fmtRp = (n: number) => 'Rp ' + n.toLocaleString('id-ID')

  return (
    <div className="step-screen">
      <div className="progress-track">
        <div className="progress-step active"></div>
        <div className="progress-step active"></div>
        <div className="progress-step active"></div>
      </div>
      <div className="progress-label">Sebentar lagi selesai</div>
      <h2 className="step-title">Sudah lengkap! Kami siap bantu</h2>
      <p style={{ marginBottom: '20px', color: 'var(--ink-soft)' }}>
        Cek dulu ya, apakah sudah benar. Kalau sudah, klik tombol di bawah — kami yang hitungkan untuk Anda. ✨
      </p>

      <div className="kur-card" style={{ marginBottom: '20px' }}>
        <div style={{ fontWeight: 600, marginBottom: '12px' }}>📋 Yang sudah Anda ceritakan:</div>
        <div style={{ fontSize: '0.95rem', color: 'var(--ink-soft)', lineHeight: 1.9 }}>
          <div>📍 <strong>Lahan Anda di:</strong> {districtLabel}</div>
          <div>🌾 <strong>Luas lahan:</strong> {luas} hektare</div>
          <div>💰 <strong>Modal yang disiapkan:</strong> {modalNum > 0 ? fmtRp(modalNum) : <em>belum diisi (tidak apa-apa)</em>}</div>
          <div>🎯 <strong>Yang dicari:</strong> {priority === 'profit' ? 'Hasil yang besar' : 'Yang aman saja'}</div>
        </div>
      </div>

      <div className="button-row">
        <button className="btn btn-ghost" onClick={onBack}>← Kembali, ada yang ingin diubah</button>
        <button className="btn btn-primary" onClick={onStart}>✨ Tolong Hitungkan untuk Saya</button>
      </div>
    </div>
  )
}
