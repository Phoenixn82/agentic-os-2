import { Nav } from './components/Nav'
import { SelfEditTab } from './components/SelfEditTab'
import { StubToast } from './components/StubToast'
import { AppProvider, useApp } from './state'
import { Briefing } from './surfaces/Briefing'
import { Projects } from './surfaces/Projects'
import { Vault } from './surfaces/Vault'
import { VideoCurator } from './surfaces/VideoCurator'

function Surfaces(): React.JSX.Element {
  const { surface } = useApp()
  switch (surface) {
    case 'curator':
      return <VideoCurator />
    case 'projects':
      return <Projects />
    case 'vault':
      return <Vault />
    case 'briefing':
    default:
      return <Briefing />
  }
}

function UpdateOverlay(): React.JSX.Element | null {
  const { updating } = useApp()
  if (!updating) return null
  return (
    <div className="update-overlay">
      <div className="update-card">
        <div className="update-spinner" />
        <div className="update-title serif">Updating Agentic OS 2.0…</div>
        <div className="update-sub">
          Applying the new version — the app will close and reopen in a moment.
        </div>
      </div>
    </div>
  )
}

function SelfEditSlot(): React.JSX.Element | null {
  const { surface } = useApp()
  if (surface === 'curator') return null
  return <SelfEditTab />
}

function App(): React.JSX.Element {
  return (
    <AppProvider>
      <Nav />
      <Surfaces />
      <StubToast />
      <UpdateOverlay />
      <SelfEditSlot />
    </AppProvider>
  )
}

export default App
