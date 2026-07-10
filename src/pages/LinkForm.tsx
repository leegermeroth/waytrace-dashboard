import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  listClients,
  listLinks,
  updateLink,
  type Client,
  type Link,
} from '@/lib/api'
import { UtmCombobox } from '@/components/UtmCombobox'
import { normalizeDestinationUrl } from '@/lib/links'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/brand'
import BatchLinkForm from '@/pages/BatchLinkForm'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Dispatcher: creating links uses the batch-first builder; editing an existing
 * link keeps the focused single-link form below.
 */
export default function LinkForm() {
  const { id } = useParams()
  return id ? <EditLinkForm id={id} /> : <BatchLinkForm />
}

function EditLinkForm({ id }: { id: string }) {
  const navigate = useNavigate()

  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState<string>('')
  const [destinationUrl, setDestinationUrl] = useState('')
  const [label, setLabel] = useState('')
  const [linkType, setLinkType] = useState('short')
  const [utmSource, setUtmSource] = useState('')
  const [utmMedium, setUtmMedium] = useState('')
  const [utmCampaign, setUtmCampaign] = useState('')
  const [utmTerm, setUtmTerm] = useState('')
  const [utmContent, setUtmContent] = useState('')

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const clientList = await listClients()
        setClients(clientList)

        const links = await listLinks()
        const link = links.find((l) => l.id === Number(id))
        if (!link) {
          setError('Link not found')
        } else {
          populateForm(link)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load form')
      } finally {
        setIsLoading(false)
      }
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function populateForm(link: Link) {
    setClientId(String(link.client_id))
    setDestinationUrl(link.destination_url)
    setLabel(link.label ?? '')
    setLinkType(link.link_type)
    setUtmSource(link.utm_source ?? '')
    setUtmMedium(link.utm_medium ?? '')
    setUtmCampaign(link.utm_campaign ?? '')
    setUtmTerm(link.utm_term ?? '')
    setUtmContent(link.utm_content ?? '')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await updateLink(Number(id), {
        client_id: Number(clientId),
        destination_url: normalizeDestinationUrl(destinationUrl),
        label: label || undefined,
        utm_source: utmSource || undefined,
        utm_medium: utmMedium || undefined,
        utm_campaign: utmCampaign || undefined,
        utm_term: utmTerm || undefined,
        utm_content: utmContent || undefined,
        link_type: linkType,
      })
      navigate(`/dashboard/links/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save link')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <p className="font-serif text-sm text-muted-foreground italic">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Build"
        title="Edit link"
        description="Update the destination and UTM parameters for this campaign link."
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Link details</CardTitle>
          <CardDescription>
            Set the destination URL and optional UTM parameters for tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {clients.length > 1 && (
              <div className="flex flex-col gap-2">
                <Label>Workspace</Label>
                <Select value={clientId} onValueChange={(v) => setClientId(v ?? '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="destination_url">Destination URL</Label>
              <Input
                id="destination_url"
                type="text"
                inputMode="url"
                required
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                placeholder="example.com/page"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Spring campaign"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Link type</Label>
              <Select value={linkType} onValueChange={(v) => setLinkType(v ?? 'short')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short link</SelectItem>
                  <SelectItem value="qr">QR code</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <UtmCombobox
                id="utm_source"
                label="UTM Source"
                clientId={clientId ? Number(clientId) : null}
                field="utm_source"
                value={utmSource}
                onChange={setUtmSource}
                placeholder="facebook"
              />
              <UtmCombobox
                id="utm_medium"
                label="UTM Medium"
                clientId={clientId ? Number(clientId) : null}
                field="utm_medium"
                value={utmMedium}
                onChange={setUtmMedium}
                placeholder="paid-social"
                relatedSource={utmSource}
              />
              <UtmCombobox
                id="utm_campaign"
                label="UTM Campaign"
                clientId={clientId ? Number(clientId) : null}
                field="utm_campaign"
                value={utmCampaign}
                onChange={setUtmCampaign}
                placeholder="summer-2026"
              />
              <UtmCombobox
                id="utm_term"
                label="UTM Term"
                clientId={clientId ? Number(clientId) : null}
                field="utm_term"
                value={utmTerm}
                onChange={setUtmTerm}
              />
              <UtmCombobox
                id="utm_content"
                label="UTM Content"
                clientId={clientId ? Number(clientId) : null}
                field="utm_content"
                value={utmContent}
                onChange={setUtmContent}
                placeholder="hero-button"
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save changes'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
