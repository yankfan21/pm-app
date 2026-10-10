// Usage (repo root, preview on :5183): node design/tools/store-ipad.mjs <outDir>
// App Store iPad screenshots, 13" size: 1376x1032 @2 = 2752x2064 landscape, viewport only.
// iPad (>= 768px) gets the desktop layout, so these are desktop routes.
import { createRequire } from 'node:module'; const puppeteer = createRequire(process.cwd() + '/')('puppeteer')
const OUT = process.argv[2]
const shots = [
  ['1-dashboard', '/dashboard'],
  ['2-gantt', '/projects/p-wms/execution/gantt'],
  ['3-overview', '/projects/p-wms/overview'],
  ['4-risk-log', '/projects/p-wms/risk-log'],
]
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await b.newPage()
// The native app hides the store badges (Capacitor.isNativePlatform); mimic that.
await p.evaluateOnNewDocument(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.app-store-badges{display:none!important}'; document.head.appendChild(st) }) })
await p.setViewport({ width: 1376, height: 1032, deviceScaleFactor: 2, isMobile: false, hasTouch: true })
for (const [name, r] of shots) {
  await p.goto('http://localhost:5183' + r, { waitUntil: 'networkidle0' })
  await new Promise(x => setTimeout(x, 1200))
  await p.screenshot({ path: `${OUT}/${name}.png` })
}
await b.close()
