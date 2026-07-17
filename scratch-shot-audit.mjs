import { chromium } from 'playwright'
import path from 'node:path'

const OUT_DIR = 'E:/pm-app/design/before'

const STEPS = [
  { name: 'Dashboard', selector: '.dashboard', file: 'Screenshot 2026-07-17 Dashboard.png' },
  { name: 'Gantt Chart', selector: '.gantt-chart', file: 'Screenshot 2026-07-17 Gantt.png' },
  { name: 'Documents detail (Charter/Requirements)', selector: '.charter-page', file: 'Screenshot 2026-07-17 Documents Detail.png' },
  { name: 'Manage Access expanded', selector: '.collaborator-list', file: 'Screenshot 2026-07-17 Manage Access.png' },
  { name: 'Budget Tracker steady-state', selector: '.budget-summary-cards', file: 'Screenshot 2026-07-17 Budget Tracker.png' },
]

const STEP_TIMEOUT_MS = 8 * 60 * 1000

const browser = await chromium.launch({ headless: false })
browser.on('disconnected', () => console.log('[warn] browser disconnected'))
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
})
page.on('close', () => console.log('[warn] page closed'))
await page.goto('http://localhost:5173/login')

try {
  for (const step of STEPS) {
    console.log(`\n[waiting] ${step.name} -- looking for ${step.selector}`)
    const deadline = Date.now() + STEP_TIMEOUT_MS
    let found = false
    while (Date.now() < deadline) {
      const count = await page.locator(step.selector).count()
      if (count > 0) {
        found = true
        break
      }
      await page.waitForTimeout(1500)
    }

    if (!found) {
      console.log(`[timeout] ${step.name} -- moving on without a capture`)
      continue
    }

    await page.waitForTimeout(600)
    const outPath = path.join(OUT_DIR, step.file)
    await page.screenshot({ path: outPath, fullPage: true })
    console.log(`[captured] ${step.name} -> ${outPath}`)
  }
} catch (err) {
  console.log(`[error] ${err.message}`)
  process.exit(1)
}

console.log('\nAll steps done. Closing browser.')
await browser.close()
