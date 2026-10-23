const { chromium } = require('playwright-core')
const fs = require('fs'), path = require('path')
// Clips are stretched by SLOW in cut.py; callout times are scaled the same way.
const SLOW = 1.1, CUT_LEAD = 0.25
const CURSOR = `
(()=>{const mk=()=>{if(document.getElementById('__cur'))return;
const c=document.createElement('div');c.id='__cur';c.style.cssText='position:fixed;left:-50px;top:-50px;width:22px;height:30px;pointer-events:none;z-index:2147483647;transform-origin:2px 2px;transition:transform .12s ease;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))';
c.innerHTML='<svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg"><path d="M2 2 L2 24 L7.5 18.8 L11.6 28 L15.4 26.3 L11.4 17.4 L19 17.4 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
document.documentElement.appendChild(c);
addEventListener('mousemove',e=>{c.style.left=e.clientX+'px';c.style.top=e.clientY+'px'},true);
addEventListener('mousedown',()=>{c.style.transform='scale(.85)'},true);
addEventListener('mouseup',()=>{c.style.transform='scale(1)'},true)};
if(document.readyState!=='loading')mk();else addEventListener('DOMContentLoaded',mk);
new MutationObserver(mk).observe(document,{childList:true})})()`
exports.open = async (dir, w=1100, h=733) => {
  const b = await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']})
  const ctx = await b.newContext({viewport:{width:w,height:h},recordVideo:{dir,size:{width:w,height:h}}})
  const t0 = Date.now()
  const p = await ctx.newPage()
  await p.addInitScript(()=>localStorage.setItem('cpm_welcome_tour_seen','1'))
  await p.addInitScript(CURSOR)
  const notes = []
  let flashEnd = null
  const lib = {
    b, ctx, p, t0, notes,
    now: () => (Date.now()-t0)/1000,
    wait: ms => p.waitForTimeout(ms),
    // glide the cursor to the centre of an element, then click it
    async go(sel, {click=true, steps=45, pause=250}={}) {
      const el = typeof sel==='string' ? p.locator(sel).first() : sel
      await el.scrollIntoViewIfNeeded()
      const bb = await el.boundingBox()
      await p.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2, {steps})
      await p.waitForTimeout(pause)
      if (click) { await p.mouse.down(); await p.waitForTimeout(90); await p.mouse.up() }
    },
    // full-screen magenta flash: marks the clip start/end so the cut is exact
    async flash() {
      await p.evaluate(()=>{const d=document.createElement('div');d.style.cssText='position:fixed;inset:0;background:#ff00ff;z-index:2147483646';document.documentElement.appendChild(d);setTimeout(()=>{d.remove();window.__flashEnd=window.__flashEnd||performance.now()},350)})
      await p.waitForTimeout(500)
      if (flashEnd === null) flashEnd = await p.evaluate(()=>window.__flashEnd)
    },
    // A callout bubble: pointing at `target` (selector or locator) from `anchor`
    // (top|bottom|left|right|center of it), shown for `hold` seconds from now.
    async note({ target, anchor = 'bottom', text, place = 'below', align = 'center', hold = 2.4 }) {
      const el = typeof target === 'string' ? p.locator(target).first() : target
      const bb = await el.boundingBox()
      const ps = await p.evaluate(() => performance.now()) / 1000
      const pt = {
        top: [bb.x + bb.width / 2, bb.y], bottom: [bb.x + bb.width / 2, bb.y + bb.height],
        left: [bb.x, bb.y + bb.height / 2], right: [bb.x + bb.width, bb.y + bb.height / 2],
        center: [bb.x + bb.width / 2, bb.y + bb.height / 2],
      }[anchor]
      notes.push({ ps, hold, x: +(pt[0] / w * 100).toFixed(1), y: +(pt[1] / h * 100).toFixed(1), place, align, text })
    },
    // Show a bubble while the cursor glides to `sel` and rests there for the
    // rest of `hold`, then click (unless click:false). The clip waits on the
    // bubble, so what it points at is what is on screen.
    async step(opts, sel, { click = true, steps = 30 } = {}) {
      await lib.note({ ...opts, target: opts.target || sel })
      await lib.go(sel, { click: false, steps, pause: 100 })
      await p.waitForTimeout(Math.max(300, opts.hold * 1000 - 700))
      if (click) { await p.mouse.down(); await p.waitForTimeout(90); await p.mouse.up() }
    },
    // clip-relative, stretched times, written next to the clip's video
    saveNotes(name) {
      const dir = process.env.TOUR_DIR || path.join(__dirname, '..', '..', '..', 'src', 'assets', 'tour')
      const out = notes.map(n => {
        const at = (n.ps - flashEnd / 1000 - CUT_LEAD) * SLOW
        return { at: +Math.max(0, at).toFixed(2), until: +(Math.max(0, at) + n.hold * SLOW).toFixed(2), x: n.x, y: n.y, place: n.place, align: n.align, text: n.text }
      })
      fs.writeFileSync(path.join(dir, name + '.callouts.json'), JSON.stringify(out, null, 2) + '\n')
    },
    async close() { const v = p.video(); await ctx.close(); const path = await v.path(); await b.close(); return path }
  }
  return lib
}
