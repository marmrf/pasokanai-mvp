import { useMemo, useState } from 'react'
import type { District, Priority } from '../../types'
import { INDONESIA_REGIONS, type IndonesiaRegion } from '../../data/indonesia-regions'
import DistrictCombobox from './DistrictCombobox'
import InfoModal from '../common/InfoModal'
import Toast, { type ToastTone } from '../common/Toast'

interface InputFormProps {
  districts: District[]
  districtId: string
  districtLabel: string
  luas: string
  modal: string
  priority: Priority
  fetchError: string
  onDistrictChange: (id: string, label: string) => void
  onLuasChange: (v: string) => void
  onModalChange: (v: string) => void
  onPriorityChange: (p: Priority) => void
  onStart: () => void
}

const norm = (s: string) => s.toLowerCase().replace(/[.,]/g, ' ').trim()

/**
 * Single-screen input (revisi #1): semua pertanyaan dalam satu halaman supaya
 * hasil input suara (daerah + luas) dan isian manual lain berada di layar yang
 * sama. Voice mengisi daerah & luas; field lain dilengkapi manual di bawahnya.
 */
export default function InputForm({
  districts,
  districtId,
  districtLabel,
  luas,
  modal,
  priority,
  fetchError,
  onDistrictChange,
  onLuasChange,
  onModalChange,
  onPriorityChange,
  onStart,
}: InputFormProps) {
  // Reconstruct selection on (re)mount from props so going back keeps the choice
  const [selectedRegion, setSelectedRegion] = useState<IndonesiaRegion | null>(() => {
    if (!districtLabel) return null
    const nm = districtLabel.split(',')[0].trim()
    return (
      INDONESIA_REGIONS.find(r => norm(r.name) === norm(nm)) ??
      { name: nm, province: '', hasData: Boolean(districtId) }
    )
  })
  const [showWaitlist, setShowWaitlist] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tone: ToastTone } | null>(null)

  const [speechStatus, setSpeechStatus] = useState<'idle' | 'listening' | 'error'>('idle')
  const [speechError, setSpeechError] = useState('')
  const speechKey = import.meta.env.VITE_AZURE_SPEECH_KEY as string | undefined
  const speechRegion = import.meta.env.VITE_AZURE_SPEECH_REGION as string | undefined
  const speechReady = Boolean(speechKey && speechRegion)

  const districtByName = useMemo(() => {
    const map = new Map<string, District>()
    districts.forEach(d => map.set(norm(d.name), d))
    return map
  }, [districts])

  const fire = (msg: string, tone: ToastTone = 'warn') => setToast({ msg, tone })

  /** Resolve a picked region to a Supabase districtId (DIY only) and bubble up. */
  const selectRegion = (region: IndonesiaRegion | null) => {
    setSelectedRegion(region)
    if (!region) { onDistrictChange('', ''); return }
    const match = region.hasData ? districtByName.get(norm(region.name)) : undefined
    const label = region.province ? `${region.name}, ${region.province}` : region.name
    onDistrictChange(match?.id ?? '', label)
  }

  const applySpeechResult = (text: string) => {
    const normalized = norm(text)
    // Prefer regions that actually have data, then any region
    const pool = [...INDONESIA_REGIONS].sort((a, b) => (b.hasData ? 1 : 0) - (a.hasData ? 1 : 0))
    const match = pool.find(r => normalized.includes(norm(r.name)))
    if (match) selectRegion(match)

    const numberMatch = normalized.match(/(\d+(?:[.,]\d+)?)/)
    if (numberMatch) onLuasChange(numberMatch[1].replace(',', '.'))

    if (!match && !numberMatch) {
      setSpeechError('Kami belum bisa menangkap lokasi atau luas lahan. Coba sebutkan kabupaten dan luasnya sekali lagi.')
      setSpeechStatus('error')
    }
  }

  const handleSpeechInput = async () => {
    if (!speechReady || speechStatus === 'listening') return
    setSpeechStatus('listening')
    setSpeechError('')
    try {
      const sdk = await import('microsoft-cognitiveservices-speech-sdk')
      const config = sdk.SpeechConfig.fromSubscription(speechKey as string, speechRegion as string)
      config.speechRecognitionLanguage = 'id-ID'
      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput()
      const recognizer = new sdk.SpeechRecognizer(config, audioConfig)
      recognizer.recognizeOnceAsync(result => {
        if (result?.text) {
          applySpeechResult(result.text)
          setSpeechStatus('idle')
        } else {
          setSpeechError('Suara belum terbaca. Coba ulangi dengan suara lebih jelas.')
          setSpeechStatus('error')
        }
        recognizer.close()
      })
    } catch {
      setSpeechError('Fitur suara belum siap. Pastikan izin mikrofon dan coba lagi.')
      setSpeechStatus('error')
    }
  }

  const handleSubmit = () => {
    if (!selectedRegion) { fire('Pilih daerah lahan Anda dulu ya 😊'); return }
    const luasNum = parseFloat(luas)
    if (!luas || luasNum <= 0) { fire('Tolong isi luas lahannya dulu. Perkiraan saja sudah cukup 🙏'); return }
    if (!priority) { fire('Pilih dulu yang Anda cari: hasil besar atau yang aman? 🙏'); return }
    // Honest gating: daerah tanpa data → modal "segera hadir", tidak mengarang hasil
    if (!selectedRegion.hasData || !districtId) { setShowWaitlist(true); return }
    onStart()
  }

  return (
    <div className="step-screen">
      <div className="progress-label" style={{ color: 'var(--green-700)' }}>Ceritakan lahan Anda 🌾</div>
      <h2 className="step-title">Beberapa hal saja, lalu kami hitungkan</h2>
      <p style={{ marginBottom: '20px', color: 'var(--ink-soft)', fontSize: '0.95rem' }}>
        Cukup satu halaman ini. Bisa cerita lewat suara, atau isi langsung. Tidak perlu tepat — perkiraan saja sudah cukup. 😊
      </p>

      {fetchError && (
        <div style={{ padding: '12px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', fontSize: '0.9rem' }}>
          {fetchError}
        </div>
      )}

      {/* ── Voice input ─────────────────────────────────────── */}
      <button
        type="button"
        className="voice-card"
        disabled={!speechReady || speechStatus === 'listening'}
        aria-label={speechReady ? 'Gunakan input suara' : 'Fitur suara segera hadir'}
        onClick={handleSpeechInput}
      >
        <div className="voice-mic" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </div>
        <div className="voice-text">
          <div className="voice-title">🎙️ Cerita lewat suara</div>
          <div className="voice-subtitle">
            {speechReady ? (speechStatus === 'listening' ? '🎧 Mendengarkan...' : 'Sebutkan kabupaten & luas lahan Anda') : '🚀 Segera hadir di versi berikutnya'}
          </div>
          <div className="voice-note">🌐 Bahasa Daerah akan tersedia di versi berikutnya</div>
        </div>
      </button>

      {speechError && (
        <div style={{ padding: '10px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', marginBottom: '14px', fontSize: '0.85rem' }}>
          {speechError}
        </div>
      )}

      <div className="or-divider">atau isi langsung</div>

      {/* ── Daerah ──────────────────────────────────────────── */}
      <div className="form-group">
        <label className="form-label" htmlFor="kabupaten">📍 Lahan Anda di kabupaten/kota mana?</label>
        <DistrictCombobox
          value={selectedRegion?.name ?? ''}
          onSelect={selectRegion}
        />
        <div className="form-hint">
          Tersedia seluruh Indonesia. Saat ini data lengkap baru untuk <strong>DIY</strong> (bertanda ✅).
        </div>
      </div>

      {/* ── Luas lahan ──────────────────────────────────────── */}
      <div className="form-group">
        <label className="form-label" htmlFor="luas">🌾 Berapa luas lahan Anda?</label>
        <div className="input-row">
          <input
            id="luas"
            type="number"
            inputMode="decimal"
            min="0.1"
            step="0.1"
            placeholder="cth: 1 (untuk 1 hektare)"
            className="form-input"
            value={luas}
            onChange={e => onLuasChange(e.target.value)}
          />
          <span className="input-suffix">Hektare</span>
        </div>
        <div className="form-hint">1 hektare ≈ 100×100 meter, atau 1,4 kali lapangan bola. Perkiraan saja cukup. 😊</div>
      </div>

      {/* ── Modal (opsional) ────────────────────────────────── */}
      <div className="form-group">
        <label className="form-label" htmlFor="modal">💰 Modal yang sudah Anda siapkan <span style={{ fontWeight: 400, color: 'var(--ink-mute)' }}>(boleh dikosongkan)</span></label>
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
        <div className="form-hint">Belum tahu pastinya? Kosongkan saja — kami tetap bisa bantu. 👍</div>
      </div>

      {/* ── Prioritas ───────────────────────────────────────── */}
      <div className="form-group">
        <label className="form-label">🎯 Mana yang lebih penting bagi Anda?</label>
        <div className="priority-grid">
          <button
            type="button"
            className={`priority-card${priority === 'profit' ? ' selected' : ''}`}
            onClick={() => onPriorityChange('profit')}
          >
            <div className="priority-icon">📈</div>
            <h4>Hasil yang besar</h4>
            <p>Cari untung lebih banyak, walau ada sedikit risiko</p>
          </button>
          <button
            type="button"
            className={`priority-card${priority === 'safe' ? ' selected' : ''}`}
            onClick={() => onPriorityChange('safe')}
          >
            <div className="priority-icon">🛡️</div>
            <h4>Yang aman saja</h4>
            <p>Hasil pasti, walau tidak terlalu besar</p>
          </button>
        </div>
      </div>

      <div className="button-row" style={{ justifyContent: 'center' }}>
        <button className="btn btn-primary" style={{ minWidth: '260px' }} onClick={handleSubmit}>
          ✨ Tolong Hitungkan untuk Saya
        </button>
      </div>

      {/* Friendly modal for regions without data yet (sesuai revisi #2 & #3) */}
      <InfoModal
        open={showWaitlist}
        emoji="🌱"
        title="Belum sampai sana, tapi segera!"
        primaryLabel="Pilih daerah DIY dulu"
        onPrimary={() => setShowWaitlist(false)}
        secondaryLabel="Beri tahu saya nanti"
        onSecondary={() => { setShowWaitlist(false); fire('Siap! Daerah Anda kami catat untuk versi berikutnya 🙏', 'success') }}
        onClose={() => setShowWaitlist(false)}
      >
        <p>
          Saat ini data harga & cuaca lengkap kami baru tersedia untuk{' '}
          <strong>Daerah Istimewa Yogyakarta</strong>.
          {selectedRegion?.name ? <> Daerah <strong>{selectedRegion.name}</strong> sudah masuk antrean penambahan berikutnya. 📍</> : ''}
        </p>
        <p style={{ marginTop: '10px', color: 'var(--ink-soft)' }}>
          Kami sengaja tidak menebak-nebak hasil untuk daerah yang datanya belum ada, supaya saran kami
          tetap jujur dan bisa Anda andalkan. 🙏 Untuk mencoba sekarang, pilih salah satu dari 5 kabupaten DIY
          (yang bertanda ✅).
        </p>
      </InfoModal>

      {toast && <Toast message={toast.msg} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  )
}
