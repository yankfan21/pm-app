// Run with: node --test src/branding
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  contrast,
  composite,
  deriveBrand,
  hexToHsl,
  hslToHex,
  isValidHex,
  MIN_CONTRAST,
  SURFACES,
} from './color.js'

test('contrast matches known WCAG values', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21)
  assert.ok(Math.abs(contrast('#767676', '#ffffff') - 4.54) < 0.02)
  assert.equal(contrast('#336699', '#336699'), 1)
})

test('hex validation rejects anything that is not exactly #rrggbb', () => {
  for (const bad of ['red', '#fff', '#12345g', '#1234567', 'url(x)', '#fff;}', '', null, undefined, 12])
    assert.equal(isValidHex(bad), false, String(bad))
  assert.equal(isValidHex('#0f766e'), true)
  assert.equal(isValidHex('#0F766E'), true)
})

test('hsl round trip is stable to within one level per channel', () => {
  for (const hex of ['#0f766e', '#b45309', '#8a2be2', '#ffd400', '#808080']) {
    const back = hslToHex(hexToHsl(hex))
    for (let i = 1; i < 7; i += 2)
      assert.ok(Math.abs(parseInt(hex.slice(i, i + 2), 16) - parseInt(back.slice(i, i + 2), 16)) <= 2, hex)
  }
})

test('missing or invalid colours produce no tokens (theme defaults apply)', () => {
  assert.deepEqual(deriveBrand({}).tokens, {})
  assert.deepEqual(deriveBrand({ accent: 'teal', rail: '#12' }).tokens, {})
})

test('a brand colour that already passes is left alone', () => {
  // #0e716a is Paper's default accent text (theme-paper.css).
  const { tokens, report } = deriveBrand({ accent: '#0e716a' })
  assert.equal(tokens['--brand-accent'], '#0e716a')
  assert.equal(tokens['--brand-accent-strong'], '#0e716a')
  assert.equal(tokens['--brand-on-accent'], '#ffffff')
  assert.equal(report.find((r) => r.role === 'Accent text').adjusted, false)
})

test('the original Paper teal was just under the floor on its own tint', () => {
  // Regression note: #0f766e measured 4.34:1 on a 10% tint of itself, so the
  // derivation nudges it to #0e716a. Paper's default now uses the nudged value.
  const { tokens, report } = deriveBrand({ accent: '#0f766e' })
  assert.equal(tokens['--brand-accent'], '#0e716a')
  assert.equal(report.find((r) => r.role === 'Accent text').adjusted, true)
})

test('a pale yellow accent is darkened for text and gets dark button text', () => {
  const { tokens, report } = deriveBrand({ accent: '#ffd400' })
  assert.equal(tokens['--brand-on-accent'], SURFACES.ink)
  assert.equal(tokens['--brand-accent-strong'], '#ffd400') // fill stays the brand colour
  assert.ok(contrast(tokens['--brand-accent'], SURFACES.paper) >= MIN_CONTRAST)
  assert.equal(report.find((r) => r.role === 'Accent text').adjusted, true)
})

test('a too-light rail colour is darkened until rail text is readable', () => {
  const { tokens } = deriveBrand({ rail: '#cfd8e3' })
  const bg = tokens['--brand-rail-bg']
  assert.ok(contrast(bg, SURFACES.railText) >= MIN_CONTRAST)
  assert.ok(contrast(bg, SURFACES.railMuted) >= MIN_CONTRAST)
})

test('every derived token meets the contrast floor for any colour (property test)', () => {
  let seed = 123456789
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const randomHex = () =>
    '#' + [0, 0, 0].map(() => Math.floor(rand() * 256).toString(16).padStart(2, '0')).join('')
  const edge = ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#fffdfa', '#161b26']
  const samples = [...edge, ...Array.from({ length: 3000 }, randomHex)]

  for (const accent of samples) {
    const rail = samples[Math.floor(rand() * samples.length)]
    const { tokens: t } = deriveBrand({ accent, rail })
    const railBg = t['--brand-rail-bg']
    const ctx = `accent ${accent} rail ${rail}`

    assert.ok(contrast(railBg, SURFACES.railText) >= MIN_CONTRAST, `rail text ${ctx}`)
    assert.ok(contrast(railBg, SURFACES.railMuted) >= MIN_CONTRAST, `rail muted ${ctx}`)
    assert.ok(contrast(t['--brand-accent-strong'], t['--brand-on-accent']) >= MIN_CONTRAST, `button ${ctx}`)
    const text = t['--brand-accent']
    assert.ok(contrast(text, SURFACES.paper) >= MIN_CONTRAST, `text/paper ${ctx}`)
    assert.ok(contrast(text, SURFACES.card) >= MIN_CONTRAST, `text/card ${ctx}`)
    assert.ok(contrast(text, composite(text, 0.1, SURFACES.paper)) >= MIN_CONTRAST, `text/tint ${ctx}`)
    const ra = t['--brand-rail-accent']
    assert.ok(contrast(ra, railBg) >= MIN_CONTRAST, `rail accent ${ctx}`)
    assert.ok(contrast(ra, composite(ra, 0.14, railBg)) >= MIN_CONTRAST, `rail accent/tint ${ctx}`)
  }
})
