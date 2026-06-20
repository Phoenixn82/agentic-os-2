import { useEffect } from 'react'
import { useApp } from '../state'

// Action feedback toast: shows what launched (or the would-run command for stubs),
// or the error on failure. Auto-dismisses; click to dismiss.
export function StubToast(): React.JSX.Element | null {
  const { toast, clearToast } = useApp()
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clearToast, 7000)
    return () => clearTimeout(t)
  }, [toast, clearToast])
  if (!toast) return null
  return (
    <div className={`toast ${toast.ok ? '' : 'err'}`} onClick={clearToast} title="click to dismiss">
      <div className="t-title">{toast.ok ? 'action' : 'failed'}</div>
      <div className="t-cmd">{toast.text}</div>
    </div>
  )
}
