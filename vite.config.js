import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Vercel sets VERCEL_GIT_COMMIT_SHA automatically at build time on every
    // deploy - no dashboard config needed. Falls back to 'dev' for local
    // `vite dev`/`vite build` runs off Vercel. Temporary: added to compare
    // what commit a device's cached bundle is actually running against
    // what's currently deployed, while diagnosing an iPad-only stale-data bug.
    __BUILD_SHA__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7)),
  },
})
