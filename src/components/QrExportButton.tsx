import { useRef, useState } from 'react'
import { FolderDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CollectionAsset } from '@/lib/api'
import { scanUrl } from '@/lib/links'

interface Props {
  /** Assets to export — one QR per asset, encoding its ?qr=1 scan URL. */
  assets: CollectionAsset[]
  /** Filename base per asset (SKU / person slug); falls back to short_code. */
  nameFor: (asset: CollectionAsset) => string | null | undefined
  /** Zip download filename, e.g. "2026-packaging-qr-codes.zip". */
  zipName: string
  /** Surface a failure into the page's existing error alert. */
  onError: (message: string) => void
}

/**
 * "Export all QRs" — client-side zip of one styled PNG per asset (same saved
 * QR customization the per-row dialog uses). The heavy pieces (JSZip + the
 * render loop) live in a lazy chunk loaded on first click; while generating,
 * the button becomes its own progress indicator. Read-only action, so it's
 * not gated on canAdminister — contributors can pull print files too.
 */
export function QrExportButton({ assets, nameFor, zipName, onError }: Props) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  // Guards double-clicks across the async import gap before state updates.
  const busyRef = useRef(false)

  async function handleExport() {
    if (busyRef.current || assets.length === 0) return
    busyRef.current = true
    setProgress({ done: 0, total: assets.length })
    try {
      const { exportQrZip } = await import('@/lib/qr-export')
      await exportQrZip(
        assets.map((a) => ({ url: scanUrl(a), name: nameFor(a) || a.short_code })),
        zipName,
        (done, total) => setProgress({ done, total })
      )
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to export QR codes')
    } finally {
      busyRef.current = false
      setProgress(null)
    }
  }

  const busy = progress !== null
  return (
    <Button variant="outline" onClick={handleExport} disabled={busy || assets.length === 0}>
      <FolderDown className="size-4" />
      {busy
        ? progress.done < progress.total
          ? `Rendering ${progress.done}/${progress.total}…`
          : 'Zipping…'
        : 'Export all QRs'}
    </Button>
  )
}
