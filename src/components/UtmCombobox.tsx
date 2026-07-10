import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addTaxonomyValue, getTaxonomyValues, suggestLinkValues } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

type UtmField = 'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_term' | 'utm_content'

interface Props {
  id: string
  label: string
  clientId: number | null
  field: UtmField
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /**
   * When this is a utm_medium field, the chosen source for the same row. Lets us
   * surface the most logical mediums for that source at the top of the list.
   */
  relatedSource?: string
}

// Source and medium have a governed taxonomy table; others pull from existing link data.
const GOVERNED: Set<UtmField> = new Set(['utm_source', 'utm_medium'])

/**
 * Static source → suggested-medium lookup. When a source is picked, these
 * mediums float to the top of the medium combobox — always overridable, never a
 * hard lock. Matched case-insensitively on a normalized source token, so
 * "Facebook", "facebook", and "facebook-ads" all resolve to the facebook entry.
 */
const SOURCE_MEDIUM_SUGGESTIONS: Record<string, string[]> = {
  facebook: ['organic-social', 'paid-social'],
  instagram: ['organic-social', 'paid-social'],
  tiktok: ['organic-social', 'paid-social'],
  google: ['cpc', 'organic'],
  bing: ['cpc', 'organic'],
  klaviyo: ['email'],
  newsletter: ['email'],
  linkedin: ['organic-social', 'paid-social', 'b2b'],
  youtube: ['video', 'social'],
}

/** Suggested mediums for a source value, or [] if none are known. */
export function mediumSuggestionsForSource(source: string | undefined): string[] {
  if (!source) return []
  const token = source.trim().toLowerCase()
  if (!token) return []
  // Prefer an exact match, then a prefix match (e.g. "facebook-ads" → facebook).
  if (SOURCE_MEDIUM_SUGGESTIONS[token]) return SOURCE_MEDIUM_SUGGESTIONS[token]
  const key = Object.keys(SOURCE_MEDIUM_SUGGESTIONS).find((k) => token.startsWith(k))
  return key ? SOURCE_MEDIUM_SUGGESTIONS[key] : []
}

export function UtmCombobox({
  id,
  label,
  clientId,
  field,
  value,
  onChange,
  placeholder,
  relatedSource,
}: Props) {
  const { isContributor } = useAuth()
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Intelligent mediums for the chosen source, filtered to the current query.
  // These lead the list; the governed taxonomy values follow (deduped).
  function smartMediums(q: string): string[] {
    if (field !== 'utm_medium') return []
    const token = q.trim().toLowerCase()
    return mediumSuggestionsForSource(relatedSource).filter(
      (m) => !token || m.toLowerCase().includes(token)
    )
  }

  async function fetchSuggestions(q: string) {
    if (!clientId) {
      // Even with no workspace yet, still show the static medium hints.
      setSuggestions(smartMediums(q))
      return
    }
    const lead = smartMediums(q)
    try {
      let fetched: string[]
      if (GOVERNED.has(field)) {
        const vals = await getTaxonomyValues(clientId, field, q || undefined)
        fetched = vals.map((v) => v.value)
      } else {
        fetched = await suggestLinkValues(clientId, field, q || undefined)
      }
      // Smart suggestions first, then taxonomy values, de-duplicated.
      const merged = [...lead, ...fetched.filter((v) => !lead.includes(v))]
      setSuggestions(merged)
    } catch {
      // Silently fall back to the static hints — suggestions are non-critical.
      setSuggestions(lead)
    }
  }

  function handleFocus() {
    fetchSuggestions(value)
    setOpen(true)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    onChange(v)
    fetchSuggestions(v)
    setOpen(true)
  }

  function handleSelect(s: string) {
    onChange(s)
    setOpen(false)
  }

  async function handleAddNew() {
    if (!clientId || !trimmed) return
    try {
      await addTaxonomyValue(clientId, field, trimmed)
    } catch {
      // Already exists or server error — the value is still set in the input.
    }
    onChange(trimmed)
    setOpen(false)
  }

  // Close when clicking outside — use mousedown so it fires before blur.
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const trimmed = value.trim().toLowerCase()
  const exactMatch = suggestions.some((s) => s === trimmed)
  // Only governed fields get an "Add" option — free-text fields are just
  // suggestions. Contributors can't write taxonomy values (the Worker 403s), so
  // hide the affordance for them; they pick from approved values only.
  const showAdd = GOVERNED.has(field) && trimmed.length > 0 && !exactMatch && !isContributor
  const showDropdown = open && (suggestions.length > 0 || showAdd)

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          autoComplete="off"
        />
        {showDropdown && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-sm">
            <ul className="mono max-h-48 overflow-auto py-1 text-sm">
              {suggestions.map((s) => (
                <li
                  key={s}
                  // mousedown fires before blur so the input doesn't lose focus prematurely.
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(s) }}
                  className="cursor-pointer px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
                >
                  {s}
                </li>
              ))}
              {showAdd && (
                <li
                  onMouseDown={(e) => { e.preventDefault(); handleAddNew() }}
                  className="cursor-pointer border-t border-border px-3 py-1.5 text-ochre hover:bg-accent"
                >
                  Add "{trimmed}"
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
