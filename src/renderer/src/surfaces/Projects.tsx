import { useEffect, useState } from 'react'
import type { Project } from '@shared/types'
import { api } from '../lib/api'
import { ProjectCard } from '../components/ProjectCard'

export function Projects(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [filter, setFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api
      .projects()
      .then(setProjects)
      .catch((e) => setErr(String(e)))
  }, [])

  const q = filter.trim().toLowerCase()
  const shown = projects.filter(
    (p) =>
      (showArchived || p.status !== 'archived') &&
      (q === '' || p.name.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q)))
  )

  return (
    <main>
      <div className="head">
        <h1>Projects</h1>
        <span className="mono faint" style={{ paddingBottom: 6 }}>
          {projects.length} on disk · ports from dev-registry
        </span>
        <div className="tools">
          <input
            className="input"
            placeholder="filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <span
            className="pill"
            style={{ cursor: 'pointer', color: showArchived ? 'var(--color-coral)' : undefined }}
            onClick={() => setShowArchived((a) => !a)}
          >
            archived
          </span>
        </div>
      </div>
      {err && <div className="corrupt">failed to load projects: {err}</div>}
      <div className="cards">
        {shown.map((p) => (
          <ProjectCard key={p.slug} p={p} />
        ))}
      </div>
      <div className="hint">
        ▾ on a button = pick run mode (visible / headless) + engine (claude / codex / freellm) · ▶
        start dev launches on the port above and opens the browser · nothing runs until you click
      </div>
    </main>
  )
}
