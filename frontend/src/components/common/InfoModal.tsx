import type { ReactNode } from 'react'

interface InfoModalProps {
  open: boolean
  emoji?: string
  title: string
  children: ReactNode
  primaryLabel?: string
  onPrimary?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  onClose: () => void
}

/**
 * Friendly, branded information modal — replaces rigid native alert()/black popups.
 * Used for empty-state / "data belum tersedia" / "segera hadir" messages so the
 * experience stays warm and informative (sesuai revisi #3).
 */
export default function InfoModal({
  open,
  emoji = '🌱',
  title,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  onClose,
}: InfoModalProps) {
  if (!open) return null

  return (
    <div
      className="info-modal print-hide"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="info-modal-card" onClick={e => e.stopPropagation()}>
        <button className="info-modal-close" onClick={onClose} aria-label="Tutup">✕</button>
        <div className="info-modal-emoji" aria-hidden="true">{emoji}</div>
        <h3 className="info-modal-title">{title}</h3>
        <div className="info-modal-body">{children}</div>
        <div className="info-modal-actions">
          {secondaryLabel && (
            <button className="btn btn-ghost" onClick={onSecondary ?? onClose}>
              {secondaryLabel}
            </button>
          )}
          <button className="btn btn-primary" onClick={onPrimary ?? onClose}>
            {primaryLabel ?? 'Mengerti'}
          </button>
        </div>
      </div>
    </div>
  )
}
