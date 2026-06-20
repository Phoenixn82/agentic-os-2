import { spawn } from 'node:child_process'
import { openSync, appendFileSync, closeSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SpawnResult } from '../../shared/types'
import { visibleArgs } from './spawn-args'

// Frozen spawn primitives (DERISK-FINDINGS PROBE 1/3). The capability that killed v1:
// swallowed ENOENT + wt.exe app-alias + piping child output through Electron main. Fixes:
//   - `cmd /c start "" wt.exe` resolves the wt.exe MSIX alias even from a packaged app
//   - argv-as-ARRAY, never shell:true (spaces in paths)
//   - always attach child.on('error') so a failure is never a silent no-op
//   - headless writes straight to an OS file handle (never 'pipe') — the file IS the transcript

// --- spawners (thin wrappers; never throw, always return SpawnResult) ---

export function openVisibleTerminal(projectDir: string, commandToRun?: string): SpawnResult {
  const args = visibleArgs(projectDir, commandToRun)
  const cmd = `cmd ${args.join(' ')}`
  try {
    const child = spawn('cmd.exe', args, { detached: true, windowsHide: false, stdio: 'ignore' })
    child.on('error', (e) => console.error('[openVisibleTerminal]', e))
    child.unref()
    return { ok: true, pid: child.pid, cmd }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), cmd }
  }
}

// Launch the editor .exe DIRECTLY with the folder as an argument (argv array → spaces in the
// "Antigravity IDE" path are safe; no shell). Existence-guarded so a missing editor returns a
// real failure instead of a false "launched" (the v1 silent-no-op trap).
export function openEditor(editorExe: string, projectDir: string): SpawnResult {
  const cmd = `"${editorExe}" "${projectDir}"`
  if (!existsSync(editorExe)) {
    return { ok: false, error: `editor not found: ${editorExe}`, cmd }
  }
  try {
    const child = spawn(editorExe, [projectDir], { detached: true, stdio: 'ignore' })
    child.on('error', (e) => console.error('[openEditor]', e))
    child.unref()
    return { ok: true, pid: child.pid, cmd }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), cmd }
  }
}

/**
 * Headless: stdout/stderr → two append handles on the SAME log file (combined transcript).
 * RAW fds, never 'pipe' (Electron-on-Windows may never fire stdout 'data'). Appends an
 * [exit] sentinel so a re-attaching renderer can detect completion. Never throws.
 */
export function runHeadless(
  exe: string,
  args: string[],
  projectDir: string,
  logPath: string,
  env?: Record<string, string>
): SpawnResult {
  const cmd = `${exe} ${args.join(' ')}`
  try {
    mkdirSync(dirname(logPath), { recursive: true })
    const out = openSync(logPath, 'a')
    const err = openSync(logPath, 'a')
    appendFileSync(logPath, `[launch] ${cmd}\n[cwd] ${projectDir}\n`)
    const child = spawn(exe, args, {
      cwd: projectDir,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', out, err],
      env: { ...process.env, ...(env ?? {}) }
    })
    child.on('error', (e) => {
      try {
        appendFileSync(logPath, `\n[spawn-error] ${e.message}\n`)
      } catch {
        /* ignore */
      }
    })
    child.on('exit', (code, signal) => {
      try {
        appendFileSync(logPath, `\n[exit] code=${code} signal=${signal}\n`)
      } catch {
        /* ignore */
      }
      try {
        closeSync(out)
        closeSync(err)
      } catch {
        /* ignore */
      }
    })
    child.unref()
    return { ok: true, pid: child.pid, logPath, cmd }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), cmd, logPath }
  }
}

export function openBrowser(url: string): void {
  // Lazy import so this module can be imported outside Electron (vitest/standalone).
  import('electron')
    .then(({ shell }) => shell.openExternal(url))
    .catch((e) => console.error('[openBrowser]', e))
}
