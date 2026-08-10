/**
 * QR scannability guard (#27). Pure, deterministic checks over a QR's style so
 * the dialog can warn — never block — before someone exports a code that looks
 * fine on screen but fails on a cheap printer, at a small size, in glare, or on
 * an older camera. Warnings pair with a one-click "reset to safe defaults" in
 * the UI, so expert users keep full control.
 *
 * The contrast math and thresholds match the Waytrace Pro WordPress plugin
 * (assets/admin.js) so both surfaces speak the same language.
 */

export type ScanLevel = 'warn' | 'critical'

export interface ScanWarning {
  level: ScanLevel
  code: 'contrast' | 'inverted' | 'transparent' | 'logo' | 'resolution'
  message: string
}

/** WCAG relative luminance of a #rrggbb color (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0
  const int = parseInt(m[1], 16)
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const r = channel((int >> 16) & 0xff)
  const g = channel((int >> 8) & 0xff)
  const b = channel(int & 0xff)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colors (1:1 … 21:1). */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

export interface ScanCheckInput {
  fgColor: string
  bgColor: string
  /** PNG export size in px (SVG is vector — pass the nominal size). */
  size: number
  /** True when a center logo is applied. */
  hasLogo?: boolean
  /** Logo's linear side fraction of the QR (qr-code-styling imageSize). */
  logoCoverage?: number
  /** True when the background is exported transparent (no light quiet zone). */
  transparentBg?: boolean
}

// Below this PNG size, on-pack/print QR codes get unreliable. 512 px ≈ 1.7" at
// 300 DPI, a sane floor for a code someone will scan off a package.
export const MIN_PRINT_SIZE = 512
// Contrast thresholds (WCAG ratio), matched to the WordPress plugin.
export const CONTRAST_CRITICAL = 1.5
export const CONTRAST_WARN = 3.0
// A center logo wider than this fraction eats into error correction (ECC H
// recovers ~30% of area) and risks unscannable codes.
export const LOGO_COVERAGE_WARN = 0.35

/**
 * Return the scannability warnings for a style, most severe first. Empty array
 * means the code is within safe bounds. Never throws.
 */
export function checkScannability(input: ScanCheckInput): ScanWarning[] {
  const warnings: ScanWarning[] = []
  const ratio = contrastRatio(input.fgColor, input.bgColor)

  if (ratio < CONTRAST_CRITICAL) {
    warnings.push({
      level: 'critical',
      code: 'contrast',
      message: `Very low contrast (${ratio.toFixed(1)}:1) — this QR code may not scan. Use a dark foreground on a light background.`,
    })
  } else if (ratio < CONTRAST_WARN) {
    warnings.push({
      level: 'warn',
      code: 'contrast',
      message: `Low contrast (${ratio.toFixed(1)}:1) — a darker foreground or lighter background scans more reliably.`,
    })
  }

  // Dark background with a lighter foreground: many scanners only read the
  // conventional dark-on-light. Only worth flagging when contrast itself passed.
  if (ratio >= CONTRAST_CRITICAL && luminance(input.fgColor) > luminance(input.bgColor)) {
    warnings.push({
      level: 'warn',
      code: 'inverted',
      message: 'Inverted colors (light code on a dark background) — some scanners only read dark-on-light. Test before printing.',
    })
  }

  if (input.transparentBg) {
    warnings.push({
      level: 'warn',
      code: 'transparent',
      message: 'Transparent background — the quiet zone depends on whatever it is placed on. Keep a light margin around the code.',
    })
  }

  if (input.hasLogo && (input.logoCoverage ?? 0) > LOGO_COVERAGE_WARN) {
    warnings.push({
      level: 'warn',
      code: 'logo',
      message: 'Large center logo — shrink it so the code keeps enough error-correction margin to scan.',
    })
  }

  if (input.size < MIN_PRINT_SIZE) {
    warnings.push({
      level: 'warn',
      code: 'resolution',
      message: `Low resolution (${input.size} px) — export at ${MIN_PRINT_SIZE} px or larger for print. SVG stays sharp at any size.`,
    })
  }

  // Critical first, then warnings, preserving insertion order within a level.
  return warnings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1))
}
