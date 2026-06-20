import { api } from '../lib/api'
import { useApp } from '../state'

export function SelfEditTab(): React.JSX.Element {
  const { showToast } = useApp()

  async function editSelf(): Promise<void> {
    const r = await api.editSelf()
    if (r.ok) {
      showToast(`launched${r.pid ? ' · pid '+r.pid : ''} — ${r.cmd ?? ''}`, true)
    } else {
      showToast(`failed — ${r.error ?? 'unknown error'}`, false)
    }
  }

  return (
    <button
      className="self-edit-tab"
      title="Open a Claude terminal in the Agentic OS 2.0 source folder"
      onClick={editSelf}
    >
      <span aria-hidden="true">🔧</span>
      <span>work on this app</span>
    </button>
  )
}
