import { useEffect, useState } from 'react'
import { useApp, Surface } from '../state'
import { api } from '../lib/api'

const LINKS: { key: Surface; label: string }[] = [
  { key: 'briefing', label: 'briefing' },
  { key: 'curator', label: 'video curator' },
  { key: 'projects', label: 'projects' },
  { key: 'vault', label: 'vault' }
]

export function Nav(): React.JSX.Element {
  const {
    surface, setSurface, runMode, setRunMode,
    updating, setUpdating, updateAvailable, setUpdateAvailable, showToast
  } = useApp()
  const [restarting, setRestarting] = useState(false)

  // Poll for a staged update (built into dist/ by `npm run build:unpack`). The button
  // only appears when one exists — like a normal desktop app.
  useEffect(() => {
    let alive = true
    const check = (): void => {
      api.checkUpdate().then((r) => { if (alive) setUpdateAvailable(r.available) }).catch(() => {})
    }
    check()
    const id = setInterval(check, 90_000)
    return () => { alive = false; clearInterval(id) }
  }, [setUpdateAvailable])

  async function update(): Promise<void> {
    if (updating) return
    if (
      !window.confirm(
        'Update Agentic OS 2.0?\n\nIt will close and reopen with the new version in a few seconds.'
      )
    )
      return
    setUpdating(true)
    const r = await api
      .selfUpdate()
      .catch(() => ({ ok: false, error: 'failed to start update' }) as const)
    if (!r.ok) {
      setUpdating(false)
      showToast(`update failed — ${r.error ?? 'unknown error'}`, false)
    }
    // on success the helper closes + reopens the app; the overlay stays until then.
  }

  async function restart(): Promise<void> {
    if (restarting) return
    setRestarting(true)
    const r = await api
      .restart()
      .catch(() => ({ ok: false, error: 'failed to restart' }) as const)
    if (!r.ok) {
      setRestarting(false)
      showToast(`restart failed — ${r.error ?? 'unknown error'}`, false)
    }
    // on success the app relaunches in ~120ms; the disabled state stays until it does.
  }

  return (
    <nav>
      <div className="brand">
        agentic os <span className="v">2.0</span>
      </div>
      {LINKS.map((l) => (
        <a
          key={l.key}
          className={surface === l.key ? 'active' : ''}
          onClick={() => setSurface(l.key)}
        >
          {l.label}
        </a>
      ))}
      <div className="spacer" />
      <button
        className="restart-btn"
        onClick={restart}
        disabled={restarting}
        title="Restart Agentic OS 2.0 — reloads the app (running dev terminals are unaffected)"
      >
        {restarting ? '↻ restarting…' : '↻ restart'}
      </button>
      {(updateAvailable || updating) && (
        <button
          className="update-btn"
          onClick={update}
          disabled={updating}
          title="A new version is ready — click to update and reopen"
        >
          {updating ? '⟳ updating…' : '⟳ update available'}
        </button>
      )}
      <span className="pill">run mode</span>
      <div className="toggle">
        <span
          className={runMode === 'visible' ? 'on live' : ''}
          onClick={() => setRunMode('visible')}
        >
          ● visible
        </span>
        <span className={runMode === 'headless' ? 'on' : ''} onClick={() => setRunMode('headless')}>
          headless
        </span>
      </div>
    </nav>
  )
}
