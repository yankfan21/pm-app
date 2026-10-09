import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import '@fontsource-variable/schibsted-grotesk'
import '@fontsource-variable/hanken-grotesk'
import './index.css'
import './theme-calmsky.css'
import App from './App.jsx'
import { AuthProvider } from './AuthContext.jsx'
import { BrandingProvider } from './branding/BrandingContext.jsx'

// Local preview of the in-progress CalmSky_Redesign (src/theme-calmsky.css).
// VITE_CALMSKY_REDESIGN is unset in production, so the shipped theme is unchanged.
if (import.meta.env.VITE_CALMSKY_REDESIGN === 'true') {
  document.documentElement.setAttribute('data-theme', 'calmsky')
}

const tree = (
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <BrandingProvider>
          <App />
        </BrandingProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)

const container = document.getElementById('root')

// react-snap (see scripts/prerender.mjs) prerenders ONLY "/" - the public
// marketing page - and writes the resulting markup into dist/index.html's
// #root. Two consequences drive the branch below:
//
// 1. On "/" in production, #root already holds real HTML, so the tree has to
//    be hydrated rather than re-rendered from scratch; createRoot would throw
//    the crawlable markup away and repaint, costing the whole point of
//    prerendering.
// 2. vercel.json rewrites every unmatched path to /index.html, so /login,
//    /dashboard, /projects/... are all served that same file - meaning #root
//    holds the *marketing* markup while the router is about to render a
//    completely different route. Hydrating there is a guaranteed mismatch
//    (React 19 logs an error and falls back to client rendering, after a
//    flash of the marketing page), so those paths are explicitly emptied and
//    client-rendered.
//
// In dev, #root is empty on every path and this falls through to createRoot.
//
// Native (Capacitor) builds are excluded outright: they ship this same dist/,
// prerendered markup and all, and boot at "/" - but Marketing.jsx renders a
// <Navigate to="/dashboard"> there instead of the marketing page, so the
// prerendered HTML is guaranteed not to match. Client-render instead.
const isPrerenderedRoute =
  window.location.pathname === '/' && !Capacitor.isNativePlatform()

if (container.hasChildNodes() && isPrerenderedRoute) {
  hydrateRoot(container, tree)
} else {
  container.innerHTML = ''
  createRoot(container).render(tree)
}
