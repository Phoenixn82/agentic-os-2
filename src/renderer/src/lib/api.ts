import type { AgenticApi } from '@shared/types'

// window.api is injected by the preload contextBridge. This is the ergonomic import
// for the renderer so surfaces can `import { api } from '@renderer/lib/api'`.
export const api: AgenticApi = window.api
