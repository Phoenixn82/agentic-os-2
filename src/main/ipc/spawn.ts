import { ipcMain, app, shell } from 'electron'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { Engine, RunMode, SpawnResult } from '../../shared/types'
import { getProjects } from '../lib/projects'
import {
  PROJECTS_DIR, EDITOR_EXE, CLAUDE_CMD, CODEX_CMD,
  CURATOR_LIVE_DIR, CURATOR_DIR, CURATOR_FEEDBACK_DIR, CURATOR_SESSION_DIR,
  CURATOR_LEARNINGS, ROOT, VAULT,
  AGENTIC_PROJECT_DIR, SELF_UPDATE_SCRIPT, IMPORT_SOURCES, IMPORT_STATE,
  FREELLM_CMD, VIDEO_CURATOR_SCRIPT, VIDEO_IMPORT_SCRIPT
} from '../lib/paths'
import { openEditor, openVisibleTerminal, openBrowser, runHeadless } from '../lib/spawn-core'
import {
  sessionHeadlessSpec,
  sessionVisibleCommand,
  logStem
} from '../lib/spawn-args'

const ENGINE_PATHS = { claudeCmd: CLAUDE_CMD, codexCmd: CODEX_CMD, freellmCmd: FREELLM_CMD }

function projectDir(slug: string): string {
  const p = getProjects().find((x) => x.slug === slug)
  return join(PROJECTS_DIR, p ? p.dir : slug)
}

export function registerSpawnIpc(): void {
  // M2 - real: open the project dir in the configured editor.
  ipcMain.handle('spawn:openEditor', async (_e, slug: string): Promise<SpawnResult> => {
    return openEditor(EDITOR_EXE, projectDir(slug))
  })

  // M2 — real: spawn the dev command (with its sticky port) in a visible terminal,
  // then open the browser on that port. Monorepos pass a serviceId to pick the service.
  ipcMain.handle(
    'spawn:startDev',
    async (_e, slug: string, serviceId?: string): Promise<SpawnResult> => {
      const p = getProjects().find((x) => x.slug === slug)
      const dir = projectDir(slug)
      let cmd = p?.devCommand ?? ''
      let port = p?.port ?? null
      if (serviceId && p?.services) {
        const s = p.services.find((x) => x.id === serviceId)
        if (s) {
          cmd = s.devCommand
          port = s.port
        }
      }
      if (!cmd) {
        return {
          ok: false,
          error: `no dev command for ${slug}${serviceId ? '/' + serviceId : ''}`,
          cmd: ''
        }
      }
      const res = openVisibleTerminal(dir, cmd)
      if (res.ok && port) {
        setTimeout(() => openBrowser(`http://localhost:${port}`), 3500)
        res.cmd = `${res.cmd}  → http://localhost:${port}`
      }
      return res
    }
  )

  // M3 - real sessions. visible = interactive engine CLI in a terminal the user types into;
  // headless = background job whose stdout/stderr stream to a log file the renderer tails.
  ipcMain.handle(
    'spawn:newSession',
    async (
      _e,
      slug: string,
      mode: RunMode,
      engine: Engine,
      prompt?: string
    ): Promise<SpawnResult> => {
      const dir = projectDir(slug)
      if (mode === 'visible') {
        return openVisibleTerminal(dir, sessionVisibleCommand(engine, ENGINE_PATHS))
      }
      // headless
      if (!prompt || !prompt.trim()) {
        return { ok: false, error: 'a headless session needs a prompt (nothing to run)' }
      }
      const spec = sessionHeadlessSpec(engine, prompt.trim(), ENGINE_PATHS)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const logPath = join(
        app.getPath('userData'),
        'sessions',
        `${logStem(slug, engine, mode, stamp)}.log`
      )
      return runHeadless(spec.exe, spec.args, dir, logPath, spec.env)
    }
  )

  // M5 — real: spawn the python curator pipeline (headless, log-tailed).
  // python curate.py "<URL>" --out <curator-dir> --learnings <learnings-file>
  ipcMain.handle(
    'spawn:curateUrl',
    async (_e, url: string, _engine: Engine): Promise<SpawnResult> => {
      if (!url || !url.trim()) return { ok: false, error: 'no URL to curate', cmd: '' }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const logPath = join(
        app.getPath('userData'),
        'curator',
        `${logStem('curate', 'freellm', 'headless', stamp)}.log`
      )
      return runHeadless(
        'python',
        [VIDEO_CURATOR_SCRIPT, url.trim(), '--out', CURATOR_LIVE_DIR, '--learnings', CURATOR_LEARNINGS],
        ROOT,
        logPath
      )
    }
  )

  // On-demand: enumerate the configured playlist + IG collection, dedupe, curate each NEW
  // video (headless, log-tailed). Fired from compile-briefing (toggle+confirm), never a daemon.
  ipcMain.handle('spawn:importSaved', async (): Promise<SpawnResult> => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const logPath = join(app.getPath('userData'), 'import',
      `${logStem('import', 'freellm', 'headless', stamp)}.log`)
    return runHeadless('python',
      [VIDEO_IMPORT_SCRIPT, '--sources', IMPORT_SOURCES, '--out', CURATOR_LIVE_DIR,
       '--state', IMPORT_STATE, '--learnings', CURATOR_LEARNINGS],
      ROOT, logPath)
  })

  // Teach / feedback loop: write a brief file, open it in the configured editor, and spawn a
  // visible Claude session in the feedback dir so the user can correct the curation in-place.
  ipcMain.handle('spawn:teachVideo', async (_e, id: string): Promise<SpawnResult> => {
    if (!id || !id.trim()) return { ok: false, error: 'no video id', cmd: '' }
    const safeId = id.trim()

    // Read the existing note from the live dir first, then fall back to the archive seed dir.
    let noteContent = ''
    for (const dir of [CURATOR_LIVE_DIR, CURATOR_DIR]) {
      try {
        noteContent = readFileSync(join(dir, `${safeId}.md`), 'utf-8')
        break
      } catch {
        // try next dir
      }
    }

    const briefPath = join(CURATOR_FEEDBACK_DIR, `${safeId}.md`)
    const briefContent = [
      `# Curator Feedback — ${safeId}`,
      '',
      `**Video id:** ${safeId}`,
      '',
      '## Instruction for Claude',
      '',
      'The user will tell you what this video is REALLY about and what the actionable step SHOULD be.',
      'Capture his correction and APPEND a concise learning to:',
      `\`${CURATOR_LEARNINGS}\``,
      '(create the file if missing)',
      'so future curation improves.',
      'Take examples at face value; do not over-conceptualize.',
      '',
      '## Current note content',
      '',
      noteContent || '(no existing note found — this may be a new video)',
    ].join('\n')

    try {
      mkdirSync(CURATOR_FEEDBACK_DIR, { recursive: true })
      writeFileSync(briefPath, briefContent, 'utf-8')
    } catch (e) {
      return {
        ok: false,
        error: `failed to write brief: ${e instanceof Error ? e.message : String(e)}`,
        cmd: ''
      }
    }

    // Open the brief in the editor so the user sees it.
    openEditor(EDITOR_EXE, briefPath)

    // Spawn a visible, INTERACTIVE Claude session seeded with an initial prompt (a positional
    // arg keeps the session interactive. `--print` would run once and exit, so the user could
    // not actually give feedback. Claude reads the brief, then converses with the user.
    const claudeCmd = sessionVisibleCommand('claude', ENGINE_PATHS)
    const seed = `Read ${briefPath} for context. The user will tell you what this video is really about and what the actionable step should be - capture the correction and append a concise learning to ${CURATOR_LEARNINGS}.`
    const sessionCmd = `${claudeCmd} "${seed.replace(/"/g, '\\"')}"`
    return openVisibleTerminal(CURATOR_FEEDBACK_DIR, sessionCmd)
  })

  // "Accept → open as session": the real action behind the accept button. Write a mission
  // brief for the video, then open a VISIBLE, INTERACTIVE Claude session CD'd into ROOT
  // so it can edit anything - vault, skills, any project - to make the video's concept
  // real. The brief boots the session with local vault context (bounded), the curator note,
  // an interview step, then build. Same hardened spawn path as the teach loop.
  ipcMain.handle('spawn:openSession', async (_e, id: string): Promise<SpawnResult> => {
    if (!id || !id.trim()) return { ok: false, error: 'no video id', cmd: '' }
    const safeId = id.trim()

    // Resolve the curator note path (live dir first, then the archive seed dir). The session
    // reads it directly, so we only need the path — null if neither has it.
    let notePath: string | null = null
    for (const dir of [CURATOR_LIVE_DIR, CURATOR_DIR]) {
      const candidate = join(dir, `${safeId}.md`)
      if (existsSync(candidate)) {
        notePath = candidate
        break
      }
    }

    const briefPath = join(CURATOR_SESSION_DIR, `${safeId}.md`)
    const briefContent = [
      `# Build session — ${safeId}`,
      '',
      'You are starting an INTERACTIVE build session with the user. They just accepted this video',
      "from the Video Curator and wants to turn its concept into a real change. You are CD'd into",
      'the local workspace and may edit ANYTHING needed (the vault, any skill/mechanic, any project) to',
      'make it happen.',
      '',
      '## Step 1 - Load the local workspace (bounded; do NOT burn tokens)',
      'Read these vault files directly if they exist:',
      `- ${join(VAULT, '_CLAUDE.md')}`,
      `- ${join(VAULT, 'index.md')}`,
      `- the last ~10 entries of ${join(VAULT, 'log.md')}`,
      'Then run the /obsidian-world skill for a richer load, WITH THESE GUARDS:',
      '- If identity files (SOUL.md, CRITICAL_FACTS.md, CORE_VALUES.md, Home.md) are missing,',
      '  SKIP them silently. Do NOT offer to create them. Do NOT load L3 deep context.',
      'This is a boot-up, not a report - get up to speed and move on.',
      '',
      '## Step 2 — Understand the video',
      notePath
        ? [
            'Read the curator\'s note for this video:',
            `  ${notePath}`,
            'It contains what the video is about, how it compares to the local workflow, a routing',
            'decision, an actionable extract, and (if present) the transcript.'
          ].join('\n')
        : `The curator note for ${safeId} could not be found - ask the user for the link and what the video showed.`,
      '',
      '## Step 3 - Interview the user',
      'The curator note is a GUESS, not the user\'s intent. Ask one pointed question at',
      'a time to pin down EXACTLY what should be built and why:',
      '- What concrete outcome should come from this video?',
      '- Where does it land — a skill/mechanic, the dashboard, the vault, or a project?',
      '- What does "done" look like (success criteria)?',
      '- What did the curator get wrong or miss?',
      '',
      '## Step 4 — Build it',
      'Once you both agree on scope, implement it across the local workspace. Follow the repo conventions',
      '(AGENTS.md / SKILLS_INDEX.md auto-load in this directory).'
    ].join('\n')

    try {
      mkdirSync(CURATOR_SESSION_DIR, { recursive: true })
      writeFileSync(briefPath, briefContent, 'utf-8')
    } catch (e) {
      return {
        ok: false,
        error: `failed to write brief: ${e instanceof Error ? e.message : String(e)}`,
        cmd: ''
      }
    }

    const claudeCmd = sessionVisibleCommand('claude', ENGINE_PATHS)
    const seed = `Read ${briefPath} and follow it: get up to speed on the local workspace and this video, then interview the user and build what they want.`
    const sessionCmd = `${claudeCmd} "${seed.replace(/"/g, '\\"')}"`
    return openVisibleTerminal(ROOT, sessionCmd)
  })

  // Self-edit: open a visible, interactive Claude session CD'd into THIS app's own source
  // dir so the user can make changes to Agentic OS 2.0 itself. Same hardened spawn path as the
  // teach loop; bare claude (no seed) — a "ready terminal".
  ipcMain.handle('spawn:editSelf', async (): Promise<SpawnResult> => {
    return openVisibleTerminal(AGENTIC_PROJECT_DIR, sessionVisibleCommand('claude', ENGINE_PATHS))
  })

  // Open an external URL (e.g. the original video) in the OS default browser.
  ipcMain.handle('spawn:openExternal', async (_e, url: string): Promise<void> => {
    if (url && /^https?:\/\//i.test(url)) await shell.openExternal(url)
  })

  // In-app self-update (the "Update" button). Spawn a DETACHED, HIDDEN helper that rebuilds
  // the bundle while this app is still open, then closes the app, swaps the matched exe+asar
  // into the install, and relaunches. detached + unref so it outlives the app it will kill.
  ipcMain.handle('app:selfUpdate', async (): Promise<SpawnResult> => {
    try {
      // Launch via `cmd /c start` so the helper is a FULLY independent process — it must
      // outlive this app, which it will close. A bare detached spawn proved unreliable here.
      const child = spawn(
        'cmd.exe',
        [
          '/c', 'start', '', '/min',
          'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass',
          '-WindowStyle', 'Hidden', '-File', SELF_UPDATE_SCRIPT
        ],
        { detached: true, windowsHide: true, stdio: 'ignore', cwd: AGENTIC_PROJECT_DIR }
      )
      child.unref()
      return { ok: true, cmd: 'self-update: apply staged build + relaunch' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  // Is a newer build staged? Compare the running app's app.asar to the freshly-built one
  // in dist\win-unpacked (produced by `npm run build:unpack`). Cheap hash compare; the
  // "Update" button only shows when these differ. Returns false in dev (no packaged asar).
  ipcMain.handle('app:checkUpdate', async (): Promise<{ available: boolean }> => {
    try {
      const installed = join(process.resourcesPath, 'app.asar')
      const staged = join(AGENTIC_PROJECT_DIR, 'dist', 'win-unpacked', 'resources', 'app.asar')
      if (!existsSync(installed) || !existsSync(staged)) return { available: false }
      const hash = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')
      return { available: hash(installed) !== hash(staged) }
    } catch {
      return { available: false }
    }
  })

  // Restart the app (the "↻ restart" button). relaunch() queues a fresh instance to spawn
  // when this process exits; set isQuiting so the window close handler quits instead of
  // hiding to tray, and the single-instance lock is released before the new instance starts.
  // The small delay lets this IPC reply reach the renderer first. Detached dev terminals /
  // sessions run in their own windows and are unaffected.
  ipcMain.handle('app:restart', async (): Promise<SpawnResult> => {
    try {
      app.relaunch()
      ;(app as unknown as { isQuiting?: boolean }).isQuiting = true
      setTimeout(() => app.quit(), 120)
      return { ok: true, cmd: 'restart: relaunch app' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}
