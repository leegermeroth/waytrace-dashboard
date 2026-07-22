import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Trash2, Upload, FileDown, Plus } from 'lucide-react'
import { BulkValidationError, type BulkRowError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusDot } from '@/components/brand'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/**
 * Shared CSV import flow (Enterprise asset collections): template download →
 * client-side parse → editable preview grid with per-row inline errors → fix in
 * place → single bulk call → results panel. Column set and validation are
 * injected so the Packaging page (products, this session) and Team Cards
 * (people, Session 4) reuse the same component.
 *
 * The bulk endpoint is all-or-nothing: server-side per-row errors (thrown as
 * BulkValidationError) are mapped back onto the grid so the user fixes rows in
 * place and retries — nothing is partially created.
 */

export interface CsvColumn {
  /** Row object key AND the template/CSV header name. */
  key: string
  label: string
  required?: boolean
  placeholder?: string
  /** Per-cell validation, run client-side. Return an error message or null. */
  validate?: (value: string) => string | null
}

export interface CsvImportProps {
  columns: CsvColumn[]
  /** Column key whose values must be unique within the file (e.g. 'sku'). */
  uniqueKey?: string
  /** Template CSV download filename (e.g. 'waytrace-packaging-template.csv'). */
  templateFilename: string
  /** Example row(s) written into the template under the header. */
  templateExamples?: string[][]
  /** 'asset' / 'person' — used in button labels and messages. */
  entityLabel: string
  /** Max rows per import (mirrors the Worker's bulk cap). */
  cap: number
  /** Rendered between the grid and the submit button (e.g. shared UTM fields). */
  extras?: ReactNode
  /**
   * Optional row normalizer, applied to each parsed CSV row and again to each
   * row on submit (so hand-added rows are covered too) — e.g. Team Cards
   * auto-slugifies a blank person_slug from person_name.
   */
  transformRow?: (values: Record<string, string>) => Record<string, string>
  /** Fires the bulk call. Throws BulkValidationError for per-row server errors. */
  onSubmit: (rows: Record<string, string>[]) => Promise<{ created: number }>
  /** Called after the results panel's "Done" (parent refreshes its grid). */
  onDone: () => void
  onCancel: () => void
}

interface GridRow {
  key: number
  values: Record<string, string>
  /** Server-side errors from the last submit attempt (cleared on edit). */
  serverErrors: BulkRowError[]
}

let rowSeq = 0

// ── Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF) ──────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field); field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  // Drop fully-empty trailing rows.
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
}

/** Normalize a CSV header to a column key: 'Product Name' -> 'product_name'. */
function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function CsvImport({
  columns,
  uniqueKey,
  templateFilename,
  templateExamples,
  entityLabel,
  cap,
  extras,
  transformRow,
  onSubmit,
  onDone,
  onCancel,
}: CsvImportProps) {
  const [rows, setRows] = useState<GridRow[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdCount, setCreatedCount] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function downloadTemplate() {
    const lines = [columns.map((c) => c.key).join(',')]
    for (const example of templateExamples ?? []) {
      lines.push(example.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(','))
    }
    const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = templateFilename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function emptyGridRow(): GridRow {
    const values: Record<string, string> = {}
    for (const c of columns) values[c.key] = ''
    return { key: rowSeq++, values, serverErrors: [] }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setParseError(null)
    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.length < 2) {
      setParseError('That file has no data rows. Download the template to see the expected format.')
      return
    }
    const headers = parsed[0].map(normalizeHeader)
    const missing = columns.filter((c) => c.required && !headers.includes(c.key))
    if (missing.length > 0) {
      setParseError(
        `Missing required column${missing.length === 1 ? '' : 's'}: ${missing.map((c) => c.key).join(', ')}. ` +
        'Download the template to see the expected headers.'
      )
      return
    }
    const dataRows = parsed.slice(1)
    if (dataRows.length > cap) {
      setParseError(`This file has ${dataRows.length} rows — imports are limited to ${cap} rows at a time. Split the file and import in parts.`)
      return
    }
    setRows(
      dataRows.map((raw) => {
        let values: Record<string, string> = {}
        for (const c of columns) {
          const idx = headers.indexOf(c.key)
          values[c.key] = idx >= 0 ? (raw[idx] ?? '').trim() : ''
        }
        if (transformRow) values = transformRow(values)
        return { key: rowSeq++, values, serverErrors: [] }
      })
    )
  }

  function updateCell(rowKey: number, colKey: string, value: string) {
    setRows((prev) =>
      prev?.map((r) =>
        r.key === rowKey ? { ...r, values: { ...r.values, [colKey]: value }, serverErrors: [] } : r
      ) ?? null
    )
  }

  function removeRow(rowKey: number) {
    setRows((prev) => prev?.filter((r) => r.key !== rowKey) ?? null)
  }

  function addRow() {
    setRows((prev) => [...(prev ?? []), emptyGridRow()])
  }

  // Client-side validation, recomputed per render: required fields, per-column
  // validators, duplicate uniqueKey values within the grid.
  const rowErrors = useMemo(() => {
    if (!rows) return new Map<number, string[]>()
    const map = new Map<number, string[]>()
    const seen = new Map<string, number>() // lower-cased unique value -> row index
    rows.forEach((r, i) => {
      const errs: string[] = []
      for (const c of columns) {
        const v = r.values[c.key]?.trim() ?? ''
        if (c.required && !v) errs.push(`${c.label} is required`)
        else if (v && c.validate) {
          const msg = c.validate(v)
          if (msg) errs.push(msg)
        }
      }
      if (uniqueKey) {
        const v = r.values[uniqueKey]?.trim().toLowerCase()
        if (v) {
          if (seen.has(v)) errs.push(`Duplicate ${uniqueKey.toUpperCase()} (also on row ${seen.get(v)! + 1})`)
          else seen.set(v, i)
        }
      }
      for (const se of r.serverErrors) errs.push(se.message)
      if (errs.length > 0) map.set(r.key, errs)
    })
    return map
  }, [rows, columns, uniqueKey])

  const validCount = rows ? rows.length - rowErrors.size : 0
  const canSubmit = rows != null && rows.length > 0 && rowErrors.size === 0

  async function handleSubmit() {
    if (!rows || !canSubmit) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await onSubmit(rows.map((r) => {
        const out: Record<string, string> = {}
        for (const c of columns) out[c.key] = r.values[c.key]?.trim() ?? ''
        return transformRow ? transformRow(out) : out
      }))
      setCreatedCount(result.created)
    } catch (err) {
      if (err instanceof BulkValidationError) {
        // Map server-side per-row errors back onto the grid (all-or-nothing —
        // nothing was created; fix in place and retry).
        setRows((prev) =>
          prev?.map((r, i) => ({ ...r, serverErrors: err.errors.filter((e) => e.row === i) })) ?? null
        )
        setSubmitError(err.message)
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Import failed')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Results panel ─────────────────────────────────────────────────────────
  if (createdCount != null) {
    return (
      <div className="flex flex-col items-start gap-4">
        <StatusDot tone="success">Import complete</StatusDot>
        <p className="text-sm">
          Created <span className="font-medium">{createdCount}</span> {entityLabel}
          {createdCount === 1 ? '' : 's'} — each with its own short link, stamped for GA4.
        </p>
        <Button onClick={onDone}>Done</Button>
      </div>
    )
  }

  // ── Upload step ───────────────────────────────────────────────────────────
  if (rows == null) {
    return (
      <div className="flex flex-col gap-4">
        {parseError && (
          <Alert variant="destructive">
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        )}
        <div className="dot-grid-well flex flex-col items-center gap-3 rounded-xl border border-border p-10 text-center">
          <p className="font-serif text-[15px] text-muted-foreground italic">
            Upload a CSV — you'll review and fix every row before anything is created.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="hidden"
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-4" />
              Choose CSV file
            </Button>
            <Button variant="outline" onClick={downloadTemplate}>
              <FileDown className="size-4" />
              Download template
            </Button>
            <Button variant="outline" onClick={() => setRows([emptyGridRow()])}>
              <Plus className="size-4" />
              Start from a blank row
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Up to {cap} rows per import.</p>
        </div>
        <div>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    )
  }

  // ── Editable preview grid ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {rows.length} row{rows.length === 1 ? '' : 's'}
          {rowErrors.size > 0 && (
            <span className="text-destructive"> · {rowErrors.size} with errors — fix them below</span>
          )}
        </p>
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-3.5" />
          Add row
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table className="[&_td]:px-2 [&_td]:py-1.5 [&_th]:h-9">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 text-right">#</TableHead>
              {columns.map((c) => (
                <TableHead key={c.key}>
                  {c.label}
                  {c.required && <span className="text-destructive"> *</span>}
                </TableHead>
              ))}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const errs = rowErrors.get(r.key)
              return (
                <TableRow key={r.key} className={errs ? 'bg-destructive/5' : undefined}>
                  <TableCell className="mono text-right text-xs text-muted-foreground align-top pt-3">
                    {i + 1}
                  </TableCell>
                  {columns.map((c) => (
                    <TableCell key={c.key} className="align-top">
                      <Input
                        value={r.values[c.key] ?? ''}
                        onChange={(e) => updateCell(r.key, c.key, e.target.value)}
                        placeholder={c.placeholder}
                        className="h-8 min-w-32 text-xs"
                      />
                      {c.key === columns[0].key && errs && (
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {errs.map((msg, j) => (
                            <li key={j} className="text-xs whitespace-nowrap text-destructive">{msg}</li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="align-top">
                    <Button
                      variant="destructive-ghost"
                      size="sm"
                      onClick={() => removeRow(r.key)}
                      title="Remove row"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {extras}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
          {isSubmitting
            ? 'Creating…'
            : `Create ${validCount} ${entityLabel}${validCount === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}
