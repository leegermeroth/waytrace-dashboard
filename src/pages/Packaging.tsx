import { CollectionsIndex } from '@/components/CollectionsIndex'

/**
 * Packaging — Enterprise asset collections of type='product'. Each collection
 * is a packaging program (e.g. "2026 Packaging"); each asset inside is one SKU
 * carrying one persistent short link. Shares the list page (and the whole
 * collection engine) with Team Cards — see CollectionsIndex.
 */
export default function Packaging() {
  return (
    <CollectionsIndex
      type="product"
      basePath="/dashboard/packaging"
      title="Packaging"
      description="Collections of SKUs, each carrying a persistent short link. Print once — retarget the destination any time, and read per-SKU results in GA4."
      emptyText="No packaging collections yet. Create one, then import your SKUs from a CSV."
      countHeader="SKUs"
      dialogTitle="New packaging collection"
      dialogDescription="A collection groups the SKUs of one packaging program. Its links are stamped with the workspace's domain."
      namePlaceholder="2026 Packaging"
      deleteConfirm={(col) =>
        `Delete "${col.name}"? All ${col.asset_count ?? 0} of its short links stop resolving immediately — printed QR codes will break.`
      }
    />
  )
}
