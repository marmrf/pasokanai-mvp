import { useEffect } from 'react'

export type ToastTone = 'info' | 'warn' | 'success'

interface ToastProps {
  message: string
  tone?: ToastTone
  duration?: number
  onClose: () => void
}

const TONE_EMOJI: Record<ToastTone, string> = {
  info: '💬',
  warn: '🙏',
  success: '✅',
}

/**
 * Lightweight, friendly toast — replaces native alert() for gentle validation
 * nudges (sesuai revisi #3: jangan popup hitam kaku). Auto-dismisses.
 */
export default function Toast({ message, tone = 'warn', duration = 3200, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [duration, onClose])

  return (
    <div className={`app-toast app-toast--${tone}`} role="status" aria-live="polite">
      <span className="app-toast-emoji" aria-hidden="true">{TONE_EMOJI[tone]}</span>
      <span className="app-toast-msg">{message}</span>
    </div>
  )
}
