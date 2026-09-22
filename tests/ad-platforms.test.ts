import assert from 'node:assert/strict'
import test from 'node:test'

import {
  advancedCampaignTypes,
  findPlatform,
  isAdTrackingLink,
  isMacroAllowed,
  macroLabel,
  offerableMacros,
  presetFor,
  primaryCampaignTypes,
} from '../src/lib/adPlatformRules.ts'

/**
 * Ad Tracking Links — the client-side registry rules.
 *
 * These mirror the Worker's macro-compatibility predicates. The Worker stays
 * authoritative (it re-validates on save), so drift here can only make the UI
 * offer something the server then refuses — annoying rather than dangerous.
 * These pin the cases that would drift silently, especially Google's campaign
 * type rules, where the two mechanisms (per-macro allowlist vs per-type
 * denylist) are easy to conflate.
 */

// A miniature registry in the shape GET /api/v1/ad-platforms returns.
const meta = {
  id: 'meta' as const,
  label: 'Meta Ads',
  macro_syntax: 'double_brace' as const,
  verified_at: '2026-09-16',
  instructions: '',
  macros: [
    { id: 'campaign_id', syntax: '{{campaign.id}}', label: 'Campaign ID', description: '', kind: 'id' as const, recommended: true },
    { id: 'ad_name', syntax: '{{ad.name}}', label: 'Ad name', description: '', kind: 'name' as const, recommended: true, warning: 'renames' },
  ],
  outputs: [],
  presets: { default: [{ key: 'utm_id', value: '{{campaign.id}}', type: 'platform_dynamic' as const, macro: 'campaign_id', enabled: true }] },
}

const google = {
  id: 'google' as const,
  label: 'Google Ads',
  macro_syntax: 'single_brace' as const,
  verified_at: '2026-09-16',
  instructions: '',
  campaign_types: [
    { id: 'search', label: 'Search', advanced: false, unsupported_macros: [] },
    { id: 'demand_gen', label: 'Demand Gen', advanced: false, unsupported_macros: ['network', 'keyword', 'placement'] },
    { id: 'performance_max', label: 'Performance Max', advanced: false, unsupported_macros: [] },
    { id: 'hotel', label: 'Hotel / Travel', advanced: true, unsupported_macros: [] },
  ],
  macros: [
    { id: 'campaignid', syntax: '{campaignid}', label: 'Campaign ID', description: '', kind: 'id' as const, recommended: true },
    { id: 'network', syntax: '{network}', label: 'Network', description: '', kind: 'context' as const, recommended: true },
    { id: 'keyword', syntax: '{keyword}', label: 'Keyword', description: '', kind: 'context' as const, recommended: false },
    { id: 'assetgroupid', syntax: '{assetgroupid}', label: 'Asset group ID', description: '', kind: 'id' as const, recommended: true, campaign_types: ['performance_max'] },
    { id: 'hotel_id', syntax: '{hotel_id}', label: 'Hotel ID', description: '', kind: 'context' as const, recommended: false, campaign_types: ['hotel'] },
  ],
  outputs: [],
  presets: {
    search: [{ key: 'wt_network', value: '{network}', type: 'platform_dynamic' as const, macro: 'network', enabled: true }],
    demand_gen: [],
  },
}

test('a platform without campaign types ignores the campaign type entirely', () => {
  for (const type of [null, 'search', 'anything']) {
    assert.equal(isMacroAllowed(meta, meta.macros[0], type), true)
  }
})

test('Demand Gen excludes the macros Google documents as unsupported', () => {
  for (const id of ['network', 'keyword']) {
    const macro = google.macros.find((m) => m.id === id)!
    assert.equal(isMacroAllowed(google, macro, 'demand_gen'), false, `${id} must be excluded`)
    // …and the same macro stays available for Search.
    assert.equal(isMacroAllowed(google, macro, 'search'), true, `${id} must be offered for Search`)
  }
})

test('a campaign-type-specific macro is offered only for its own type', () => {
  const assetGroup = google.macros.find((m) => m.id === 'assetgroupid')!
  assert.equal(isMacroAllowed(google, assetGroup, 'performance_max'), true)
  assert.equal(isMacroAllowed(google, assetGroup, 'search'), false)
  assert.equal(isMacroAllowed(google, assetGroup, null), false)
})

test('offerableMacros filters by both mechanisms at once', () => {
  const search = offerableMacros(google, 'search').map((m) => m.id)
  assert.deepEqual(search.sort(), ['campaignid', 'keyword', 'network'])

  const demandGen = offerableMacros(google, 'demand_gen').map((m) => m.id)
  assert.deepEqual(demandGen, ['campaignid'], 'denylist and allowlist both applied')

  const pmax = offerableMacros(google, 'performance_max').map((m) => m.id)
  assert.ok(pmax.includes('assetgroupid'))
  assert.ok(!pmax.includes('hotel_id'))
})

test('presetFor reads the campaign-type key, and "default" for typeless platforms', () => {
  assert.equal(presetFor(google, 'search')[0].macro, 'network')
  assert.deepEqual(presetFor(google, 'demand_gen'), [])
  assert.equal(presetFor(meta, null)[0].macro, 'campaign_id')
})

test('presetFor returns a clone, so editing the form cannot mutate the cached registry', () => {
  const first = presetFor(meta, null)
  first[0].key = 'mutated'
  first.push({ key: 'extra', value: 'x', type: 'static', enabled: true })

  assert.equal(presetFor(meta, null)[0].key, 'utm_id')
  assert.equal(presetFor(meta, null).length, 1)
})

test('an unknown campaign type yields no preset rather than throwing', () => {
  assert.deepEqual(presetFor(google, 'nope'), [])
})

test('campaign types split into primary and advanced', () => {
  assert.deepEqual(primaryCampaignTypes(google).map((t) => t.id), ['search', 'demand_gen', 'performance_max'])
  assert.deepEqual(advancedCampaignTypes(google).map((t) => t.id), ['hotel'])
  // Meta has none at all.
  assert.deepEqual(primaryCampaignTypes(meta), [])
})

test('findPlatform and macroLabel degrade gracefully', () => {
  assert.equal(findPlatform([meta, google], 'google')?.id, 'google')
  assert.equal(findPlatform([meta], 'google'), null)
  assert.equal(findPlatform([meta], ''), null)

  assert.equal(macroLabel(meta, 'ad_name'), 'Ad name')
  assert.equal(macroLabel(meta, 'unknown_macro'), 'unknown_macro')
  assert.equal(macroLabel(meta, undefined), '')
})

test("isAdTrackingLink never conflates 'tracking' with 'ad_tracking'", () => {
  assert.equal(isAdTrackingLink({ link_type: 'ad_tracking' }), true)

  // The whole point: 'tracking' is an ORDINARY redirecting link that must keep
  // its short URL, QR code, and click counters. It is also a substring of
  // 'ad_tracking', which is why every comparison is strict equality.
  assert.equal(isAdTrackingLink({ link_type: 'tracking' }), false)
  assert.equal('ad_tracking'.includes('tracking'), true)

  assert.equal(isAdTrackingLink({ link_type: 'short' }), false)
  assert.equal(isAdTrackingLink({ link_type: '' }), false)
  assert.equal(isAdTrackingLink({ link_type: null }), false)
  assert.equal(isAdTrackingLink({}), false)
})

test('isAdTrackingLink is not fooled by near-miss values', () => {
  for (const value of ['Ad_Tracking', 'AD_TRACKING', 'ad-tracking', 'ad_tracking ', 'xad_tracking']) {
    assert.equal(isAdTrackingLink({ link_type: value }), false, `${value} must not match`)
  }
})
