import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { CrashScreen } from './components/Crash.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CrashScreen>
      <App />
    </CrashScreen>
  </StrictMode>,
)

// Lets the app open without a signal once it has been opened online.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // An update took over while the app was open (not the very first install): the app says so and offers to
  // reload, because the screens on show are still the old ones.
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.dispatchEvent(new Event('shelf-planner-updated')))
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
