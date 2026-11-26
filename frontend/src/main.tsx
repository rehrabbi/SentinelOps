import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './styles/tokens.css'
import './styles/base.css'
import { initTheme } from './theme/theme'
import { getMe } from './api'
import App from './App.tsx'

initTheme()

// Ask who is signed in now, while React sets up the first render, rather than after it: the
// answer decides which page to show, so it is on the path to the first meaningful paint.
const firstSessionCheck = getMe()
// App handles a failure (it treats it as signed out), but only once it mounts; this marks the
// promise as handled now, so a quick failure is not reported as an unhandled rejection meanwhile.
firstSessionCheck.catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App firstSessionCheck={firstSessionCheck} />
    </BrowserRouter>
  </StrictMode>,
)