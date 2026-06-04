import { useEffect, useMemo, useRef, useState } from 'react'
import { INDONESIA_REGIONS, type IndonesiaRegion } from '../../data/indonesia-regions'

interface DistrictComboboxProps {
  /** Display text of the current selection (e.g. "Sleman"). Empty when none. */
  value: string
  onSelect: (region: IndonesiaRegion | null) => void
  placeholder?: string
  disabled?: boolean
}

const MAX_RESULTS = 60

const norm = (s: string) => s.toLowerCase().replace(/[.,]/g, ' ').trim()

/**
 * Searchable, mobile-friendly region picker covering ALL Indonesian kabupaten/kota.
 * The 5 DIY districts (hasData) are pinned to the top and badged "Data tersedia".
 * Selecting a non-DIY region is allowed but the parent gates analysis behind a
 * friendly "segera hadir" modal (sesuai revisi #2).
 */
export default function DistrictCombobox({ value, onSelect, placeholder, disabled }: DistrictComboboxProps) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Keep input text in sync when the selection changes from outside (voice / reset)
  useEffect(() => { setQuery(value) }, [value])

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const diy = useMemo(() => INDONESIA_REGIONS.filter(r => r.hasData), [])

  const results = useMemo(() => {
    const q = norm(query)
    if (!q) {
      // Empty query → show DIY (pinned) plus a few popular provinces' first entries as a teaser
      return diy
    }
    const matches = INDONESIA_REGIONS.filter(
      r => norm(r.name).includes(q) || norm(r.province).includes(q),
    )
    // DIY (hasData) first, then by name length (closer matches first)
    matches.sort((a, b) => {
      if (!!b.hasData !== !!a.hasData) return b.hasData ? 1 : -1
      return a.name.length - b.name.length
    })
    return matches.slice(0, MAX_RESULTS)
  }, [query, diy])

  useEffect(() => { setActiveIdx(0) }, [query])

  const choose = (r: IndonesiaRegion) => {
    setQuery(r.name)
    setOpen(false)
    onSelect(r)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[activeIdx]) choose(results[activeIdx]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className="combo" ref={wrapRef}>
      <input
        type="text"
        className="form-input combo-input"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder ?? 'Ketik nama kabupaten/kota, mis. "Sleman"'}
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
          if (!e.target.value.trim()) onSelect(null)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      <span className="combo-caret" aria-hidden="true">▾</span>

      {open && (
        <div className="combo-list" role="listbox">
          {!norm(query) && (
            <div className="combo-hint">📍 Mulai ketik nama daerah Anda — tersedia seluruh Indonesia</div>
          )}
          {results.length === 0 ? (
            <div className="combo-empty">Daerah tidak ditemukan. Coba ejaan lain ya 🙏</div>
          ) : (
            results.map((r, i) => (
              <button
                type="button"
                key={`${r.name}-${r.province}`}
                role="option"
                aria-selected={i === activeIdx}
                className={`combo-item${i === activeIdx ? ' active' : ''}${r.hasData ? ' has-data' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => choose(r)}
              >
                <span className="combo-item-main">
                  <span className="combo-item-name">{r.name}</span>
                  <span className="combo-item-prov">{r.province}</span>
                </span>
                {r.hasData && <span className="combo-badge">✅ Data tersedia</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
