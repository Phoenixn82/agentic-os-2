import { useState } from 'react'
import type { Project, SpawnResult, RunMode, Engine } from '@shared/types'
import { api } from '../lib/api'
import { useApp } from '../state'
import { SpawnMenu } from './SpawnMenu'
import { LogViewer } from './LogViewer'

export function ProjectCard({ p }: { p: Project }): React.JSX.Element {
  const { showToast } = useApp()
  const [svcOpen, setSvcOpen] = useState(false)
  const [log, setLog] = useState<{ path: string; title: string } | null>(null)

  function report(r: SpawnResult): void {
    if (r.ok) {
      const verb = r.stub ? 'would run' : 'launched'
      const pid = r.pid ? ` · pid ${r.pid}` : ''
      showToast(`${verb}${pid} — ${r.cmd ?? ''}`, true)
    } else {
      showToast(`failed — ${r.error ?? 'unknown error'}`, false)
    }
  }

  async function fire(promise: Promise<SpawnResult>): Promise<void> {
    report(await promise)
  }

  async function startSession(mode: RunMode, engine: Engine, prompt?: string): Promise<void> {
    const r = await api.newSession(p.slug, mode, engine, prompt)
    report(r)
    // Headless runs return a log file → open the live tail viewer.
    if (r.ok && r.logPath) setLog({ path: r.logPath, title: `${engine} · ${mode} · ${p.slug}` })
  }

  const isMono = !!p.services && p.services.length > 0
  const ports: number[] = isMono
    ? (p.services ?? []).map((s) => s.port).filter((x): x is number => x != null)
    : p.port != null
      ? [p.port]
      : []

  return (
    <>
    <div className="card">
      <div className="top">
        <span className="dot" /> project · {p.slug.replace(/[_-]/g, ' ')}{' '}
        <span className="status">{p.status}</span>
      </div>
      <h3>{p.name}</h3>
      <div className="tags">
        {p.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
        {ports.map((pt) => (
          <span key={pt} className="tag port">
            :{pt}
          </span>
        ))}
      </div>
      <p className="desc">{p.description}</p>
      <div className="acts">
        <button className="b" onClick={() => fire(api.openInEditor(p.slug))}>
          ⌘ open in editor
        </button>
        {isMono ? (
          <div className="menu-wrap">
            <button className="b run" onClick={() => setSvcOpen((o) => !o)}>
              ▶ start dev &amp; open ▾
            </button>
            {svcOpen && (
              <div className="menu">
                <div className="mlabel">service</div>
                {(p.services ?? []).map((s) => (
                  <button
                    key={s.id}
                    className="mini"
                    style={{ display: 'block', width: '100%', marginBottom: 6, textAlign: 'left' }}
                    onClick={() => {
                      fire(api.startDev(p.slug, s.id))
                      setSvcOpen(false)
                    }}
                  >
                    {s.label}
                    {s.port != null ? ` :${s.port}` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button className="b run" onClick={() => fire(api.startDev(p.slug))}>
            ▶ start dev &amp; open
          </button>
        )}
        <SpawnMenu label="+ new session" onPick={startSession} />
      </div>
    </div>
    {log && <LogViewer logPath={log.path} title={log.title} onClose={() => setLog(null)} />}
    </>
  )
}
