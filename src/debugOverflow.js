// DEBUGOVERFLOW: temporary on-device overflow inspector for the mobile
// right-edge-cutoff investigation. Inert unless the page URL has
// ?debugoverflow=1 — zero cost otherwise. Safe to delete this whole file
// plus the two-line import/call in main.jsx once the bug is fixed; every
// line touched for this is tagged DEBUGOVERFLOW so a grep finds it all.
const PANEL_ID = '__debugOverflowPanel'
const DIFF_THRESHOLD = 4 // px - filters out Safari's normal sub-pixel rounding noise

function describe(el) {
  const id = el.id ? `#${el.id}` : ''
  const cls =
    typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).join('.')
      : ''
  const parent = el.parentElement
  const parentDesc = parent
    ? parent.tagName.toLowerCase() +
      (parent.className && typeof parent.className === 'string'
        ? '.' + parent.className.trim().split(/\s+/).filter(Boolean).join('.')
        : '')
    : ''
  return { self: `${el.tagName.toLowerCase()}${id}${cls}`, parent: parentDesc }
}

function scan(panel) {
  const results = []
  document.querySelectorAll('body *').forEach((el) => {
    if (panel.contains(el) || el === panel) return
    const diff = el.scrollWidth - el.clientWidth
    if (diff > DIFF_THRESHOLD) {
      results.push({ el, diff })
      el.style.outline = '2px solid red'
      el.style.outlineOffset = '-1px'
    } else if (el.style.outline === '2px solid red') {
      el.style.outline = ''
      el.style.outlineOffset = ''
    }
  })
  results.sort((a, b) => b.diff - a.diff)

  const header = `${location.pathname}${location.search}  —  viewport ${window.innerWidth}x${window.innerHeight}  —  body.scrollWidth=${document.body.scrollWidth} body.clientWidth=${document.body.clientWidth}`
  const rows = results
    .slice(0, 40)
    .map(({ el, diff }) => {
      const { self, parent } = describe(el)
      return `+${diff}px  ${self}  (in ${parent})`
    })
    .join('\n')

  panel.querySelector('.doPanelBody').textContent =
    `${header}\n\n${results.length} overflowing element(s):\n${rows || '(none)'}`
}

export function initDebugOverflow() {
  if (new URLSearchParams(window.location.search).get('debugoverflow') !== '1') return
  if (document.getElementById(PANEL_ID)) return

  const panel = document.createElement('div')
  panel.id = PANEL_ID
  panel.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;max-height:45vh;overflow:auto;' +
    'background:rgba(0,0,0,0.92);color:#7CFC00;font:11px/1.4 monospace;' +
    'padding:8px;z-index:2147483647;white-space:pre-wrap;border-top:3px solid red;' +
    'box-sizing:border-box;'

  const bar = document.createElement('div')
  bar.style.cssText = 'display:flex;gap:8px;margin-bottom:6px;'
  const rescanBtn = document.createElement('button')
  rescanBtn.textContent = 'Rescan'
  const closeBtn = document.createElement('button')
  closeBtn.textContent = 'Close'
  ;[rescanBtn, closeBtn].forEach((b) => {
    b.style.cssText = 'font:11px monospace;padding:2px 8px;'
  })
  rescanBtn.onclick = () => scan(panel)
  closeBtn.onclick = () => panel.remove()
  bar.append(rescanBtn, closeBtn)

  const body = document.createElement('div')
  body.className = 'doPanelBody'

  panel.append(bar, body)
  document.body.appendChild(panel)

  scan(panel)

  let debounceTimer
  const rescanDebounced = () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => scan(panel), 400)
  }
  window.addEventListener('resize', rescanDebounced)
  window.addEventListener('orientationchange', rescanDebounced)
  new MutationObserver(rescanDebounced).observe(document.body, {
    childList: true,
    subtree: true,
  })
  // SPA route changes don't reload the page - rescan on tab/nav clicks too.
  document.addEventListener('click', rescanDebounced, true)
}
