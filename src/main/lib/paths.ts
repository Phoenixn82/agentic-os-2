import { homedir, platform } from 'node:os'
import { join } from 'node:path'

const HOME = homedir()
const isWindows = platform() === 'win32'

function envPath(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.trim() ? value : fallback
}

export const ROOT = envPath('AGENTIC_ROOT', join(HOME, 'AgenticOS'))
export const VAULT = envPath('AGENTIC_VAULT', join(ROOT, 'vault'))
export const ARCHIVE_VAULT = envPath('AGENTIC_ARCHIVE_VAULT', join(ROOT, 'archive-vault'))
export const FABLES_DIR = envPath('AGENTIC_FABLES_DIR', join(ROOT, 'sample-data', 'daily-fables'))
export const CURATOR_DIR = envPath('AGENTIC_CURATOR_ARCHIVE_DIR', join(ROOT, 'sample-data', 'video-curator'))
export const CURATOR_LIVE_DIR = envPath('AGENTIC_CURATOR_LIVE_DIR', join(ROOT, 'briefing', 'curator'))
export const PROJECTS_DIR = envPath('AGENTIC_PROJECTS_DIR', join(ROOT, 'projects'))
export const AGENTIC_PROJECT_DIR = envPath('AGENTIC_APP_DIR', join(PROJECTS_DIR, 'agentic-os-2'))
export const SELF_UPDATE_SCRIPT = envPath(
  'AGENTIC_SELF_UPDATE_SCRIPT',
  join(AGENTIC_PROJECT_DIR, 'scripts', 'self-update.ps1')
)
export const PORTS_MD = join(VAULT, 'dev-registry', 'ports.md')
export const INDEX_MD = join(VAULT, 'index.md')
export const LOG_MD = join(VAULT, 'log.md')

export const BRIEFING_WATERMARK = envPath(
  'AGENTIC_BRIEFING_WATERMARK',
  join(ROOT, 'briefing', 'last-briefing.json')
)
export const IMPORT_SOURCES = envPath(
  'AGENTIC_IMPORT_SOURCES',
  join(ROOT, 'briefing', 'import-sources.json')
)
export const IMPORT_STATE = envPath(
  'AGENTIC_IMPORT_STATE',
  join(ROOT, 'briefing', 'import-state.json')
)
export const CURATOR_FEEDBACK_DIR = envPath(
  'AGENTIC_CURATOR_FEEDBACK_DIR',
  join(ROOT, 'briefing', 'curator-feedback')
)
export const CURATOR_SESSION_DIR = envPath(
  'AGENTIC_CURATOR_SESSION_DIR',
  join(ROOT, 'briefing', 'curator-sessions')
)
export const CURATOR_LEARNINGS = envPath(
  'AGENTIC_CURATOR_LEARNINGS',
  join(VAULT, 'Mechanics', 'video-curator', 'learnings.md')
)

export const CLAUDE_CMD = envPath(
  'CLAUDE_CMD',
  isWindows ? join(HOME, 'AppData', 'Roaming', 'npm', 'claude.cmd') : 'claude'
)
export const CODEX_CMD = envPath(
  'CODEX_CMD',
  isWindows ? join(HOME, 'AppData', 'Roaming', 'npm', 'codex.cmd') : 'codex'
)
export const FREELLM_CMD = envPath('FREELLM_CMD', join(ROOT, 'tools', 'freellmapi-chat.ps1'))
export const VIDEO_CURATOR_SCRIPT = envPath(
  'VIDEO_CURATOR_SCRIPT',
  join(ROOT, 'tools', 'video-curator', 'curate.py')
)
export const VIDEO_IMPORT_SCRIPT = envPath(
  'VIDEO_IMPORT_SCRIPT',
  join(ROOT, 'tools', 'video-curator', 'import_saved.py')
)
export const EDITOR_EXE = envPath('EDITOR_EXE', isWindows ? 'Code.exe' : 'code')
