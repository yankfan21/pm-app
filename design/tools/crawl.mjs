// Usage (repo root, preview on :5183): node design/tools/crawl.mjs <desktop|mobile> <outDir> <route...>
// Hovers/focuses every interactive element and clicks each button, scanning new states for stray navy/blue; screenshots anything that opens.
// Caveat: clicking "View desktop site" flips device mode mid-run, so mobile shots can show the desktop layout.
import { createRequire } from 'node:module'; const puppeteer = createRequire(process.cwd() + '/')('puppeteer')
const [,, mode, OUT, ...routes] = process.argv
const mobile = mode === 'mobile'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await b.newPage()
await p.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900 })
const wait = ms => new Promise(r => setTimeout(r, ms))
const SKIP = /sign out|log ?out|view desktop|export|download|print|fullscreen|delete account|clear/i

const scanFn = (rootSel, idx) => {
  const ACC = new Set(['122,184,240', '7,24,39'])
  const out = new Set()
  const props = ['color','backgroundColor','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','outlineColor','boxShadow','backgroundImage','fill','stroke','textDecorationColor','caretColor']
  const roots = rootSel === 'body' ? [document.body] : [document.querySelectorAll(rootSel)[idx]].filter(Boolean)
  const els = roots.flatMap(r => [r, ...r.querySelectorAll('*')])
  for (const el of els) {
    const cs = getComputedStyle(el)
    for (const prop of props) {
      const v = cs[prop]; if (!v || v === 'none') continue
      for (const m of v.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/g)) {
        if (m[4] !== undefined && +m[4] === 0) continue
        if (ACC.has(`${m[1]},${m[2]},${m[3]}`)) continue
        const [r,g,b] = [+m[1]/255,+m[2]/255,+m[3]/255]
        const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx-mn
        if (!d) continue
        const l = (mx+mn)/2, s = d/(1-Math.abs(2*l-1))
        let h = mx===r ? ((g-b)/d)%6 : mx===g ? (b-r)/d+2 : (r-g)/d+4
        h = (h*60+360)%360
        if (h>=200 && h<=220 && l>=0.6) continue
        if (h>=190 && h<=270 && s>0.15) {
          const cn = el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className
          out.add(`${el.tagName.toLowerCase()}.${String(cn).trim().split(/\s+/).join('.')} ${prop} ${m[0]}`)
        }
      }
    }
  }
  return [...out]
}
const load = async r => { await p.goto('http://localhost:5183' + r, { waitUntil: 'domcontentloaded' }); await wait(900) }
const INTER = 'button, a[href], [role=button], select, input, textarea, summary, [tabindex="0"]'

for (const r of routes) {
  await load(r)
  const base = new Set(await p.evaluate(scanFn, 'body', 0))
  console.log(`\n== ${r}  baseline hits: ${base.size}`)
  const n = await p.evaluate(sel => document.querySelectorAll(sel).length, INTER)
  const seen = new Set()
  // hover + focus pass
  for (let i = 0; i < Math.min(n, 120); i++) {
    const handles = await p.$$(INTER); const h = handles[i]; if (!h) break
    const vis = await h.evaluate(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 })
    if (!vis) continue
    try { await h.hover() } catch { continue }
    await wait(120)
    const hits = await p.evaluate(scanFn, INTER, i)
    const label = await h.evaluate(e => (e.textContent || e.getAttribute('aria-label') || e.placeholder || '').trim().slice(0, 30))
    for (const x of hits) if (!seen.has(x) && !base.has(x)) { seen.add(x); console.log(`  HOVER [${label}] ${x}`) }
    if (/input|textarea|select/i.test(await h.evaluate(e => e.tagName))) {
      try { await h.focus(); await wait(80) } catch {}
      const f = await p.evaluate(scanFn, INTER, i)
      for (const x of f) if (!seen.has(x) && !base.has(x)) { seen.add(x); console.log(`  FOCUS [${label}] ${x}`) }
    }
  }
  // click-each-button pass: discover modals / hidden forms
  const tag = r.replace(/^\//, '').replace(/[\/]/g, '_') || 'root'
  const shotted = new Set()
  for (let i = 0; i < Math.min(n, 60); i++) {
    await load(r)
    const handles = await p.$$('button, [role=button], summary'); const h = handles[i]; if (!h) break
    const info = await h.evaluate(e => { const b = e.getBoundingClientRect(); return { vis: b.width>0&&b.height>0, dis: e.disabled, t: (e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,40) } })
    if (!info.vis || info.dis || SKIP.test(info.t)) continue
    const before = await p.evaluate(() => document.body.innerText.length + '|' + document.querySelectorAll('*').length)
    try { await h.click() } catch { continue }
    await wait(500)
    const after = await p.evaluate(() => document.body.innerText.length + '|' + document.querySelectorAll('*').length)
    if (before === after) continue
    const hits = (await p.evaluate(scanFn, 'body', 0)).filter(x => !base.has(x) && !seen.has(x))
    const isModal = await p.evaluate(() => !!document.querySelector('.modal, .modal-overlay, [role=dialog], .mobile-modal'))
    const key = info.t + (isModal ? '#m' : '')
    if (!shotted.has(key)) {
      shotted.add(key)
      const f = `${OUT}/${mode}-${tag}-${i}-${info.t.replace(/[^a-z0-9]+/gi,'_').slice(0,20)}.png`
      await p.screenshot({ path: f, fullPage: false })
      console.log(`  CLICK [${info.t}] ${isModal ? 'MODAL' : 'changed'} -> ${f.split('/').pop()}`)
    }
    for (const x of hits) { seen.add(x); console.log(`    HIT after click [${info.t}] ${x}`) }
  }
}
await b.close()
