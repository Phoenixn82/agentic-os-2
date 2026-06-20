import { useState } from 'react'
import type { Engine, RunMode } from '@shared/types'
import { useApp } from '../state'

const ENGINES: Engine[] = ['claude', 'codex', 'freellm']
const MODES: RunMode[] = ['visible', 'headless']

// The "+ new session" control: pick run-mode + engine per spawn,
// defaulting run-mode to the global nav toggle. Headless mode reveals a prompt field
// (a headless run is non-interactive — it needs something to do).
export function SpawnMenu({
  label,
  onPick
}: {
  label: string
  onPick: (mode: RunMode, engine: Engine, prompt?: string) => void
}): React.JSX.Element {
  const { runMode } = useApp()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<RunMode>(runMode)
  const [engine, setEngine] = useState<Engine>('claude')
  const [prompt, setPrompt] = useState('')

  const headlessNeedsPrompt = mode === 'headless' && prompt.trim().length === 0

  return (
    <div className="menu-wrap">
      <button className="b sess" onClick={() => setOpen((o) => !o)}>
        {label} <span className="caret">▾</span>
      </button>
      {open && (
        <div className="menu">
          <div className="mlabel">run mode</div>
          <div className="opts">
            {MODES.map((m) => (
              <button
                key={m}
                className={`mini ${mode === m ? 'on' : ''}`}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="mlabel">engine</div>
          <div className="opts">
            {ENGINES.map((e) => (
              <button
                key={e}
                className={`mini ${engine === e ? 'on' : ''}`}
                onClick={() => setEngine(e)}
              >
                {e}
              </button>
            ))}
          </div>
          {mode === 'headless' && (
            <>
              <div className="mlabel">prompt (headless)</div>
              <textarea
                className="input"
                style={{ width: '100%', height: 64, resize: 'vertical' }}
                placeholder="what should the agent do?"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </>
          )}
          <button
            className="btn"
            disabled={headlessNeedsPrompt}
            style={headlessNeedsPrompt ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            onClick={() => {
              onPick(mode, engine, prompt.trim() || undefined)
              setOpen(false)
            }}
          >
            ▶ start session
          </button>
        </div>
      )}
    </div>
  )
}
