import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './AuthContext.jsx'
// DEBUGOVERFLOW: temp, remove with src/debugOverflow.js once mobile cutoff bug is fixed
import { initDebugOverflow } from './debugOverflow.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
initDebugOverflow() // DEBUGOVERFLOW: no-op unless ?debugoverflow=1
