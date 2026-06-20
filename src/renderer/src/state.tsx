import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import type { RunMode } from '@shared/types'

export type Surface = 'briefing' | 'curator' | 'projects' | 'vault'
const surfaces: Surface[] = ['briefing', 'curator', 'projects', 'vault']

export interface ToastMsg {
  text: string
  ok: boolean
}

interface AppState {
  surface: Surface
  setSurface: (s: Surface) => void
  runMode: RunMode
  setRunMode: (m: RunMode) => void
  toast: ToastMsg | null
  showToast: (text: string, ok?: boolean) => void
  clearToast: () => void
  updating: boolean
  setUpdating: (b: boolean) => void
  updateAvailable: boolean
  setUpdateAvailable: (b: boolean) => void
}

const Ctx = createContext<AppState | null>(null)

function getInitialSurface(): Surface {
  const surface = new URLSearchParams(window.location.search).get('surface')
  return surfaces.includes(surface as Surface) ? (surface as Surface) : 'briefing'
}

export function AppProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [surface, setSurface] = useState<Surface>(getInitialSurface)
  const [runMode, setRunMode] = useState<RunMode>('visible')
  const [toast, setToast] = useState<ToastMsg | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const showToast = useCallback((text: string, ok: boolean = true) => setToast({ text, ok }), [])
  const clearToast = useCallback(() => setToast(null), [])
  return (
    <Ctx.Provider
      value={{
        surface, setSurface, runMode, setRunMode, toast, showToast, clearToast,
        updating, setUpdating, updateAvailable, setUpdateAvailable
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used within AppProvider')
  return v
}
