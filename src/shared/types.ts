// Shared types — imported type-only by main, preload, and renderer.
// Type-only imports are erased at build, so no main/node code leaks into the renderer bundle.

export type Engine = 'claude' | 'codex' | 'freellm'
export type RunMode = 'visible' | 'headless'

export interface ProjectService {
  id: string
  label: string
  type: string
  port: number | null
  devCommand: string
}

export interface Project {
  slug: string
  name: string
  dir: string
  type: string
  tags: string[]
  status: 'active' | 'archived' | 'missing'
  description: string
  port: number | null
  devCommand: string
  existsOnDisk: boolean
  services?: ProjectService[]
}

export interface IdeaCard {
  id: string
  sourceLabel: 'youtube' | 'instagram'
  url: string
  title: string
  /** Human-readable headline (frontmatter title → derived from summary → '' ). */
  displayTitle: string
  /** Plain-language "what this video is about" (frontmatter summary → the note's "Understand the video"). */
  summary: string
  thumbnail: string | null
  relevanceScore: number | null
  proposedChange: string
  whyThisMatters: string
  routingDecision: string | null
  corrupted: boolean
  /** Raw transcript text from the "## Transcript" section ('' when absent or unparseable). */
  transcript: string
  firstPrompt?: string
  targetProjectCd?: string
}

export interface Fable {
  title: string
  memorableLine: string
  moral: string
  theme: string[]
  videoUrl: string | null
}

export interface VaultStats {
  counts: { Actions: number; Mechanics: number; Projects: number; 'dev-registry': number }
  recent: { path: string; mtimeMs: number }[]
  indexLead: string
}

// A node in the browsable vault tree. `relPath` is POSIX-style ('/'-separated), relative to the
// vault root ('' for the root node). Directories carry `children`; files end in `.md`.
export interface VaultNode {
  name: string
  relPath: string
  type: 'dir' | 'file'
  children?: VaultNode[]
}

export interface AccomplishedItem {
  text: string
  tag: string
}

export interface WorkflowChange {
  kind: 'skill' | 'error'
  text: string
}

export interface Briefing {
  accomplished: AccomplishedItem[]
  workflow: WorkflowChange[]
  since?: string | null // watermark the delta was computed from (handoff date), null on first run
  compiledAt?: string | null // ISO time the watermark was last advanced (set by compileBriefing)
}

export type ApprovalState = 'accepted' | 'skipped' | 'off-base'

// Result of a launch/session/curate action. `cmd` is the command that ran (for the toast);
// `pid` on success; `logPath` for headless jobs (renderer tails it); `error` on failure.
// `stub` marks an intentional M1-style no-op (kept for any action not yet wired).
export interface SpawnResult {
  ok: boolean
  pid?: number
  cmd?: string
  logPath?: string
  error?: string
  stub?: boolean
}

// IPC envelope — handlers never throw across IPC; they return ok/err.
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

// The typed surface exposed on window.api (preload contextBridge).
export interface AgenticApi {
  projects: () => Promise<Project[]>
  // Vault wiki: stats header + browsable tree + path-contained markdown read (Track C).
  vault: {
    stats: () => Promise<VaultStats>
    tree: () => Promise<VaultNode>
    read: (relPath: string) => Promise<string>
  }
  dailyFable: () => Promise<Fable>
  curator: () => Promise<IdeaCard[]>
  briefing: () => Promise<Briefing>
  compileBriefing: () => Promise<Briefing>
  approvals: {
    get: () => Promise<Record<string, ApprovalState>>
    set: (id: string, state: ApprovalState) => Promise<void>
  }
  openInEditor: (slug: string) => Promise<SpawnResult>
  startDev: (slug: string, serviceId?: string) => Promise<SpawnResult>
  newSession: (slug: string, mode: RunMode, engine: Engine, prompt?: string) => Promise<SpawnResult>
  curateUrl: (url: string, engine: Engine) => Promise<SpawnResult>
  importSaved: () => Promise<SpawnResult>
  teachVideo: (id: string) => Promise<SpawnResult>
  /** "Accept → open as session": vault-loaded, interview-then-build Claude session for a video. */
  openSession: (id: string) => Promise<SpawnResult>
  editSelf: () => Promise<SpawnResult>
  openExternal: (url: string) => Promise<void>
  selfUpdate: () => Promise<SpawnResult>
  checkUpdate: () => Promise<{ available: boolean }>
  restart: () => Promise<SpawnResult>
  readLog: (logPath: string) => Promise<string>
}
