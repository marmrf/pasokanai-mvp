import { useMemo, useState } from 'react'
import type { District } from '../../types'

interface Step1Props {
  districts: District[]
  districtId: string
  luas: string
  fetchError: string
  onDistrictChange: (id: string, label: string) => void
  onLuasChange: (v: string) => void
  onNext: () => void
}

export default function Step1({ districts, districtId, luas, fetchError, onDistrictChange, onLuasChange, onNext }: Step1Props) {
  const [speechStatus, setSpeechStatus] = useState<'idle' | 'listening' | 'error'>('idle')
  const [speechError, setSpeechError] = useState('')

  const speechKey = import.meta.env.VITE_AZURE_SPEECH_KEY as string | undefined
  const speechRegion = import.meta.env.VITE_AZURE_SPEECH_REGION as string | undefined
  const speechReady = Boolean(speechKey && speechRegion)

  const districtIndex = useMemo(() => {
    return districts.map(d => ({
      id: d.id,
      name: d.name.toLowerCase(),
      label: `${d.name}, ${d.province}`,
    }))
  }, [districts])

  const normalize = (value: string) => value.toLowerCase().replace(/[.,]/g, ' ')

  const applySpeechResult = (text: string) => {
    const normalized = normalize(text)
    const match = districtIndex.find(d => normalized.includes(d.name))
    if (match) {
      onDistrictChange(match.id, match.label)
    }

    const numberMatch = normalized.match(/(\d+(?:[.,]\d+)?)/)
    if (numberMatch) {
      const luasValue = numberMatch[1].replace(',', '.')
      onLuasChange(luasValue)
    }

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
  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const option = e.target.selectedOptions[0]
    onDistrictChange(e.target.value, option.text)
  }

  const handleNext = () => {
    if (!districtId) { alert('Pilih kabupaten Anda dulu ya 😊'); return }
    const luasNum = parseFloat(luas)
    if (!luas || luasNum <= 0) { alert('Tolong isi luas lahannya dulu. Tidak perlu tepat — perkiraan saja sudah cukup. 🙏'); return }
    onNext()
  }

  // Group districts by province
  const grouped = districts.reduce((acc, d) => {
    if (!acc[d.province]) acc[d.province] = []
    acc[d.province].push(d)
    return acc
  }, {} as Record<string, District[]>)

  return (
    <div className="step-screen">
      <div className="progress-track">
        <div className="progress-step active"></div>
        <div className="progress-step"></div>
        <div className="progress-step"></div>
      </div>
      <div className="progress-label">Pertanyaan 1 dari 3</div>
      <h2 className="step-title">Boleh tahu lahan Anda di mana?</h2>
      <p style={{ marginBottom: '24px', color: 'var(--ink-soft)', fontSize: '0.95rem' }}>
        Cerita sebentar ya, supaya kami bisa memberikan saran yang pas untuk daerah Anda. 🌾
      </p>

      {fetchError && (
        <div style={{ padding: '12px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', marginBottom: '16px', fontSize: '0.9rem' }}>
          {fetchError}
        </div>
      )}

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
            {speechReady ? (speechStatus === 'listening' ? '🎧 Mendengarkan...' : 'Klik untuk bicara') : '🚀 Segera hadir di versi berikutnya'}
          </div>
        </div>
      </button>

      {speechError && (
        <div style={{ padding: '10px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', marginBottom: '14px', fontSize: '0.85rem' }}>
          {speechError}
        </div>
      )}

      <div className="or-divider">atau isi langsung</div>

      <div className="form-group">
        <label className="form-label" htmlFor="kabupaten">📍 Lahan Anda di kabupaten mana?</label>
        {districts.length === 0 ? (
          <select className="form-select" disabled>
            <option>Memuat daftar kabupaten...</option>
          </select>
        ) : (
          <select id="kabupaten" className="form-select" value={districtId} onChange={handleDistrictChange}>
            <option value="">— Klik di sini, lalu pilih kabupaten —</option>
            {Object.entries(grouped).map(([province, dists]) => (
              <optgroup key={province} label={province}>
                {dists.map(d => (
                  <option key={d.id} value={d.id}>{d.name}, {d.province}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        <div className="form-hint">Pilih yang paling dekat dengan lahan Anda. Tidak harus tepat 100%.</div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="luas">🌾 Berapa luas lahan Anda?</label>
        <div className="input-row">
          <input
            id="luas"
            type="number"
            min="0.1"
            step="0.1"
            placeholder="Contoh: tulis 1 untuk 1 hektare"
            className="form-input"
            value={luas}
            onChange={e => onLuasChange(e.target.value)}
          />
          <span className="input-suffix">Hektare</span>
        </div>
        <div className="form-hint">
          Kalau bingung: 1 hektare itu sekitar 100×100 meter, atau 1,4 kali lapangan bola.<br />
          Tidak perlu tepat — perkiraan saja sudah cukup. 😊
        </div>
      </div>

      <div className="button-row">
        <span></span>
        <button className="btn btn-primary" onClick={handleNext}>
          Lanjut, Pertanyaan Berikutnya →
        </button>
      </div>
    </div>
  )
}
