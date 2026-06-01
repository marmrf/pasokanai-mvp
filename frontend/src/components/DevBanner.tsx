import { useEffect, useState } from 'react'

interface ServiceStatus {
  connected: boolean
  planned?: boolean
  note?: string
}

interface ServiceStatusResponse {
  services: {
    supabase: ServiceStatus
    openai: ServiceStatus
    open_meteo: ServiceStatus
    azure_ml: ServiceStatus
    azure_speech: ServiceStatus
    gemini: ServiceStatus
    app_insights: ServiceStatus
  }
  data_mode: 'full' | 'partial' | 'fallback'
  fallback_data: string[]
}

const STATUS_ICON: Record<string, string> = {
  connected: '✅',
  planned: '🔄',
  fallback: '⚠️',
}

function ServiceChip({ name, status }: { name: string; status: ServiceStatus }) {
  const icon = status.connected
    ? STATUS_ICON.connected
    : status.planned
    ? STATUS_ICON.planned
    : STATUS_ICON.fallback

  return (
    <span
      title={status.note || ''}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        background: status.connected
          ? 'rgba(22, 163, 74, 0.15)'
          : status.planned
          ? 'rgba(99, 102, 241, 0.12)'
          : 'rgba(217, 119, 6, 0.15)',
        color: status.connected ? '#166534' : status.planned ? '#3730a3' : '#92400e',
        cursor: status.note ? 'help' : 'default',
      }}
    >
      {icon} {name}
    </span>
  )
}

export default function DevBanner() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('devbanner_open') !== 'false' }
    catch { return true }
  })
  const [status, setStatus] = useState<ServiceStatusResponse | null>(null)
  const [apiError, setApiError] = useState(false)

  useEffect(() => {
    fetch('/api/service-status')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setStatus(data))
      .catch(() => setApiError(true))
  }, [])

  const toggle = () => {
    const next = !open
    setOpen(next)
    try { localStorage.setItem('devbanner_open', String(next)) } catch {}
  }

  // Only render in dev mode
  if (!import.meta.env.DEV) return null

  const MODE_COLOR: Record<string, string> = {
    full: '#14532d',
    partial: '#78350f',
    fallback: '#7f1d1d',
  }
  const MODE_BG: Record<string, string> = {
    full: '#f0fdf4',
    partial: '#fffbeb',
    fallback: '#fef2f2',
  }
  const mode = status?.data_mode ?? (apiError ? 'fallback' : 'partial')

  return (
    <div
      style={{
        background: MODE_BG[mode] ?? '#fffbeb',
        borderTop: `2px solid ${mode === 'full' ? '#86efac' : mode === 'fallback' ? '#fca5a5' : '#fcd34d'}`,
        fontFamily: 'monospace',
        fontSize: '0.78rem',
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        boxShadow: '0 -2px 12px rgba(0,0,0,0.12)',
      }}
    >
      {/* Header bar */}
      <div
        onClick={toggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 16px',
          cursor: 'pointer',
          color: MODE_COLOR[mode] ?? '#78350f',
          userSelect: 'none',
        }}
      >
        <span>🛠️</span>
        <strong>DEV MODE</strong>
        <span>·</span>
        {apiError ? (
          <span>Azure Functions offline — run <code>func start</code> di /api</span>
        ) : !status ? (
          <span>Memuat status service...</span>
        ) : (
          <>
            <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{status.data_mode}</span>
            {status.fallback_data.length > 0 && (
              <span style={{ color: '#92400e' }}>
                · fallback: {status.fallback_data.join(', ')}
              </span>
            )}
          </>
        )}
        <span style={{ marginLeft: 'auto' }}>{open ? '▲ tutup' : '▼ buka'}</span>
      </div>

      {/* Expanded panel */}
      {open && (
        <div style={{ padding: '8px 16px 12px', borderTop: '1px solid rgba(0,0,0,0.07)' }}>
          {status ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                <ServiceChip name="Supabase DB" status={status.services.supabase} />
                <ServiceChip name="Azure OpenAI" status={status.services.openai} />
                <ServiceChip name="Gemini" status={status.services.gemini} />
                <ServiceChip name="Open-Meteo" status={status.services.open_meteo} />
                <ServiceChip name="Azure ML" status={status.services.azure_ml} />
                <ServiceChip name="Azure Speech" status={status.services.azure_speech} />
                <ServiceChip name="App Insights" status={status.services.app_insights} />
              </div>
              {status.data_mode !== 'full' && (
                <div style={{ color: '#92400e', marginBottom: '4px' }}>
                  ⚠️ Beberapa service belum dikonfigurasi. Lihat{' '}
                  <strong>AZURE-IMPLEMENTATION.md</strong> untuk setup.
                </div>
              )}
            </>
          ) : apiError ? (
            <div style={{ color: '#7f1d1d' }}>
              Azure Functions tidak berjalan. Gap Alert dan AI features tidak aktif.
              <br />
              Jalankan: <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: '3px' }}>cd api && func start</code>
            </div>
          ) : null}

          <div style={{ color: '#6b7280', marginTop: '4px' }}>
            Dokumentasi: <strong>AZURE-IMPLEMENTATION.md</strong> ·{' '}
            <strong>README-AZURE.md</strong> · Banner ini hanya muncul di dev mode
          </div>
        </div>
      )}
    </div>
  )
}
