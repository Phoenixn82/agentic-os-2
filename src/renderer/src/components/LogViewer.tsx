import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

const LIMIT_RE = /usage limit|rate limit|quota|too many requests|\b429\b|limit reached|insufficient.*credit/i

// Live tail of a headless session log. Polls readLog every second, autoscrolls,
// and surfaces a usage/rate-limit line if one appears (v1's silent failure mode).
export function LogViewer({
  logPath,
  title,
  onClose
}: {
  logPath: string
  title: string
  onClose: () => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [limit, setLimit] = useState<string | null>(null)
  const bodyRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let alive = true
    const poll = async (): Promise<void> => {
      const t = await api.readLog(logPath).catch(() => '')
      if (!alive) return
      setText(t)
      const hit = t.split(/\r?\n/).find((l) => LIMIT_RE.test(l))
      setLimit(hit ? hit.trim() : null)
    }
    void poll()
    const id = setInterval(poll, 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [logPath])

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [text])

  const done = text.includes('[exit]')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="label">headless session · {done ? 'done' : 'running…'}</span>
          <span className="mono faint" style={{ marginLeft: 'auto', fontSize: 11 }}>
            {title}
          </span>
          <button className="mini" style={{ marginLeft: 12 }} onClick={onClose}>
            close
          </button>
        </div>
        {limit && (
          <div className="corrupt">
            ⚠ usage / rate limit detected — {limit}. Switch engine (FreeLLMAPI) or wait for reset.
          </div>
        )}
        <pre className="logbody" ref={bodyRef}>
          {text || 'waiting for output…'}
        </pre>
        <div className="mono faint" style={{ fontSize: 10, marginTop: 8, wordBreak: 'break-all' }}>
          {logPath}
        </div>
      </div>
    </div>
  )
}
