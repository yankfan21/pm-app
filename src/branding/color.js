// Brand colour handling for white-labelling: parse a customer's hex colours and
// derive the app's accent tokens from them, adjusting any that would be
// unreadable. The guarantee lives here, in one place: whatever colours are
// stored for an organisation, every token this returns meets the contrast
// floor on the surface it is drawn on. Pure functions, no DOM, no dependencies.

// Surfaces the derived tokens are drawn on (see src/theme-paper.css).
export const SURFACES = {
  paper: '#f6f3ee',
  card: '#fffdfa',
  ink: '#161b26',
  white: '#ffffff',
  defaultRail: '#1c2330',
  // Text colours used inside the rail; the rail background must stay dark
  // enough for both.
  railText: '#aeb7c6',
  railMuted: '#939cad',
}

// WCAG AA for normal-size text.
export const MIN_CONTRAST = 4.5

const HEX = /^#[0-9a-fA-F]{6}$/

export function isValidHex(value) {
  return typeof value === 'string' && HEX.test(value)
}

export function parseHex(hex) {
  if (!isValidHex(hex)) return null
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

const byte = (n) => Math.max(0, Math.min(255, Math.round(n)))

export function toHex({ r, g, b }) {
  return '#' + [r, g, b].map((n) => byte(n).toString(16).padStart(2, '0')).join('')
}

function channel(v) {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function luminance(rgb) {
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

export function contrast(a, b) {
  const la = luminance(typeof a === 'string' ? parseHex(a) : a)
  const lb = luminance(typeof b === 'string' ? parseHex(b) : b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// `fg` drawn at `alpha` over `bg`.
export function composite(fg, alpha, bg) {
  const f = parseHex(fg)
  const b = parseHex(bg)
  return toHex({
    r: f.r * alpha + b.r * (1 - alpha),
    g: f.g * alpha + b.g * (1 - alpha),
    b: f.b * alpha + b.b * (1 - alpha),
  })
}

export function hexToHsl(hex) {
  const { r, g, b } = parseHex(hex)
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l: l * 100 }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 }
}

export function hslToHex({ h, s, l }) {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return toHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 })
}

// Move `hex` lighter or darker in 1% HSL-lightness steps, keeping hue and
// saturation, until `ok(candidate)` holds. Returns the first passing colour, or
// null if even the extreme (pure black or white) does not pass.
function shiftUntil(hex, direction, ok) {
  if (ok(hex)) return hex
  const { h, s, l } = hexToHsl(hex)
  for (let step = 1; step <= 100; step++) {
    const nl = direction === 'darker' ? l - step : l + step
    if (nl < 0 || nl > 100) break
    const candidate = hslToHex({ h, s, l: nl })
    if (ok(candidate)) return candidate
  }
  const extreme = direction === 'darker' ? '#000000' : '#ffffff'
  return ok(extreme) ? extreme : null
}

const rgba = (hex, a) => {
  const { r, g, b } = parseHex(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// Derive the brand tokens for a customer's accent and (optional) rail colour.
// Either may be null/invalid, in which case its tokens are simply left out and
// the theme's defaults apply.
//
// Returns { tokens, report }:
//   tokens - CSS custom properties to set on <html>, all contrast-safe
//   report - one entry per role {role, input, output, ratio, against, adjusted}
//            so a settings screen can show what changed and why
export function deriveBrand({ accent, rail } = {}) {
  const tokens = {}
  const report = []

  const note = (role, input, output, against, surface) =>
    report.push({
      role,
      input,
      output,
      against,
      ratio: Math.round(contrast(output, surface) * 100) / 100,
      adjusted: input.toLowerCase() !== output.toLowerCase(),
    })

  // Rail: a dark surface carrying light text, so it must stay dark enough for
  // the muted rail text as well as the main rail text.
  let railBg = SURFACES.defaultRail
  if (isValidHex(rail)) {
    const darkEnough = (c) =>
      contrast(c, SURFACES.railText) >= MIN_CONTRAST &&
      contrast(c, SURFACES.railMuted) >= MIN_CONTRAST
    railBg = shiftUntil(rail, 'darker', darkEnough) ?? '#000000'
    tokens['--brand-rail-bg'] = railBg
    note('Rail background', rail, railBg, 'rail text', SURFACES.railMuted)
  }

  if (isValidHex(accent)) {
    // Button fill: the brand colour itself, with whichever of white/ink text
    // reads better on it; nudged only if neither reaches the floor.
    let on = contrast(accent, SURFACES.white) >= contrast(accent, SURFACES.ink)
      ? SURFACES.white
      : SURFACES.ink
    const fill =
      shiftUntil(accent, on === SURFACES.white ? 'darker' : 'lighter', (c) => contrast(c, on) >= MIN_CONTRAST) ??
      accent
    if (contrast(fill, on) < MIN_CONTRAST) on = contrast(fill, SURFACES.white) >= contrast(fill, SURFACES.ink) ? SURFACES.white : SURFACES.ink
    tokens['--brand-accent-strong'] = fill
    tokens['--brand-on-accent'] = on
    note('Button fill', accent, fill, on === SURFACES.white ? 'white text' : 'dark text', on)

    // Hover: a step toward more contrast with the button text.
    const { h, s, l } = hexToHsl(fill)
    const hover = hslToHex({ h, s, l: on === SURFACES.white ? Math.max(0, l - 6) : Math.min(100, l + 6) })
    tokens['--brand-accent-hover'] = hover

    // Accent text and icons on paper, cards and the tinted selected state.
    const tintedOnPaper = (c) => composite(c, 0.1, SURFACES.paper)
    const textOk = (c) =>
      contrast(c, SURFACES.paper) >= MIN_CONTRAST &&
      contrast(c, SURFACES.card) >= MIN_CONTRAST &&
      contrast(c, tintedOnPaper(c)) >= MIN_CONTRAST
    const text = shiftUntil(accent, 'darker', textOk) ?? SURFACES.ink
    tokens['--brand-accent'] = text
    tokens['--brand-accent-bg'] = rgba(text, 0.1)
    tokens['--brand-accent-border'] = rgba(text, 0.35)
    note('Accent text', accent, text, 'paper background', SURFACES.paper)

    // Accent on the dark rail (active nav item, links in the rail).
    const rb = railBg
    const railOk = (c) =>
      contrast(c, rb) >= MIN_CONTRAST && contrast(c, composite(c, 0.14, rb)) >= MIN_CONTRAST
    const railAccent = shiftUntil(accent, 'lighter', railOk) ?? SURFACES.white
    tokens['--brand-rail-accent'] = railAccent
    tokens['--brand-rail-accent-bg'] = rgba(railAccent, 0.14)
    tokens['--brand-rail-accent-border'] = rgba(railAccent, 0.4)
    note('Accent on rail', accent, railAccent, 'rail background', rb)
  }

  return { tokens, report }
}
