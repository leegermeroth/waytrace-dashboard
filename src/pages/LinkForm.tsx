import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  createClient,
  createLink,
  listClients,
  listLinks,
  updateLink,
  type Client,
  type Link,
} from '@/lib/api'
import { UtmCombobox } from '@/components/UtmCombobox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/brand'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function LinkForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState<string>('')
  const [destinationUrl, setDestinationUrl] = useState('')
  const [label, setLabel] = useState('')
  const [shortCode, setShortCode] = useState('')
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
        let clientList = await listClients()

        if (clientList.length === 0) {
          const created = await createClient('My Links', `my-links-${Date.now().toString(36)}`)
          clientList = [created]
        }
        setClients(clientList)

        if (isEdit && id) {
          const links = await listLinks()
          const link = links.find((l) => l.id === Number(id))
          if (!link) {
            setError('Link not found')
          } else {
            populateForm(link)
          }
        } else {
          setClientId(String(clientList[0].id))
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
    setShortCode(link.short_code)
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
      const input = {
        client_id: Number(clientId),
        destination_url: destinationUrl,
        label: label || undefined,
        utm_source: utmSource || undefined,
        utm_medium: utmMedium || undefined,
        utm_campaign: utmCampaign || undefined,
        utm_term: utmTerm || undefined,
        utm_content: utmContent || undefined,
        link_type: linkType,
      }

      if (isEdit && id) {
        await updateLink(Number(id), input)
        navigate(`/dashboard/links/${id}`)
      } else {
        const created = await createLink({
          ...input,
          short_code: shortCode || undefined,
        })
        navigate(`/dashboard/links/${created.id}`)
      }
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
        title={isEdit ? 'Edit link' : 'New link'}
        description="Set the destination and consistent UTM parameters for this campaign link."
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{isEdit ? 'Link details' : 'Create a link'}</CardTitle>
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
                type="url"
                required
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                placeholder="https://example.com/page"
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

            {!isEdit && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="short_code">Short code (optional)</Label>
                <Input
                  id="short_code"
                  value={shortCode}
                  onChange={(e) => setShortCode(e.target.value.toLowerCase())}
                  placeholder="Auto-generated if left blank"
                />
              </div>
            )}

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
                placeholder="social"
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
                {isSubmitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create link'}
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
