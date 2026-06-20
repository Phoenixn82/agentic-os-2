import { ipcMain, app } from 'electron'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import type { ApprovalState, IpcResult } from '../../shared/types'
import { getProjects } from '../lib/projects'
import { getVaultStats, vaultTree, vaultRead } from '../lib/vault'
import { getDailyFable } from '../lib/fables'
import { parseCuratorNotes } from '../lib/curator'
import { CURATOR_LIVE_DIR } from '../lib/paths'
import { enrichCards } from '../lib/oembed'
import { getBriefing, compileBriefing } from '../lib/briefing'
import { createApprovalsStore } from '../lib/approvals'

// Read-only data IPC. Every handler returns the IpcResult envelope and NEVER throws
// across IPC (a raw Error loses its fields through structured-clone → silent UI no-op).

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}
function fail(e: unknown): IpcResult<never> {
  return { ok: false, error: e instanceof Error ? e.message : String(e) }
}

let approvals: ReturnType<typeof createApprovalsStore> | null = null
function approvalsStore(): ReturnType<typeof createApprovalsStore> {
  if (!approvals) approvals = createApprovalsStore(join(app.getPath('userData'), 'approvals.json'))
  return approvals
}

export function registerDataIpc(): void {
  ipcMain.handle('data:projects', async () => {
    try {
      return ok(getProjects())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('data:vault', async () => {
    try {
      return ok(getVaultStats())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('data:vaultTree', async () => {
    try {
      return ok(vaultTree())
    } catch (e) {
      return fail(e)
    }
  })

  // Path containment is enforced in vaultRead; a bad/escaping path returns the fail envelope.
  ipcMain.handle('data:vaultRead', async (_e, relPath: string) => {
    try {
      return ok(vaultRead(relPath))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('data:dailyFable', async () => {
    try {
      return ok(getDailyFable())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('data:curator', async () => {
    try {
      // Deck reads ONLY freshly-curated notes (CURATOR_LIVE_DIR). The 21 pre-rebuild archive
      // seeds judged against the dead 131-skill stack with the old "Override Gemini" framing —
      // retired from the deck (they remain only as the curator.test fixture). New cards come
      // from the Gemini-ingest→Claude-judge pipeline via "curate a URL".
      const cards = parseCuratorNotes(CURATOR_LIVE_DIR)
      return ok(await enrichCards(cards))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('data:briefing', async () => {
    try {
      return ok(getBriefing())
    } catch (e) {
      return fail(e)
    }
  })

  // Compile advances the watermark to the newest handoff (main owns the clock).
  ipcMain.handle('briefing:compile', async () => {
    try {
      return ok(compileBriefing(new Date().toISOString()))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('approvals:get', async () => {
    try {
      return ok(approvalsStore().get())
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('approvals:set', async (_e, id: string, state: ApprovalState) => {
    try {
      approvalsStore().set(id, state)
      return ok(null)
    } catch (e) {
      return fail(e)
    }
  })

  // Live log tail for headless sessions — renderer polls this. Missing/locked file → '' (not an error).
  ipcMain.handle('log:read', async (_e, logPath: string) => {
    try {
      return ok(readFileSync(logPath, 'utf-8'))
    } catch {
      return ok('')
    }
  })
}
