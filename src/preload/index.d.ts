import { ElectronAPI } from '@electron-toolkit/preload'
import type { AgenticApi } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: AgenticApi
  }
}
