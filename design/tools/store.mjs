// Usage (repo root, preview on :5183): node design/tools/store.mjs <outDir>
// App Store screenshots, 6.9" size: 440x956 @3 = 1320x2868, viewport only (not full page).
import { createRequire } from 'node:module'; const puppeteer = createRequire(process.cwd() + '/')('puppeteer')
const OUT = process.argv[2]
const shots = [
  ['1-dashboard', '/m/dashboard'],
  ['2-project', '/m/projects/p-app'],
  ['3-tasks', '/m/projects/p-app/tasks'],
  ['4-sprint-board', '/m/projects/p-app/sprint-board'],
  ['5-risks', '/m/projects/p-wms/more/risks'],
  ['6-status-update', '/m/projects/p-wms/more/status-update'],
]
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await b.newPage()
// The native app hides the desktop link and store badges (Capacitor.isNativePlatform); mimic that.
await p.evaluateOnNewDocument(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.app-store-badges,.mobile-desktop-link{display:none!important}'; document.head.appendChild(st) }) })
await p.setViewport({ width: 440, height: 956, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
for (const [name, r] of shots) {
  await p.goto('http://localhost:5183' + r, { waitUntil: 'networkidle0' })
  await new Promise(x => setTimeout(x, 1000))
  await p.screenshot({ path: `${OUT}/${name}.png` })
}
await b.close()
