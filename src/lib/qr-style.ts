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
 * QR style prefs live per-browser and are NEVER uploaded to our servers. As of
 * Session 16 (#26) they are namespaced by account id so one customer's branding
 * can't leak into another's on a shared browser:
 *   - style prefs (colors, pattern, corners, size) → localStorage, key
 *     `waytrace_qr_style:{accountId}`
 *   - the center logo blob → IndexedDB (object store `qr_logos`, key = accountId)
 *     so a ~1 MB base64 image doesn't crowd the shared ~5 MB localStorage cap.
 * Loading is async because the logo comes from IndexedDB.
 */
const STYLE_KEY_PREFIX = 'waytrace_qr_style:'
const LEGACY_GLOBAL_KEY = 'waytrace_qr_style' // pre-#26 un-namespaced key; never read
const LOGO_DB_NAME = 'waytrace_qr'
const LOGO_STORE = 'qr_logos'
export const LOGO_MAX_BYTES = 1024 * 1024 // 1 MB — keeps the base64 blob reasonable

export interface SavedStyle {
  fgColor: string
  bgColor: string
  dotStyle: DotStyle
  cornerStyle: CornerStyle
  logo: string | null
  size: number
}

type StylePrefs = Omit<SavedStyle, 'logo'>

export const DEFAULT_STYLE: SavedStyle = {
  fgColor: '#2C2820', // graphite, not pure black
  bgColor: '#FFFFFF',
  dotStyle: 'square',
  cornerStyle: 'square',
  logo: null,
  size: 512,
}

// PNG export resolution bounds. 256 keeps a small preview reachable; 2048 is
// ample for print (e.g. ~6.8" at 300 DPI). SVG ignores this — it's vector.
export const SIZE_MIN = 256
export const SIZE_MAX = 2048
export const SIZE_STEP = 64

function styleKey(accountId: number): string {
  return `${STYLE_KEY_PREFIX}${accountId}`
}

function prefsOf(style: SavedStyle): StylePrefs {
  const { logo: _logo, ...prefs } = style
  return prefs
}

/** Read the account's style prefs (colors/pattern/corners/size) from localStorage. */
function loadPrefs(accountId: number | null): StylePrefs {
  if (accountId == null) return prefsOf(DEFAULT_STYLE)
  try {
    const raw = localStorage.getItem(styleKey(accountId))
    if (!raw) return prefsOf(DEFAULT_STYLE)
    return { ...prefsOf(DEFAULT_STYLE), ...(JSON.parse(raw) as Partial<StylePrefs>) }
  } catch {
    return prefsOf(DEFAULT_STYLE)
  }
}

function savePrefs(accountId: number | null, prefs: StylePrefs): void {
  if (accountId == null) return
  try {
    localStorage.setItem(styleKey(accountId), JSON.stringify(prefs))
    // Opportunistically drop the pre-#26 shared key so it can never be
    // mis-attributed to whoever is signed in on this browser next.
    localStorage.removeItem(LEGACY_GLOBAL_KEY)
  } catch {
    // Quota exceeded or storage unavailable — non-fatal, just don't persist.
  }
}

// ── IndexedDB logo store (account-scoped) ──────────────────────────────────

function openLogoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(LOGO_DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(LOGO_STORE)) db.createObjectStore(LOGO_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

/** Load the account's stored logo data URL, or null if none / unavailable. */
export async function loadLogo(accountId: number | null): Promise<string | null> {
  if (accountId == null) return null
  try {
    const db = await openLogoDb()
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(LOGO_STORE, 'readonly')
      const req = tx.objectStore(LOGO_STORE).get(accountId)
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

/** Persist (or clear, when logo is null) the account's logo in IndexedDB. */
export async function saveLogo(accountId: number | null, logo: string | null): Promise<void> {
  if (accountId == null) return
  try {
    const db = await openLogoDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LOGO_STORE, 'readwrite')
      const store = tx.objectStore(LOGO_STORE)
      if (logo) store.put(logo, accountId)
      else store.delete(accountId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // IndexedDB unavailable — the logo simply won't persist; non-fatal.
  }
}

/** The account's full saved style (prefs + logo). Async because of the logo. */
export async function loadSavedStyle(accountId: number | null): Promise<SavedStyle> {
  const prefs = loadPrefs(accountId)
  const logo = await loadLogo(accountId)
  return { ...prefs, logo }
}

/** Persist the account's full style: prefs to localStorage, logo to IndexedDB. */
export async function saveSavedStyle(accountId: number | null, style: SavedStyle): Promise<void> {
  savePrefs(accountId, prefsOf(style))
  await saveLogo(accountId, style.logo)
}

/**
 * Persist only the cheap style prefs (colors/pattern/corners/size) to
 * localStorage — used on every control change without touching IndexedDB. The
 * logo is saved separately via saveLogo when it actually changes.
 */
export function persistStylePrefs(accountId: number | null, style: SavedStyle): void {
  savePrefs(accountId, prefsOf(style))
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
