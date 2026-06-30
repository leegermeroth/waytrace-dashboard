import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { listLinks, type Link } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function QrCodePage() {
  const [links, setLinks] = useState<Link[]>([])
  const [selectedLinkId, setSelectedLinkId] = useState<string>('custom')
  const [customUrl, setCustomUrl] = useState('')
  const [fgColor, setFgColor] = useState('#000000')
  const [bgColor, setBgColor] = useState('#ffffff')
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listLinks()
      .then(setLinks)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load links'))
  }, [])

  function shortUrl(link: Link) {
    const domain = link.short_domain || 'waygo.to'
    return `https://${domain}/${link.short_code}`
  }

  const targetUrl = useMemo(() => {
    if (selectedLinkId === 'custom') return customUrl
    const link = links.find((l) => String(l.id) === selectedLinkId)
    return link ? shortUrl(link) : ''
  }, [selectedLinkId, customUrl, links])

  useEffect(() => {
    if (!targetUrl) {
      setDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(targetUrl, {
      width: 320,
      margin: 1,
      color: { dark: fgColor, light: bgColor },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to generate QR code')
      })
    return () => {
      cancelled = true
    }
  }, [targetUrl, fgColor, bgColor])

  function download(format: 'png' | 'svg') {
    if (!targetUrl) return

    if (format === 'png') {
      if (!dataUrl) return
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = 'qr-code.png'
      a.click()
      return
    }

    QRCode.toString(targetUrl, { type: 'svg', margin: 1, color: { dark: fgColor, light: bgColor } })
      .then((svg) => {
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'qr-code.svg'
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to generate SVG'))
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">QR codes</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Generate</CardTitle>
            <CardDescription>Pick a saved link or enter any URL.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Source</Label>
              <Select value={selectedLinkId} onValueChange={(v) => setSelectedLinkId(v ?? 'custom')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom URL</SelectItem>
                  {links.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.label || l.short_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedLinkId === 'custom' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="custom_url">URL</Label>
                <Input
                  id="custom_url"
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="fg_color">Foreground</Label>
                <Input
                  id="fg_color"
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="h-10 w-full p-1"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bg_color">Background</Label>
                <Input
                  id="bg_color"
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="h-10 w-full p-1"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="button" disabled={!targetUrl} onClick={() => download('png')}>
                Download PNG
              </Button>
              <Button type="button" variant="outline" disabled={!targetUrl} onClick={() => download('svg')}>
                Download SVG
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex aspect-square items-center justify-center rounded-md border bg-muted/30">
              {dataUrl ? (
                <img src={dataUrl} alt="QR code preview" className="h-64 w-64" />
              ) : (
                <p className="text-sm text-muted-foreground">Enter a URL to preview the QR code</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
