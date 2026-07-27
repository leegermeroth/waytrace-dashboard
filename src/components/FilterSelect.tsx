import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

/**
 * A dimension filter dropdown that reads as its field name when unfiltered
 * (Source / Medium / Campaign / Content) and as the chosen value once filtered —
 * so a default filter row reads "Source  Medium  Campaign" instead of
 * "all  all  all". Shared by the Links library and the Analytics page.
 */
export function FilterSelect({
  label,
  allLabel,
  value,
  onChange,
  options,
  className = 'h-8 w-auto min-w-32',
}: {
  label: string
  allLabel: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  const selected = options.find((o) => o.value === value)
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? 'all')}>
      <SelectTrigger className={className}>
        <span className={value === 'all' ? 'text-muted-foreground' : ''}>
          {value === 'all' ? label : selected?.label ?? value}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
