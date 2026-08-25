import { Tooltip } from "@base-ui/react/tooltip"
import { Info } from "lucide-react"

/**
 * A small info affordance with a tooltip. Rendered through a Base UI portal so it
 * escapes the Card's `overflow-hidden` clip (which cut off the old CSS-only
 * tooltip). Opens on hover and keyboard focus. `text` is plain explanatory copy.
 */
export function InfoHint({ text, label = "More information" }: { text: string; label?: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <button
            type="button"
            aria-label={label}
            className="inline-flex items-center justify-center rounded-full align-middle text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <Info className="size-3.5" />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={6} className="z-50">
          <Tooltip.Popup className="max-w-64 rounded-md bg-popover px-2.5 py-2 text-xs leading-snug text-popover-foreground shadow-md ring-1 ring-foreground/10">
            {text}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
