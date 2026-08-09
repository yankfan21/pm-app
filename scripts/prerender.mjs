// Prerender step, wired in as `npm run postbuild` so it runs automatically
// after `vite build`.
//
// Why this exists: index.html ships an empty <div id="root"></div>, so a
// crawler that does not execute JavaScript - Slack, LinkedIn, Twitter/X, Bing
// - sees no content at all on the marketing page. react-snap loads the built
// bundle in a real browser, snapshots the resulting DOM, and writes it back
// into dist/index.html, so "/" serves real HTML while staying the same SPA on
// the client (see main.jsx's hydrate branch).
//
// Why a script instead of a bare `"postbuild": "react-snap"`: react-snap 1.23
// depends on puppeteer ^1.8, whose bundled Chromium download is ancient and
// frequently unavailable (and is blocked outright by npm install-script
// policy on this machine). Everything below is about finding *a* Chrome to
// drive, and failing with an actionable message instead of a puppeteer stack
// trace when there isn't one.
//
// Only "/" is prerendered: `include: ["/"]` plus `crawl: false`, so react-snap
// does not follow the page's own "Sign in" link into /login, and never
// touches an authenticated route (which has no content without a session
// anyway, and must not have a session baked into a static file).

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// react-snap and puppeteer are both CommonJS with no ESM export map.
const require = createRequire(import.meta.url)
const { run } = require('react-snap')

// Downloads Playwright's pinned Chromium into its usual cache if it is not
// already there, and returns the path. Needed because a Vercel build container
// has no system Chrome AND no Playwright browser: `playwright` is a
// devDependency so its postinstall does not reliably run there (a restored
// node_modules cache skips install scripts entirely), which failed the first
// deploy of this script with "no Chrome/Chromium binary found". Returns
// undefined rather than throwing so the caller can keep looking.
function resolvePlaywrightChromium() {
  let chromium
  let packageDir
  try {
    chromium = require('playwright').chromium
    // playwright's "exports" map does not expose ./cli.js, so resolve the
    // package entry point and walk up to the directory instead.
    packageDir = dirname(require.resolve('playwright'))
  } catch {
    return undefined // playwright not installed at all
  }

  const existing = chromium.executablePath()
  if (existing && existsSync(existing)) return existing

  console.log('Prerender: Playwright Chromium missing - downloading it...')
  const result = spawnSync(process.execPath, [join(packageDir, 'cli.js'), 'install', 'chromium'], {
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    console.warn('Prerender: `playwright install chromium` failed; trying other browsers.')
    return undefined
  }

  const installed = chromium.executablePath()
  return installed && existsSync(installed) ? installed : undefined
}

// Checked in order. An explicit env var wins so CI (or a Vercel build with a
// Chrome layer) can point at whatever it has without editing this file.
const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
]

function resolveChromePath() {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      throw new Error(
        `Prerender: PUPPETEER_EXECUTABLE_PATH/CHROME_PATH points at "${fromEnv}", which does not exist.`,
      )
    }
    return fromEnv
  }

  // A system Chrome, if this is a dev machine. Checked before Playwright's so
  // a local build does not pay for a browser download it does not need.
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate))
  if (found) return found

  // Playwright's pinned Chromium, fetched on demand - the CI/Vercel path.
  const playwrightChromium = resolvePlaywrightChromium()
  if (playwrightChromium) return playwrightChromium

  // Last resort: puppeteer 1.x's own bundled Chromium, if its install script
  // did get to run. Deliberately ranked *below* a system Chrome - that build
  // is Chromium 71, which predates optional chaining and nullish coalescing,
  // so it throws "SyntaxError: Unexpected token '?'" on the Vite bundle and
  // snapshots an empty #root. The assertion at the bottom of this file is what
  // catches that if it ever happens again.
  try {
    const bundled = require('puppeteer').executablePath()
    if (bundled && existsSync(bundled)) return bundled
  } catch {
    // puppeteer unresolvable or a version without executablePath().
  }

  throw new Error(
    'Prerender: no Chrome/Chromium binary found. Install Chrome, or set ' +
      'PUPPETEER_EXECUTABLE_PATH to one. To ship a build without prerendered ' +
      'HTML (social previews on "/" will be empty), set SKIP_PRERENDER=1.',
  )
}

if (process.env.SKIP_PRERENDER === '1') {
  console.log('Prerender: skipped (SKIP_PRERENDER=1). dist/index.html has an empty #root.')
  process.exit(0)
}

const puppeteerExecutablePath = resolveChromePath()
console.log(`Prerender: driving ${puppeteerExecutablePath}`)

// A string that only exists in Marketing.jsx's rendered output. react-snap
// exits 0 even when the page threw and it snapshotted an empty #root, so the
// build is only actually green if this text made it into the file.
const PRERENDER_PROOF = 'Project management that actually knows your project.'

await run({
  source: 'dist',
  include: ['/'],
  // Do not follow links out of "/" - see the header comment.
  crawl: false,
  // Blocks non-localhost requests during the snapshot, so Supabase auth calls
  // from AuthProvider cannot stall or bake a response into the static HTML.
  skipThirdPartyRequests: true,
  // A Create React App workaround; Vite's chunk naming is unrelated to it and
  // leaving it on rewrites script tags that are already correct.
  fixWebpackChunksIssue: false,
  // Vite does not emit sourcemaps in this project's build, so there is nothing
  // for react-snap's sourcemapped stack traces to read.
  sourceMaps: false,
  puppeteerArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
  puppeteerExecutablePath,
}).catch((error) => {
  console.error(error)
  process.exit(1)
})

const html = readFileSync('dist/index.html', 'utf8')
if (!html.includes(PRERENDER_PROOF)) {
  console.error(
    'Prerender: dist/index.html does not contain the marketing page text. The ' +
      'snapshot ran but captured an empty #root - check the "pageerror at /" ' +
      `line above. Browser used: ${puppeteerExecutablePath}`,
  )
  process.exit(1)
}
console.log('Prerender: dist/index.html contains the marketing page markup.')
