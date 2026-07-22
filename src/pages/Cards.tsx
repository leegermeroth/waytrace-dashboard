import { CollectionsIndex } from '@/components/CollectionsIndex'

/**
 * Team Cards — Enterprise asset collections of type='person'. Each collection
 * is one team's card roster; each asset inside is one person carrying one
 * persistent short link (printed on cards / written to NFC chips) that either
 * serves a vCard or redirects to any URL. Shares the collection engine with
 * Packaging — see CollectionsIndex.
 */
export default function Cards() {
  return (
    <CollectionsIndex
      type="person"
      basePath="/dashboard/cards"
      title="Team Cards"
      description="Rosters of people, each carrying a persistent short link for business cards and NFC chips — served as a contact card (vCard) or redirected to any URL."
      emptyText="No card rosters yet. Create one, then import your team from a CSV."
      countHeader="People"
      dialogTitle="New card roster"
      dialogDescription="A roster groups one team's cards. Its links are stamped with the workspace's domain."
      namePlaceholder="Sales Team Cards"
      deleteConfirm={(col) =>
        `Delete "${col.name}"? All ${col.asset_count ?? 0} of its short links stop resolving immediately — printed cards and written NFC chips will break.`
      }
    />
  )
}
