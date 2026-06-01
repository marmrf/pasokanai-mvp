import type { Priority } from '../../types'

interface Step2Props {
  modal: string
  priority: Priority
  onModalChange: (v: string) => void
  onPriorityChange: (p: Priority) => void
  onBack: () => void
  onNext: () => void
}

export default function Step2({ modal, priority, onModalChange, onPriorityChange, onBack, onNext }: Step2Props) {
  const handleNext = () => {
    if (!priority) { alert('Pilih dulu yang Anda cari: hasil besar atau yang aman saja? 🙏'); return }
    onNext()
  }

  return (
    <div className="step-screen">
      <div className="progress-track">
        <div className="progress-step active"></div>
        <div className="progress-step active"></div>
        <div className="progress-step"></div>
      </div>
      <div className="progress-label">Pertanyaan 2 dari 3</div>
      <h2 className="step-title">Apa yang lebih penting bagi Anda?</h2>
      <p style={{ marginBottom: '24px', color: 'var(--ink-soft)', fontSize: '0.95rem' }}>
        Tidak ada jawaban yang salah — kami hanya ingin tahu prioritas Anda supaya saran kami lebih pas. 🙏
      </p>

      <div className="form-group">
        <label className="form-label" htmlFor="modal">💰 Modal yang sudah Anda siapkan</label>
        <div className="input-row">
          <span className="input-suffix">Rp</span>
          <input
            id="modal"
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="cth: 5000000 (5 juta)"
            className="form-input"
            value={modal}
            onChange={e => onModalChange(e.target.value)}
          />
        </div>
        <div className="form-hint">
          Belum tahu pastinya? Kosongkan saja — kami tetap bisa bantu. 👍
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">🎯 Mana yang Anda cari?</label>
        <div className="priority-grid">
          <button
            className={`priority-card${priority === 'profit' ? ' selected' : ''}`}
            onClick={() => onPriorityChange('profit')}
          >
            <div className="priority-icon">📈</div>
            <h4>Hasil yang besar</h4>
            <p>Cari untung lebih banyak, walau ada sedikit risiko</p>
          </button>
          <button
            className={`priority-card${priority === 'safe' ? ' selected' : ''}`}
            onClick={() => onPriorityChange('safe')}
          >
            <div className="priority-icon">🛡️</div>
            <h4>Yang aman saja</h4>
            <p>Hasil pasti, walau tidak terlalu besar</p>
          </button>
        </div>
      </div>

      <div className="button-row">
        <button className="btn btn-ghost" onClick={onBack}>← Kembali</button>
        <button className="btn btn-primary" onClick={handleNext} disabled={!priority}>
          Lanjut, Pertanyaan Terakhir →
        </button>
      </div>
    </div>
  )
}
