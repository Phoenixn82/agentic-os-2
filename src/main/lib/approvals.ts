import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ApprovalState } from '../../shared/types'

// Dashboard-side approve/skip store. The vault stays read-only — this writes ONLY
// to the injected filePath (and its .tmp sibling during atomic replace).
export function createApprovalsStore(filePath: string): {
  get: () => Record<string, ApprovalState>
  set: (id: string, state: ApprovalState) => void
} {
  function get(): Record<string, ApprovalState> {
    if (!existsSync(filePath)) return {}
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      // Guard against valid-JSON-but-not-an-object (e.g. "null", "[]", "42").
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, ApprovalState>
      }
      return {}
    } catch {
      return {}
    }
  }

  function set(id: string, state: ApprovalState): void {
    const next = { ...get(), [id]: state }
    mkdirSync(dirname(filePath), { recursive: true })
    const tmp = filePath + '.tmp'
    writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8')
    renameSync(tmp, filePath) // atomic replace on same filesystem
  }

  return { get, set }
}
