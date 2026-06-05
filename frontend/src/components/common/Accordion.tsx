import { useState, type ReactNode } from 'react'

interface AccordionProps {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * Lightweight collapsible section for the result page (progressive disclosure).
 * Mengurangi rasa kewalahan: detail (grafik, skor) disembunyikan sampai diminta.
 * Children tetap ter-mount (hanya disembunyikan) supaya komponen seperti
 * WeatherChart tetap memuat data & memanggil onSummary walau tertutup.
 */
export default function Accordion({ title, subtitle, defaultOpen = false, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`acc${open ? ' open' : ''} print-hide`}>
      <button type="button" className="acc-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="acc-title-wrap">
          <span className="acc-title">{title}</span>
          {subtitle && <span className="acc-sub">{subtitle}</span>}
        </span>
        <span className="acc-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      <div className="acc-body" style={{ display: open ? 'block' : 'none' }}>{children}</div>
    </div>
  )
}
