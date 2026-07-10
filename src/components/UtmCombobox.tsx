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
}

// Source and medium have a governed taxonomy table; others pull from existing link data.
const GOVERNED: Set<UtmField> = new Set(['utm_source', 'utm_medium'])

export function UtmCombobox({ id, label, clientId, field, value, onChange, placeholder }: Props) {
  const { isContributor } = useAuth()
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  async function fetchSuggestions(q: string) {
    if (!clientId) return
    try {
      if (GOVERNED.has(field)) {
        const vals = await getTaxonomyValues(clientId, field, q || undefined)
        setSuggestions(vals.map((v) => v.value))
      } else {
        const vals = await suggestLinkValues(clientId, field, q || undefined)
        setSuggestions(vals)
      }
    } catch {
      // Silently ignore fetch errors — suggestions are non-critical.
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
