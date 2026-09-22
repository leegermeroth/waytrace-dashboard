import { useState } from 'react'
import type { AdOutputDto, AdParam, AdPlatformDto, AdPreviewResult } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

/**
 * Preview + copy actions for an Ad Tracking Link (brief §13, §26, §37, §38).
 *
 * Every string rendered here comes from the SERVER — the /preview response for
 * a link being edited, or the stored generated_* strings for a saved one. This
 * component never assembles a parameter string, and the copy buttons copy those
 * server bytes verbatim. Building one here would mean a second serializer that
 * could drift from the Worker's, and the standard dashboard URL builder
 * percent-encodes braces, which silently corrupts every macro.
 */
export function AdLinkPreview({
  platform,
  preview,
  showBreakdown = true,
}: {
  platform: AdPlatformDto
  preview: AdPreviewResult
  showBreakdown?: boolean
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500)
  }

  function valueFor(output: AdOutputDto): string | undefined {
    if (output.id === 'params') return preview.suffix
    if (output.id === 'final_url') return preview.final_url
    if (output.id === 'full_url') return preview.full_url
    return preview.destination
  }

  if (!preview.valid) return null

  const enabled = (preview.params ?? []).filter((p) => p.enabled)

  return (
    <div className="flex flex-col gap-5">
      {showBreakdown && enabled.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="eyebrow-sm">What each click will record</h3>
          <dl className="divide-y divide-border rounded-md border border-border">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
              <dt className="w-40 shrink-0 font-mono text-xs text-muted-foreground">
                Landing page
              </dt>
              <dd className="min-w-0 flex-1 truncate text-sm">{preview.destination}</dd>
            </div>
            {enabled.map((param) => (
              <ParamRow key={param.key} param={param} />
            ))}
          </dl>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {platform.outputs.map((output) => {
          const value = valueFor(output)
          if (!value) return null
          const copied = copiedId === output.id

          return (
            <div
              key={output.id}
              className={`flex flex-col gap-2 rounded-md border p-3 ${
                output.primary ? 'border-ochre/50 bg-ochre/5' : 'border-border'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="eyebrow-sm">
                  {output.primary ? `${output.label.replace(/^Copy /, '')} - paste this` : output.label.replace(/^Copy /, '')}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={output.primary ? 'default' : 'outline'}
                  onClick={() => copy(value, output.id)}
                >
                  {copied ? 'Copied' : output.label}
                </Button>
              </div>
              <code className="block overflow-x-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-all">
                {value}
              </code>
              <p className="text-xs text-muted-foreground">{output.helper}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ParamRow({ param }: { param: AdParam }) {
  const dynamic = param.type === 'platform_dynamic'
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
      <dt className="w-40 shrink-0 font-mono text-xs text-muted-foreground">{param.key}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-2">
        <code className="min-w-0 truncate font-mono text-xs">{param.value}</code>
        {dynamic && (
          <Badge variant="outline" className="shrink-0 text-[0.625rem]">
            Dynamic
          </Badge>
        )}
      </dd>
    </div>
  )
}
