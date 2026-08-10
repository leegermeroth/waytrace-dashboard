import assert from 'node:assert/strict'
import test from 'node:test'

import {
  checkScannability,
  contrastRatio,
  luminance,
  CONTRAST_CRITICAL,
  CONTRAST_WARN,
  MIN_PRINT_SIZE,
} from '../src/lib/qr-scannability.ts'

/**
 * Session 16 (#27) — QR scannability guard. These pin the pure contrast/coverage/
 * resolution decisions the dialog warns on, and act as the automated stand-in for
 * "decode" reliability: a code the guard passes is within the bounds a scanner
 * needs (a live render+decode is verified in the browser during release).
 */

test('luminance: black is 0, white is 1', () => {
  assert.equal(luminance('#000000'), 0)
  assert.equal(luminance('#ffffff'), 1)
})

test('contrastRatio: black on white is the maximum 21:1', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21)
})

test('a strong dark-on-light QR at print size has no warnings', () => {
  const warnings = checkScannability({ fgColor: '#2C2820', bgColor: '#FFFFFF', size: 512 })
  assert.deepEqual(warnings, [])
})

test('very low contrast is flagged critical', () => {
  const warnings = checkScannability({ fgColor: '#777777', bgColor: '#808080', size: 1024 })
  const contrast = warnings.find((w) => w.code === 'contrast')
  assert.ok(contrast)
  assert.equal(contrast.level, 'critical')
  assert.ok(contrastRatio('#777777', '#808080') < CONTRAST_CRITICAL)
})

test('middling contrast is flagged as a non-critical warning', () => {
  // Pick a pair between the critical and warn thresholds.
  const fg = '#999999'
  const bg = '#ffffff'
  const ratio = contrastRatio(fg, bg)
  assert.ok(ratio >= CONTRAST_CRITICAL && ratio < CONTRAST_WARN, `ratio ${ratio}`)
  const warnings = checkScannability({ fgColor: fg, bgColor: bg, size: 1024 })
  const contrast = warnings.find((w) => w.code === 'contrast')
  assert.ok(contrast)
  assert.equal(contrast.level, 'warn')
})

test('inverted (light-on-dark) is warned when contrast itself passes', () => {
  const warnings = checkScannability({ fgColor: '#FFFFFF', bgColor: '#000000', size: 1024 })
  assert.ok(warnings.some((w) => w.code === 'inverted'))
  // But a failing-contrast inverted pair reports contrast, not a redundant inversion note.
  const lowInv = checkScannability({ fgColor: '#bbbbbb', bgColor: '#999999', size: 1024 })
  assert.ok(!lowInv.some((w) => w.code === 'inverted'))
})

test('below the print floor, resolution is warned', () => {
  const warnings = checkScannability({ fgColor: '#000', bgColor: '#fff', size: MIN_PRINT_SIZE - 64 })
  assert.ok(warnings.some((w) => w.code === 'resolution'))
  const ok = checkScannability({ fgColor: '#000', bgColor: '#fff', size: MIN_PRINT_SIZE })
  assert.ok(!ok.some((w) => w.code === 'resolution'))
})

test('a large center logo is warned; a modest one is not', () => {
  const big = checkScannability({ fgColor: '#000', bgColor: '#fff', size: 1024, hasLogo: true, logoCoverage: 0.5 })
  assert.ok(big.some((w) => w.code === 'logo'))
  const small = checkScannability({ fgColor: '#000', bgColor: '#fff', size: 1024, hasLogo: true, logoCoverage: 0.2 })
  assert.ok(!small.some((w) => w.code === 'logo'))
})

test('transparent background is warned about its quiet zone', () => {
  const warnings = checkScannability({ fgColor: '#000', bgColor: '#fff', size: 1024, transparentBg: true })
  assert.ok(warnings.some((w) => w.code === 'transparent'))
})

test('critical warnings sort ahead of non-critical ones', () => {
  const warnings = checkScannability({ fgColor: '#777777', bgColor: '#808080', size: 128 })
  assert.ok(warnings.length >= 2)
  assert.equal(warnings[0].level, 'critical')
})
