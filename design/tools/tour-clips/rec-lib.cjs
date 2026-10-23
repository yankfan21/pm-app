const { chromium } = require('playwright-core')
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
  const lib = {
    b, ctx, p, t0,
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
      await p.evaluate(()=>{const d=document.createElement('div');d.style.cssText='position:fixed;inset:0;background:#ff00ff;z-index:2147483646';document.documentElement.appendChild(d);setTimeout(()=>d.remove(),350)})
      await p.waitForTimeout(500)
    },
    async close() { const v = p.video(); await ctx.close(); const path = await v.path(); await b.close(); return path }
  }
  return lib
}
