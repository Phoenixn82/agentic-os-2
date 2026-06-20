import { useEffect, useState, useCallback } from 'react'
import type { Fable, Briefing as BriefingData } from '@shared/types'
import { api } from '../lib/api'
import { useApp } from '../state'

export function Briefing(): React.JSX.Element {
  const { showToast } = useApp()
  const [fable, setFable] = useState<Fable | null>(null)
  const [brief, setBrief] = useState<BriefingData>({ accomplished: [], workflow: [] })

  const load = useCallback(() => {
    api.dailyFable().then(setFable).catch(() => setFable(null))
    api
      .briefing()
      .then(setBrief)
      .catch(() => setBrief({ accomplished: [], workflow: [] }))
  }, [])
  useEffect(load, [load])

  async function compile(): Promise<void> {
    const b = await api.compileBriefing().catch(() => null)
    if (b) {
      setBrief(b)
      api.dailyFable().then(setFable).catch(() => {})
      showToast(`briefing compiled · ${b.accomplished.length} accomplished · ${b.workflow.length} workflow changes${b.since ? ` · since ${b.since}` : ''}`, true)
    }
  }

  const skills = brief.workflow.filter((w) => w.kind === 'skill')
  const errors = brief.workflow.filter((w) => w.kind === 'error')

  return (
    <main>
      <div className="head">
        <h1>Morning briefing</h1>
        <span className="mono faint" style={{ paddingBottom: 6 }}>
          {brief.since ? `since ${brief.since}` : 'first run'}
          {brief.compiledAt ? ` · compiled ${brief.compiledAt.slice(0, 16).replace('T', ' ')}` : ''}
        </span>
        <div className="tools">
          <button className="btn" onClick={compile}>
            compile briefing
          </button>
        </div>
      </div>

      <div className="grid briefing-grid">
        <div className="col">
          <div className="panel">
            <h2>Accomplished since last briefing</h2>
            {brief.accomplished.length === 0 && (
              <div className="empty">nothing recorded since the last handoff</div>
            )}
            {brief.accomplished.map((a, i) => (
              <div className="row" key={i}>
                <span className="tick">ok</span>
                <span>{a.text}</span>
                <span className="rtag">{a.tag}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="col">
          <div className="panel wf">
            <h2>What Claude added to your workflow</h2>
            {brief.workflow.length === 0 && <div className="empty">no workflow changes recorded</div>}
            {skills.map((w, i) => (
              <div className="row" key={`s${i}`}>
                <span className="k">skill</span>
                <span>{w.text}</span>
              </div>
            ))}
            {errors.map((w, i) => (
              <div className="row err" key={`e${i}`}>
                <span className="k">error-fix</span>
                <span>{w.text}</span>
              </div>
            ))}
          </div>

          {fable && (
            <div className="panel sam">
              <h2>Daily fable</h2>
              <blockquote>{fable.memorableLine}</blockquote>
              <div className="moral">
                <b>Moral:</b> {fable.moral}
              </div>
              {fable.theme.length > 0 && (
                <div className="theme">theme: {fable.theme.join(' · ')}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
