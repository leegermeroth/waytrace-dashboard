import { useEffect, useRef, useState } from 'react'
import QRCodeStyling, { type Options } from 'qr-code-styling'
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

type DotStyle = 'square' | 'rounded' | 'dots' | 'classy' | 'extra-rounded'
type CornerStyle = 'square' | 'rounded' | 'dots'

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

/**
 * Persisted QR style prefs live in localStorage (per-browser, never uploaded to
 * our servers). This lets a customization — including the center logo — carry
 * across every QR code the user generates on this browser, without any
 * server-side storage. Keyed alongside the existing `waytrace_auth` entry.
 */
const STORAGE_KEY = 'waytrace_qr_style'
const LOGO_MAX_BYTES = 1024 * 1024 // 1 MB — keeps the base64 blob well under the ~5 MB localStorage cap

interface SavedStyle {
  fgColor: string
  bgColor: string
  dotStyle: DotStyle
  cornerStyle: CornerStyle
  logo: string | null
  size: number
}

const DEFAULT_STYLE: SavedStyle = {
  fgColor: '#2C2820', // graphite, not pure black
  bgColor: '#FFFFFF',
  dotStyle: 'square',
  cornerStyle: 'square',
  logo: null,
  size: 512,
}

// PNG export resolution bounds. 320 keeps the old default reachable; 2048 is
// ample for print (e.g. ~6.8" at 300 DPI). SVG ignores this — it's vector.
const SIZE_MIN = 256
const SIZE_MAX = 2048
const SIZE_STEP = 64

function loadSavedStyle(): SavedStyle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STYLE
    return { ...DEFAULT_STYLE, ...(JSON.parse(raw) as Partial<SavedStyle>) }
  } catch {
    return DEFAULT_STYLE
  }
}

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
  const initial = useRef<SavedStyle>(loadSavedStyle())
  const [fgColor, setFgColor] = useState(initial.current.fgColor)
  const [bgColor, setBgColor] = useState(initial.current.bgColor)
  const [dotStyle, setDotStyle] = useState<DotStyle>(initial.current.dotStyle)
  const [cornerStyle, setCornerStyle] = useState<CornerStyle>(initial.current.cornerStyle)
  const [logo, setLogo] = useState<string | null>(initial.current.logo)
  const [size, setSize] = useState<number>(initial.current.size)
  const [error, setError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const qrRef = useRef<QRCodeStyling | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function buildOptions(): Options {
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

  // Render / update the QR whenever the dialog is open and any input changes.
  useEffect(() => {
    if (!open || !url) return
    setError(null)
    try {
      const options = buildOptions()
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

  // Persist style choices (incl. the logo data URL) to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ fgColor, bgColor, dotStyle, cornerStyle, logo, size } satisfies SavedStyle),
      )
    } catch {
      // Quota exceeded (e.g. very large logo) — non-fatal, just don't persist.
    }
  }, [fgColor, bgColor, dotStyle, cornerStyle, logo, size])

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
          <div ref={containerRef} className="flex items-center justify-center" />
        </div>

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
