import { useMemo, useState } from "react"
import {
  WORLD_MAP_PATH,
  WORLD_MAP_WIDTH,
  WORLD_MAP_HEIGHT,
} from "@/lib/worldMap"

export interface ClickMapCity {
  city: string
  region: string | null
  country: string
  latitude: number | null
  longitude: number | null
  count: number
}

interface Point {
  key: string
  label: string
  count: number
  cx: number
  cy: number
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

// Equirectangular (plate carrée) projection — matches the basemap generator.
const projectX = (lon: number) => ((lon + 180) / 360) * WORLD_MAP_WIDTH
const projectY = (lat: number) => ((90 - lat) / 180) * WORLD_MAP_HEIGHT

const WORLD_BOX: Box = { x: 0, y: 0, w: WORLD_MAP_WIDTH, h: WORLD_MAP_HEIGHT }
const TARGET_ASPECT = WORLD_MAP_WIDTH / WORLD_MAP_HEIGHT // 2:1, so the frame keeps the world's shape

/**
 * Fit a viewBox around the plotted points so the map frames where the clicks
 * actually are — e.g. a mostly-US audience shows the US, not the whole globe.
 *
 * A handful of far-flung clicks (a lone visit from another continent) would
 * otherwise blow the frame out to the whole world, so we first drop the farthest
 * points that together account for only a small share of total click VOLUME, then
 * fit to what remains. Every point is still drawn as a bubble and listed in the
 * Locations table; this only decides the default framing, and "Whole world"
 * always shows everything.
 */
function fitBox(points: Point[]): Box {
  if (points.length === 0) return WORLD_BOX

  // Volume-weighted centroid, then drop the farthest points whose combined
  // clicks are within a small trim budget (keep ~90% of click volume).
  const total = points.reduce((s, p) => s + p.count, 0)
  const meanX = points.reduce((s, p) => s + p.cx * p.count, 0) / total
  const meanY = points.reduce((s, p) => s + p.cy * p.count, 0) / total
  const byFarthest = [...points].sort(
    (a, b) => Math.hypot(b.cx - meanX, b.cy - meanY) - Math.hypot(a.cx - meanX, a.cy - meanY)
  )
  const trimBudget = total * 0.1
  let trimmed = 0
  const kept: Point[] = []
  for (const p of byFarthest) {
    // Peel the farthest points while the budget allows; once one doesn't fit,
    // keep it and every (nearer) point after it. Never trim the last point.
    if (trimmed + p.count <= trimBudget && kept.length < points.length - 1) trimmed += p.count
    else kept.push(p)
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of kept) {
    minX = Math.min(minX, p.cx)
    minY = Math.min(minY, p.cy)
    maxX = Math.max(maxX, p.cx)
    maxY = Math.max(maxY, p.cy)
  }

  let w = maxX - minX
  let h = maxY - minY
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  // Light padding around the cluster, with an absolute floor so a single city
  // still opens up to a readable window instead of zooming to the rooftops.
  const MIN_W = 120 // world units (~43° of longitude)
  w = Math.max(w * 1.3, MIN_W)
  h = Math.max(h * 1.3, MIN_W / TARGET_ASPECT)

  // Normalize to the world's aspect ratio so the frame isn't stretched.
  if (w / h > TARGET_ASPECT) h = w / TARGET_ASPECT
  else w = h * TARGET_ASPECT

  // Never zoom out past the whole world.
  if (w >= WORLD_MAP_WIDTH || h >= WORLD_MAP_HEIGHT) return WORLD_BOX

  // Clamp the centered box inside the map bounds.
  let x = cx - w / 2
  let y = cy - h / 2
  x = Math.max(0, Math.min(x, WORLD_MAP_WIDTH - w))
  y = Math.max(0, Math.min(y, WORLD_MAP_HEIGHT - h))
  return { x, y, w, h }
}

/**
 * A self-contained world map that plots one bubble per resolved city, sized by
 * click volume. The basemap is an inline SVG path and every marker is drawn from
 * data already in the response — the map makes NO external request, so it works
 * within the dashboard's strict CSP (img-src 'self'; audit finding #18).
 *
 * Coordinates are Cloudflare's city CENTROID, so a bubble marks "where that city
 * is," at the same granularity as the city name — not a precise visitor fix.
 */
export function ClickMap({ cities }: { cities: ClickMapCity[] }) {
  const [hover, setHover] = useState<Point | null>(null)
  const [wholeWorld, setWholeWorld] = useState(false)

  const points = useMemo<Point[]>(() => {
    const geo = cities.filter(
      (c) =>
        c.latitude != null &&
        c.longitude != null &&
        Number.isFinite(c.latitude) &&
        Number.isFinite(c.longitude) &&
        c.city !== "Unknown"
    )
    return geo.map((c) => ({
      key: `${c.city}|${c.region ?? ""}|${c.country}`,
      label:
        c.city +
        (c.region ? `, ${c.region}` : "") +
        (c.country && c.country !== "Unknown" ? ` · ${c.country}` : ""),
      count: c.count,
      cx: projectX(c.longitude as number),
      cy: projectY(c.latitude as number),
    }))
  }, [cities])

  const fitted = useMemo(() => fitBox(points), [points])
  const box = wholeWorld ? WORLD_BOX : fitted
  const canFit = fitted !== WORLD_BOX // there's a tighter view than the globe

  // Size bubbles relative to the visible frame so they read consistently at any
  // zoom, and scale radius by √count (area ∝ clicks).
  const maxCount = points.reduce((m, p) => Math.max(m, p.count), 0)
  const rMax = box.w * 0.02
  const rMin = box.w * 0.007
  const strokeW = box.w * 0.0012
  const radius = (count: number) => {
    const t = maxCount > 0 ? Math.sqrt(count / maxCount) : 0
    return rMin + t * (rMax - rMin)
  }

  // Draw largest first so smaller bubbles sit on top and stay hoverable.
  const drawOrder = useMemo(
    () => [...points].sort((a, b) => radius(b.count) - radius(a.count)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, box.w, maxCount]
  )

  if (points.length === 0) {
    return (
      <p className="font-serif text-sm text-muted-foreground italic">
        No mappable location data yet. City-level location is recorded from the moment this
        feature went live, so older clicks show country only.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The positioning context is NOT overflow-clipped, so the hover tooltip can
          extend past the map edges. Only the inner wrapper clips the basemap to
          rounded corners. */}
      <div className="relative w-full">
        <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
          <svg
            viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
            className="block h-auto w-full"
            role="img"
            aria-label="Map of clicks by city"
            onMouseLeave={() => setHover(null)}
          >
            <path d={WORLD_MAP_PATH} fill="var(--border)" fillOpacity={0.55} stroke="none" />
            {drawOrder.map((p) => (
              <circle
                key={p.key}
                cx={p.cx}
                cy={p.cy}
                r={radius(p.count)}
                fill="var(--chart-1)"
                fillOpacity={hover?.key === p.key ? 0.85 : 0.5}
                stroke="var(--card)"
                strokeWidth={strokeW}
                className="cursor-pointer transition-[fill-opacity]"
                onMouseEnter={() => setHover(p)}
              />
            ))}
          </svg>
        </div>

        {hover && (() => {
          const leftPct = ((hover.cx - box.x) / box.w) * 100
          const topPct = ((hover.cy - box.y) / box.h) * 100
          // Flip below the point for bubbles near the top edge so the tooltip
          // isn't cut off by the card above.
          const below = topPct < 20
          return (
            <div
              className={`pointer-events-none absolute z-10 -translate-x-1/2 rounded-md bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md ring-1 ring-foreground/10 ${below ? "" : "-translate-y-full"}`}
              style={{
                left: `${Math.max(6, Math.min(94, leftPct))}%`,
                top: `calc(${topPct}% ${below ? "+" : "-"} 10px)`,
              }}
            >
              <span className="mono text-foreground">{hover.label}</span>
              <span className="mono text-muted-foreground">
                {" — "}
                {hover.count} {hover.count === 1 ? "click" : "clicks"}
              </span>
            </div>
          )
        })()}

        {canFit && (
          <button
            type="button"
            onClick={() => setWholeWorld((v) => !v)}
            className="absolute top-2 right-2 z-10 rounded-md border border-border bg-card/90 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
          >
            {wholeWorld ? "Fit to clicks" : "Whole world"}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Bubble size reflects click volume. The view auto-fits to where clicks occurred; locations
        are approximate, resolved to city level from the visitor&rsquo;s network &mdash; not a
        precise position.
      </p>
    </div>
  )
}
