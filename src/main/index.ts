import { app, shell, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { appendFileSync, mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerDataIpc } from './ipc/data'
import { registerSpawnIpc } from './ipc/spawn'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const surfaceArg = '--surface='
const surfaces = new Set(['briefing', 'curator', 'projects', 'vault'])

// Dev-only: expose the renderer over CDP (port 9222) so chrome-devtools can attach for
// live UI verification/tuning. Guarded by is.dev — never enabled in the packaged app.
if (is.dev) app.commandLine.appendSwitch('remote-debugging-port', '9222')

// This machine's standalone GPU process breakpoint-crashes during its sandbox init (exit
// 0x80000003), which kills the whole app after 9 retries before the window ever paints.
// Disabling just the GPU sandbox lets the out-of-process GPU start and present normally —
// empirically verified to both launch AND paint. (For the record: `in-process-gpu` launches
// but renders a blank window, and `disableHardwareAcceleration()` still crashes.) This lives
// in code, so it survives `npm run push` and full reinstalls — no shortcut flag needed.
app.commandLine.appendSwitch('disable-gpu-sandbox')

// --- Reliability Standard, Pillar B: launch robustness (RELIABILITY_STANDARD.md) ----------
// Every launch leaves a log trail and every crash names itself, written to
// %APPDATA%\agentic_os_2\logs\main.log. The 2026-06-03 GPU crash left ZERO trace — diagnosing
// it meant an afternoon of manual stderr capture. With this, the next failure is a 2-min read.
function logLine(line: string): void {
  try {
    const dir = join(app.getPath('userData'), 'logs')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'main.log'), `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    // logging must never crash the app
  }
}

process.on('uncaughtException', (err) => logLine(`uncaughtException: ${String(err?.stack || err)}`))
process.on('unhandledRejection', (reason) => logLine(`unhandledRejection: ${String(reason)}`))

// A GPU/utility child process died (e.g. the sandbox crash we fixed) — record it instead of
// failing silently. The app survives these now; the log makes any recurrence obvious.
app.on('child-process-gone', (_e, d) =>
  logLine(`child-process-gone: type=${d.type} reason=${d.reason} exitCode=${d.exitCode}`)
)

// Idempotent launch: a second double-click focuses the existing window instead of spawning a
// duplicate (we accumulated 4 stray instances during the GPU debugging — this prevents that).
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      const surface = getLaunchSurface(commandLine)
      if (surface) loadRenderer(surface)
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function getLaunchSurface(args: string[] = process.argv): string | null {
  const arg = args.find((v) => v.startsWith(surfaceArg))
  const surface = arg?.slice(surfaceArg.length)
  return surface && surfaces.has(surface) ? surface : null
}

function loadRenderer(surface: string | null = getLaunchSurface()): void {
  if (!mainWindow) return

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    if (surface) url.searchParams.set('surface', surface)
    mainWindow.loadURL(url.toString())
    return
  }

  const indexPath = join(__dirname, '../renderer/index.html')
  if (surface) mainWindow.loadFile(indexPath, { query: { surface } })
  else mainWindow.loadFile(indexPath)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#16130f',
    title: 'Agentic OS 2.0',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false // template default — allows the ESM preload; contextIsolation stays on
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    logLine('window ready-to-show (visible)')
  })

  // Renderer (the React UI) crashed → log it and reload, so the user isn't stranded on a blank
  // window instead of the app just dying. Pillar B self-heal.
  mainWindow.webContents.on('render-process-gone', (_e, d) => {
    logLine(`render-process-gone: reason=${d.reason} exitCode=${d.exitCode} — reloading`)
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload()
  })

  // Close → hide to tray (don't quit) unless a real quit was requested via the tray menu.
  mainWindow.on('close', (e) => {
    if (!(app as unknown as { isQuiting?: boolean }).isQuiting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRenderer()
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(icon))
  const menu = Menu.buildFromTemplate([
    { label: 'Show Agentic OS 2.0', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        ;(app as unknown as { isQuiting?: boolean }).isQuiting = true
        app.quit()
      }
    }
  ])
  tray.setToolTip('Agentic OS 2.0')
  tray.setContextMenu(menu)
  tray.on('click', () => mainWindow?.show())
}

app.whenReady().then(() => {
  logLine(`app ready — v${app.getVersion()} — creating window`)
  electronApp.setAppUserModelId('com.agentic.os2')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Read-only data handlers + STUBBED spawn handlers (M1 — no process is launched).
  registerDataIpc()
  registerSpawnIpc()

  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

// Do NOT app.quit() in window-all-closed on Windows (DERISK PROBE 2) — the tray keeps
// the app alive; real quit happens via the tray Quit item (sets isQuiting then app.quit()).
app.on('window-all-closed', () => {
  // intentionally empty
})
