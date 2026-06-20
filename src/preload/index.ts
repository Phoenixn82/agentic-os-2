import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AgenticApi, ApprovalState, Engine, RunMode } from '../shared/types'

// Data channels use the IpcResult envelope ({ok,data}|{ok,error}); unwrap here so the
// renderer gets the bare value (and a thrown Error only on the failure path).
async function invokeData<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as
    | { ok: true; data: T }
    | { ok: false; error: string }
  if (res && res.ok) return res.data
  throw new Error((res && 'error' in res && res.error) || `IPC ${channel} failed`)
}

// Spawn channels are STUBBED in M1 and always resolve to a SpawnStubResult (ok:true) —
// they never throw across IPC, so pass them through unwrapped.
const api: AgenticApi = {
  projects: () => invokeData('data:projects'),
  vault: {
    stats: () => invokeData('data:vault'),
    tree: () => invokeData('data:vaultTree'),
    read: (relPath: string) => invokeData('data:vaultRead', relPath)
  },
  dailyFable: () => invokeData('data:dailyFable'),
  curator: () => invokeData('data:curator'),
  briefing: () => invokeData('data:briefing'),
  compileBriefing: () => invokeData('briefing:compile'),
  approvals: {
    get: () => invokeData('approvals:get'),
    set: (id: string, state: ApprovalState) => invokeData('approvals:set', id, state)
  },
  openInEditor: (slug: string) => ipcRenderer.invoke('spawn:openEditor', slug),
  startDev: (slug: string, serviceId?: string) =>
    ipcRenderer.invoke('spawn:startDev', slug, serviceId),
  newSession: (slug: string, mode: RunMode, engine: Engine, prompt?: string) =>
    ipcRenderer.invoke('spawn:newSession', slug, mode, engine, prompt),
  curateUrl: (url: string, engine: Engine) => ipcRenderer.invoke('spawn:curateUrl', url, engine),
  importSaved: () => ipcRenderer.invoke('spawn:importSaved'),
  teachVideo: (id: string) => ipcRenderer.invoke('spawn:teachVideo', id),
  openSession: (id: string) => ipcRenderer.invoke('spawn:openSession', id),
  editSelf: () => ipcRenderer.invoke('spawn:editSelf'),
  openExternal: (url: string) => ipcRenderer.invoke('spawn:openExternal', url),
  selfUpdate: () => ipcRenderer.invoke('app:selfUpdate'),
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  restart: () => ipcRenderer.invoke('app:restart'),
  readLog: (logPath: string) => invokeData('log:read', logPath)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
