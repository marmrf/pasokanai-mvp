import { useState, useEffect } from 'react'

interface LoadingScreenProps {
  onDone: () => void
}

const STAGES = [
  { main: 'Mengecek cuaca di daerah Anda', sub: '📡 Dari kantor BMKG (cuaca resmi)' },
  { main: 'Melihat harga-harga di pasar', sub: '📊 Dari BPS & Bapanas (pemerintah)' },
  { main: 'Mengecek apa yang lagi banyak dicari', sub: '🔍 Permintaan pasar bulan ini' },
  { main: 'Menyusun saran terbaik untuk Anda', sub: '🤖 Berdasarkan pengalaman 3 tahun terakhir' },
]

export default function LoadingScreen({ onDone }: LoadingScreenProps) {
  const [activeStage, setActiveStage] = useState(-1)
  const [doneStages, setDoneStages] = useState<number[]>([])

  useEffect(() => {
    let stage = 0

    const tick = () => {
      if (stage > 0) {
        const prev = stage - 1
        setDoneStages(d => [...d, prev])
      }
      if (stage < STAGES.length) {
        setActiveStage(stage)
        stage++
        setTimeout(tick, 900)
      } else {
        setActiveStage(-1)
        onDone()
      }
    }

    const timer = setTimeout(tick, 400)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div className="step-screen">
      <h2 className="step-title" style={{ textAlign: 'center' }}>🌿 Sebentar ya..</h2>
      <p style={{ textAlign: 'center', marginBottom: '24px', color: 'var(--ink-soft)' }}>
        Kami sedang membantu menghitung. Mohon tunggu sebentar... ☕
      </p>
      <div className="loading-stages">
        {STAGES.map((stage, i) => {
          const isActive = activeStage === i
          const isDone = doneStages.includes(i)
          return (
            <div
              key={i}
              className={`loading-stage${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}
            >
              <div className="loading-icon">
                {!isDone && <span>{i + 1}</span>}
              </div>
              <div>
                <div className="loading-text-main">{stage.main}</div>
                <div className="loading-text-sub">{stage.sub}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
