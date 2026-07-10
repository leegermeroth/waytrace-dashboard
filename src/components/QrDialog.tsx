import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

function slugForFile(label: string | undefined, url: string): string {
  const base = (label || url).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return (base || 'qr-code').slice(0, 60)
}

/**
 * Inline QR preview + PNG/SVG download, generated client-side with the `qrcode`
 * library. Replaces the standalone /dashboard/qr page — surfaced as a per-link
 * action from the links list and link detail. Controlled via `open`.
 */
export function QrDialog({ open, onOpenChange, url, label }: Props) {
  const [fgColor, setFgColor] = useState('#2C2820') // graphite, not pure black
  const [bgColor, setBgColor] = useState('#FFFFFF')
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !url) {
      setDataUrl(null)
      return
    }
    let cancelled = false
    setError(null)
    QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: fgColor, light: bgColor } })
      .then((generated) => {
        if (!cancelled) setDataUrl(generated)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to generate QR code')
      })
    return () => {
      cancelled = true
    }
  }, [open, url, fgColor, bgColor])

  function download(format: 'png' | 'svg') {
    if (!url) return
    const filename = slugForFile(label, url)

    if (format === 'png') {
      if (!dataUrl) return
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${filename}.png`
      a.click()
      return
    }

    QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: fgColor, light: bgColor } })
      .then((svg) => {
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const href = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = href
        a.download = `${filename}.svg`
        a.click()
        URL.revokeObjectURL(href)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to generate SVG'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>QR code</DialogTitle>
          <DialogDescription className="mono break-all text-xs">{url}</DialogDescription>
        </DialogHeader>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="dot-grid-well flex aspect-square max-h-64 items-center justify-center rounded-md border border-border">
          {dataUrl ? (
            <img src={dataUrl} alt="QR code preview" className="h-56 w-56" />
          ) : (
            <p className="font-serif text-sm text-muted-foreground italic">Generating…</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
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

        <div className="flex gap-2">
          <Button type="button" disabled={!dataUrl} onClick={() => download('png')}>
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
