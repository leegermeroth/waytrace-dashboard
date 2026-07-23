import type { Options } from 'qr-code-styling'

/**
 * The one shared definition of a Waytrace QR code's look. QrDialog (the
 * per-row preview/download dialog) and the bulk zip exporter (qr-export.ts)
 * both build their qr-code-styling options here, so a bulk-exported QR is
 * pixel-identical in styling to what the dialog shows — same colors, pattern,
 * corners, center logo, and error-correction choice.
 */

export type DotStyle = 'square' | 'rounded' | 'dots' | 'classy' | 'extra-rounded'
export type CornerStyle = 'square' | 'rounded' | 'dots'

/**
 * Persisted QR style prefs live in localStorage (per-browser, never uploaded to
 * our servers). This lets a customization — including the center logo — carry
 * across every QR code the user generates on this browser, without any
 * server-side storage. Keyed alongside the existing `waytrace_auth` entry.
 */
export const QR_STYLE_STORAGE_KEY = 'waytrace_qr_style'
export const LOGO_MAX_BYTES = 1024 * 1024 // 1 MB — keeps the base64 blob well under the ~5 MB localStorage cap

export interface SavedStyle {
  fgColor: string
  bgColor: string
  dotStyle: DotStyle
  cornerStyle: CornerStyle
  logo: string | null
  size: number
}

export const DEFAULT_STYLE: SavedStyle = {
  fgColor: '#2C2820', // graphite, not pure black
  bgColor: '#FFFFFF',
  dotStyle: 'square',
  cornerStyle: 'square',
  logo: null,
  size: 512,
}

// PNG export resolution bounds. 320 keeps the old default reachable; 2048 is
// ample for print (e.g. ~6.8" at 300 DPI). SVG ignores this — it's vector.
export const SIZE_MIN = 256
export const SIZE_MAX = 2048
export const SIZE_STEP = 64

export function loadSavedStyle(): SavedStyle {
  try {
    const raw = localStorage.getItem(QR_STYLE_STORAGE_KEY)
    if (!raw) return DEFAULT_STYLE
    return { ...DEFAULT_STYLE, ...(JSON.parse(raw) as Partial<SavedStyle>) }
  } catch {
    return DEFAULT_STYLE
  }
}

/** qr-code-styling options for a URL in a given style — the canonical recipe. */
export function buildQrOptions(url: string, style: SavedStyle): Options {
  const { fgColor, bgColor, dotStyle, cornerStyle, logo, size } = style
  const cornersSquareType: 'square' | 'extra-rounded' | 'dot' =
    cornerStyle === 'rounded' ? 'extra-rounded' : cornerStyle === 'dots' ? 'dot' : 'square'
  const cornersDotType: 'square' | 'dot' = cornerStyle === 'square' ? 'square' : 'dot'

  return {
    width: size,
    height: size,
    type: 'canvas',
    data: url,
    image: logo ?? undefined,
    // Quiet zone + logo padding scale with the export size (both are px).
    margin: Math.round(8 * (size / 320)),
    // A center logo obscures part of the code, so bump error correction to H
    // (30%) whenever a logo is present; otherwise M keeps the code less dense.
    qrOptions: { errorCorrectionLevel: logo ? 'H' : 'M' },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: 0.35,
      margin: Math.round(6 * (size / 320)),
      crossOrigin: 'anonymous',
    },
    dotsOptions: { color: fgColor, type: dotStyle },
    backgroundOptions: { color: bgColor },
    cornersSquareOptions: { color: fgColor, type: cornersSquareType },
    cornersDotOptions: { color: fgColor, type: cornersDotType },
  }
}
