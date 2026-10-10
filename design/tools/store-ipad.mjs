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
  if (name.includes('dashboard')) {
    // Dismiss the intro banner so the project cards lead.
    await p.evaluate(() => document.querySelector('button[aria-label*="ismiss" i], button[aria-label*="lose" i]')?.click())
    await new Promise(x => setTimeout(x, 500))
  }
  if (name.includes('gantt')) {
    // Start the chart at today and run it to the go-live month (React-controlled date inputs).
    await p.evaluate(() => {
      const iso = d => d.toISOString().slice(0, 10)
      const from = new Date(), to = new Date(Date.now() + 75 * 864e5)
      const [a, b] = document.querySelectorAll('input[type="date"]')
      const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }
      set(a, iso(from)); set(b, iso(to))
    })
    await new Promise(x => setTimeout(x, 800))
    // Critical path on, then collapse the finished phases so the live Execution work leads.
    await p.evaluate(() => {
      const cb = [...document.querySelectorAll('label')].find(l => /critical path/i.test(l.textContent))?.querySelector('input')
      if (cb && !cb.checked) cb.click()
    })
    await new Promise(x => setTimeout(x, 600))
    await p.evaluate(() => {
      for (const btn of document.querySelectorAll('.gantt-phase-toggle')) {
        if (/^(Initiation|Planning) Phase$/.test(btn.textContent.replace('▾', '').trim())) btn.click()
      }
    })
    await new Promise(x => setTimeout(x, 600))
  }
  await p.screenshot({ path: `${OUT}/${name}.png` })
}
await b.close()
