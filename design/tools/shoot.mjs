// Usage (repo root, preview on :5183): node design/tools/shoot.mjs <outDir> <route...>
// Phone screenshots (390x844 @2x, full page) plus a navy/blue computed-colour scan per route.
import { createRequire } from 'node:module'; const puppeteer = createRequire(process.cwd() + '/')('puppeteer')
const OUT = process.argv[2]
const routes = process.argv.slice(3)
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await b.newPage()
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
for (const r of routes) {
  await p.goto('http://localhost:5183' + r, { waitUntil: 'networkidle0' })
  await new Promise(x => setTimeout(x, 800))
  const name = r.replace(/^\/m\//, '').replace(/[\/]/g, '_')
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  const hits = await p.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      for (const prop of ['color','backgroundColor','borderTopColor','borderBottomColor','fill','stroke']) {
        const m = cs[prop].match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/)
        if (!m || (m[4] !== undefined && +m[4] === 0)) continue
        const [r,g,b] = [+m[1]/255,+m[2]/255,+m[3]/255]
        const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx-mn
        if (!d) continue
        const l = (mx+mn)/2, s = d/(1-Math.abs(2*l-1))
        let h = mx===r ? ((g-b)/d)%6 : mx===g ? (b-r)/d+2 : (r-g)/d+4
        h = (h*60+360)%360
        if (/^rgba?\((122, 184, 240|7, 24, 39)[,)]/.test(cs[prop])) continue
        if (h>=190 && h<=270 && s>0.15) out.push(`${el.tagName}.${(el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className)||''} ${prop} ${cs[prop]}`)
      }
    }
    return [...new Set(out)]
  })
  console.log(r, '→', hits.length ? '\n  ' + hits.join('\n  ') : 'clean')
}
await b.close()
