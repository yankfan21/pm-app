// Usage (repo root, preview on :5183): node design/tools/store.mjs <outDir>
// App Store screenshots, viewport only (not full page). Default 6.9" size: 440x956 @3 = 1320x2868.
// Pass a third arg "6.3" for 402x874 @3 = 1206x2622 (the "iPhone with Dynamic Island, medium display" slot).
import { createRequire } from 'node:module'; const puppeteer = createRequire(process.cwd() + '/')('puppeteer')
const OUT = process.argv[2]
const [W, H] = process.argv[3] === '6.3' ? [402, 874] : [440, 956]
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
await p.setViewport({ width: W, height: H, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
for (const [name, r] of shots) {
  await p.goto('http://localhost:5183' + r, { waitUntil: 'networkidle0' })
  await new Promise(x => setTimeout(x, 1000))
  await p.screenshot({ path: `${OUT}/${name}.png` })
}
await b.close()
