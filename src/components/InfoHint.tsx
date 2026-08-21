import { Info } from "lucide-react"

/**
 * A small info affordance with a CSS-only hover/focus tooltip. No portal, no
 * external request, no JS state — safe under the dashboard CSP and cheap to drop
 * beside a card title. `text` is plain explanatory copy.
 */
export function InfoHint({ text, label = "More information" }: { text: string; label?: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        className="inline-flex items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="size-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-56 -translate-x-1/2 rounded-md bg-popover px-2.5 py-2 text-xs leading-snug text-popover-foreground shadow-md ring-1 ring-foreground/10 group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  )
}
