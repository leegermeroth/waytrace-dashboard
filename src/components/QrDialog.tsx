import { useCallback, useEffect, useRef, useState } from 'react'
import QRCodeStyling from 'qr-code-styling'
import {
  buildQrOptions,
  DEFAULT_STYLE,
  loadSavedStyle,
  LOGO_MAX_BYTES,
  persistStylePrefs,
  saveLogo,
  SIZE_MAX,
  SIZE_MIN,
  SIZE_STEP,
  type CornerStyle,
  type DotStyle,
} from '@/lib/qr-style'
import { checkScannability, LOGO_COVERAGE_WARN } from '@/lib/qr-scannability'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The URL to encode — a short URL or a full tracking URL. */
  url: string
  /** Human label used for the download filename and dialog description. */
  label?: string
}

const DOT_STYLES: { value: DotStyle; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'dots', label: 'Dots' },
  { value: 'classy', label: 'Classy' },
  { value: 'extra-rounded', label: 'Extra rounded' },
]

const CORNER_STYLES: { value: CornerStyle; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'dots', label: 'Dots' },
]

// Persisted style prefs (colors, pattern, corners, logo, size) are namespaced by
// account and shared with the bulk QR exporter — see src/lib/qr-style.ts (#26).
// The logo's on-canvas coverage (qr-code-styling imageSize) is fixed here.
const LOGO_IMAGE_SIZE = 0.35

function slugForFile(label: string | undefined, url: string): string {
  const base = (label || url).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return (base || 'qr-code').slice(0, 60)
}

/**
 * Inline QR preview + PNG/SVG download, generated client-side with
 * `qr-code-styling`. Supports a center logo plus custom dot and corner styling
 * on top of the existing foreground/background colors. The logo and style
 * choices persist to localStorage so they reapply to the next QR code the user
 * makes on this browser. Encodes whatever URL it's handed (the caller passes the
 * `?qr` scan-tracking URL), so scan tracking is unaffected. Controlled via `open`.
 */
export function QrDialog({ open, onOpenChange, url, label }: Props) {
  const { accountId } = useAuth()
  const [fgColor, setFgColor] = useState(DEFAULT_STYLE.fgColor)
  const [bgColor, setBgColor] = useState(DEFAULT_STYLE.bgColor)
  const [dotStyle, setDotStyle] = useState<DotStyle>(DEFAULT_STYLE.dotStyle)
  const [cornerStyle, setCornerStyle] = useState<CornerStyle>(DEFAULT_STYLE.cornerStyle)
  const [logo, setLogo] = useState<string | null>(DEFAULT_STYLE.logo)
  const [size, setSize] = useState<number>(DEFAULT_STYLE.size)
  const [error, setError] = useState<string | null>(null)
  // Persistence is gated until the account's saved style has loaded, so the
  // initial DEFAULT render never clobbers stored prefs before we read them (#26).
  const [hydrated, setHydrated] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const qrRef = useRef<QRCodeStyling | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Load this account's saved style (prefs from localStorage, logo from
  // IndexedDB). Re-runs on account switch so one customer's branding never
  // carries into another's session on a shared browser.
  useEffect(() => {
    let cancelled = false
    setHydrated(false)
    loadSavedStyle(accountId).then((s) => {
      if (cancelled) return
      setFgColor(s.fgColor)
      setBgColor(s.bgColor)
      setDotStyle(s.dotStyle)
      setCornerStyle(s.cornerStyle)
      setLogo(s.logo)
      setSize(s.size)
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [accountId])

  // Base UI can mount the dialog's popup in a commit AFTER the open-effect has
  // already run (observed on the very first open of the dialog), leaving
  // containerRef null when the effect tries to append — and nothing would
  // retry, so the preview stayed empty. A callback ref catches the container
  // whenever it actually mounts and appends the already-built QR; the effect
  // below still handles the opposite order (container first, QR second).
  const attachContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node
    if (node && qrRef.current && node.childElementCount === 0) {
      qrRef.current.append(node)
    }
  }, [])

  // Render / update the QR whenever the dialog is open and any input changes.
  useEffect(() => {
    if (!open || !url) return
    setError(null)
    try {
      const options = buildQrOptions(url, { fgColor, bgColor, dotStyle, cornerStyle, logo, size })
      if (!qrRef.current) {
        qrRef.current = new QRCodeStyling(options)
      } else {
        qrRef.current.update(options)
      }
      // The dialog content unmounts on close, so on each reopen the container is
      // a fresh, empty node — (re)append only when it hasn't been populated yet.
      const container = containerRef.current
      if (container && container.childElementCount === 0) {
        qrRef.current.append(container)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate QR code')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, url, fgColor, bgColor, dotStyle, cornerStyle, logo, size])

  // Persist the cheap style prefs (colors/pattern/corners/size) to the account's
  // namespaced localStorage on every change — only after hydration.
  useEffect(() => {
    if (!hydrated) return
    persistStylePrefs(accountId, { fgColor, bgColor, dotStyle, cornerStyle, logo, size })
  }, [hydrated, accountId, fgColor, bgColor, dotStyle, cornerStyle, logo, size])

  // Persist the logo blob to IndexedDB only when it actually changes (large,
  // async) — never on every color drag.
  useEffect(() => {
    if (!hydrated) return
    void saveLogo(accountId, logo)
  }, [hydrated, accountId, logo])

  // Scannability guard (#27): warn — never block — about combinations that scan
  // poorly, paired with a one-click reset to safe defaults below.
  const warnings = checkScannability({
    fgColor,
    bgColor,
    size,
    hasLogo: logo != null,
    logoCoverage: LOGO_IMAGE_SIZE > LOGO_COVERAGE_WARN ? LOGO_IMAGE_SIZE : 0,
  })

  function resetToDefaults() {
    setError(null)
    setFgColor(DEFAULT_STYLE.fgColor)
    setBgColor(DEFAULT_STYLE.bgColor)
    setDotStyle(DEFAULT_STYLE.dotStyle)
    setCornerStyle(DEFAULT_STYLE.cornerStyle)
    setSize(DEFAULT_STYLE.size)
    // Leave the logo as-is — resetting is about restoring a scannable, high-
    // contrast base, not discarding the customer's uploaded mark.
  }

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    if (file.size > LOGO_MAX_BYTES) {
      setError('That logo is too large — please use an image under 1 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setError(null)
      setLogo(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.onerror = () => setError('Could not read that image.')
    reader.readAsDataURL(file)
  }

  function download(extension: 'png' | 'svg') {
    if (!url || !qrRef.current) return
    qrRef.current.download({ name: slugForFile(label, url), extension }).catch((err) => {
      setError(err instanceof Error ? err.message : `Failed to download ${extension.toUpperCase()}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>QR code</DialogTitle>
          <DialogDescription className="mono break-all text-xs">{url}</DialogDescription>
        </DialogHeader>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="dot-grid-well mx-auto flex w-fit items-center justify-center rounded-md border border-border p-4 [&_canvas]:h-56 [&_canvas]:w-56">
          <div ref={attachContainer} className="flex items-center justify-center" />
        </div>

        {warnings.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-cast p-3">
            {warnings.map((w) => (
              <p
                key={w.code}
                className={w.level === 'critical' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
              >
                {w.level === 'critical' ? '⚠ ' : ''}
                {w.message}
              </p>
            ))}
            <button
              type="button"
              onClick={resetToDefaults}
              className="mono w-fit cursor-pointer text-[0.625rem] tracking-[0.08em] text-ochre uppercase hover:underline"
            >
              Reset to safe defaults
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="qr_dot">Pattern</Label>
            <Select value={dotStyle} onValueChange={(v) => v && setDotStyle(v as DotStyle)}>
              <SelectTrigger id="qr_dot" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOT_STYLES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="qr_corner">Corners</Label>
            <Select value={cornerStyle} onValueChange={(v) => v && setCornerStyle(v as CornerStyle)}>
              <SelectTrigger id="qr_corner" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CORNER_STYLES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="qr_fg">Foreground</Label>
            <Input
              id="qr_fg"
              type="color"
              value={fgColor}
              onChange={(e) => setFgColor(e.target.value)}
              className="h-9 w-full p-1"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="qr_bg">Background</Label>
            <Input
              id="qr_bg"
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="h-9 w-full p-1"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Center logo</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            onChange={onLogoChange}
            className="hidden"
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              {logo ? 'Replace logo' : 'Upload logo'}
            </Button>
            {logo && (
              <Button type="button" variant="destructive-ghost" onClick={() => setLogo(null)}>
                Remove logo
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Stored only in this browser — never uploaded. PNG or SVG, under 1 MB.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="qr_size">PNG size</Label>
            <span className="mono text-xs text-muted-foreground">{size} × {size} px</span>
          </div>
          <input
            id="qr_size"
            type="range"
            min={SIZE_MIN}
            max={SIZE_MAX}
            step={SIZE_STEP}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-full accent-[#A8772E]"
          />
          <p className="text-xs text-muted-foreground">
            Higher = better for print. SVG is vector and stays sharp at any size.
          </p>
        </div>

        <div className="flex gap-2">
          <Button type="button" disabled={!url} onClick={() => download('png')}>
            Download PNG
          </Button>
          <Button type="button" variant="outline" disabled={!url} onClick={() => download('svg')}>
            Download SVG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
