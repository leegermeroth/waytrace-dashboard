import JSZip from 'jszip'
import QRCodeStyling from 'qr-code-styling'
import { buildQrOptions, loadSavedStyle } from '@/lib/qr-style'

/**
 * Bulk QR export: one styled PNG per asset, zipped client-side. No server
 * work — the QRs are rendered in the browser exactly like QrDialog's
 * (same saved style from localStorage, incl. the center logo) and zipped
 * with JSZip.
 *
 * This module is imported ONLY via dynamic `import()` (see QrExportButton),
 * so JSZip lives in its own lazy chunk and the main bundle doesn't grow.
 *
 * Format decision (Session 6): PNG-only. One file per asset keeps the zip's
 * contract obvious (count = asset count) and PNG is what packaging printers
 * accept universally; per-asset SVG (vector) remains a click away in the
 * per-row QR dialog for the print shop that wants it.
 *
 * Resolution decision: max(saved dialog size, 1024 px). The dialog's slider
 * default (512) is a screen-preview size — silently shipping 200 sub-print
 * PNGs to a print vendor would be a trap, so exports floor at 1024 px
 * (~3.4" at 300 DPI, ample for on-pack QRs). A user who deliberately set the
 * slider higher (up to 2048) gets their choice.
 */
export const EXPORT_MIN_SIZE = 1024

export interface QrExportItem {
  /** The URL the QR encodes — callers pass the ?qr=1 scan URL. */
  url: string
  /** Preferred filename (SKU / person slug) — sanitized here, may be messy. */
  name: string
}

/**
 * Make a SKU/slug safe as a zip entry name: SKUs can contain '/', '.', spaces,
 * and anything else a merchandiser typed. Strips path separators and the
 * Windows-reserved set, collapses whitespace runs to '-', and trims dots and
 * dashes from the ends (a trailing dot breaks Windows extraction).
 */
export function sanitizeQrFilename(raw: string): string {
  let out = ''
  for (const ch of raw) {
    // Path separators, Windows-reserved characters, and control chars -> '-'
    out += ch < ' ' || '\\/:*?"<>|'.includes(ch) ? '-' : ch
  }
  return out
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)
}

/** Render one QR to a PNG blob at the given style (headless — no DOM append). */
async function renderPng(url: string, style: ReturnType<typeof loadSavedStyle>): Promise<Blob> {
  const qr = new QRCodeStyling(buildQrOptions(url, style))
  const data = await qr.getRawData('png')
  if (!(data instanceof Blob)) throw new Error('QR rendering produced no image')
  return data
}

/**
 * Build the zip and hand it to the browser as a download. Sequential on
 * purpose: each asset's canvas render is the heavy step, and awaiting one at a
 * time (plus an explicit macrotask yield) keeps a 200-asset collection from
 * freezing the tab while onProgress drives the button's "n/total" label.
 */
export async function exportQrZip(
  items: QrExportItem[],
  zipFilename: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ count: number; size: number }> {
  const saved = loadSavedStyle()
  const style = { ...saved, size: Math.max(saved.size, EXPORT_MIN_SIZE) }

  const zip = new JSZip()
  const usedNames = new Set<string>()

  for (let i = 0; i < items.length; i++) {
    onProgress?.(i, items.length)
    const item = items[i]
    const blob = await renderPng(item.url, style)

    // Sanitized names can collide ("A/B" and "A B" both become "A-B") — suffix
    // duplicates so no file silently overwrites another inside the zip.
    const base = sanitizeQrFilename(item.name) || `qr-${i + 1}`
    let name = base
    for (let n = 2; usedNames.has(name.toLowerCase()); n++) name = `${base}-${n}`
    usedNames.add(name.toLowerCase())

    zip.file(`${name}.png`, blob)
    // Yield a macrotask so the UI (progress label, spinner) can paint.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  onProgress?.(items.length, items.length)
  const blob = await zip.generateAsync({ type: 'blob' })

  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = zipFilename
  a.click()
  URL.revokeObjectURL(a.href)

  return { count: items.length, size: blob.size }
}
