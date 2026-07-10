import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Waytrace icon mark — a measured line rising from a filled ochre point (the
 * reference) to a hollow graphite point (what's being measured). The graphite
 * strokes use `currentColor` so the mark inverts correctly on dark surfaces;
 * the ochre reference point is sacred and never recolored.
 */
export function WaytraceMark({
  size = 22,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('text-foreground', className)}
      aria-hidden="true"
    >
      <line x1="32" y1="68" x2="72" y2="36" stroke="currentColor" strokeWidth="3" />
      <circle cx="72" cy="36" r="7.5" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="32" cy="68" r="8" fill="var(--ochre)" />
    </svg>
  )
}

/** Full lockup: icon mark + Archivo wordmark. */
export function Wordmark({
  markSize = 22,
  className,
}: {
  markSize?: number
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-foreground', className)}>
      <WaytraceMark size={markSize} />
      <span className="font-heading text-[1.15rem] leading-none font-semibold tracking-[-0.03em]">
        Waytrace
      </span>
    </span>
  )
}

/**
 * Decorative "reference relationship" geometry used on auth screens — a filled
 * ochre reference point measured against a hollow graphite point. Purely
 * illustrative; respects reduced-motion via the .wt-refring animation in CSS.
 */
export function ReferenceGeometry({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 120" className={cn('w-full', className)} aria-hidden="true">
      <line x1="34" y1="86" x2="150" y2="40" stroke="var(--graphite)" strokeWidth="1.4" />
      <line x1="34" y1="86" x2="150" y2="40" stroke="currentColor" strokeWidth="1.4" opacity="0" />
      <circle cx="150" cy="40" r="6" fill="var(--card)" stroke="var(--graphite)" strokeWidth="1.4" />
      <circle cx="34" cy="86" r="8" fill="none" stroke="var(--ochre)" strokeWidth="1.3" opacity="0.5" />
      <circle cx="34" cy="86" r="5.5" fill="var(--ochre)" />
    </svg>
  )
}

/**
 * Standard page header for dashboard screens: a mono eyebrow, an Archivo title,
 * an optional description, and a right-aligned actions slot — separated from the
 * content by a hairline, echoing the marketing section rhythm.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-heading text-[26px] leading-tight font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * A single metric tile in the "reference point" grammar: mono label, a large
 * Archivo number, and an optional ochre reference dot marking the metric that is
 * the trusted point being measured.
 */
export function StatCard({
  label,
  value,
  hint,
  reference = false,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  reference?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        {reference && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ochre" aria-hidden="true" />
        )}
        <div className="eyebrow-sm">{label}</div>
      </div>
      <div className="mt-3 font-heading text-3xl leading-none font-semibold tracking-[-0.02em] text-foreground">
        {value}
      </div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

/**
 * Shared frame for all public / unauthenticated screens (login, welcome,
 * invite, password reset). Paper background with the measurement dot-grid, the
 * wordmark up top, a single card, and the brand tagline in the footer.
 */
export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="dot-grid relative flex min-h-svh flex-col items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Wordmark markSize={26} />
        </div>
        <div className="rounded-xl border border-border bg-card p-7">
          {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
          <h1 className="font-heading text-[22px] leading-tight font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        <div className="eyebrow-sm mt-8 text-center">Growth starts before the click.</div>
      </div>
    </div>
  )
}
