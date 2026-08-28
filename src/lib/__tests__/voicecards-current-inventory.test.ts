import assert from 'node:assert/strict'
import test from 'node:test'

async function loadInventoryHelpers() {
  return import('../voicecards-current-inventory').catch(() => ({} as Record<string, unknown>))
}

test('current card inventory excludes analytics rows for deleted sheets', async () => {
  const helpers = await loadInventoryHelpers()
  assert.equal(typeof helpers.buildVoicecardsCurrentCardMaps, 'function')

  const buildMaps = helpers.buildVoicecardsCurrentCardMaps as (
    users: Array<{ user_id: string; sheet_ids: string[] | null }>,
    analytics: Array<{ user_id: string; sheet_id: string | null; total_cards: number | null }>,
  ) => { cards: Map<string, number>; ownCards: Map<string, number> }

  const inventory = buildMaps(
    [{ user_id: 'juyearrr', sheet_ids: ['talkfile-75'] }],
    [
      { user_id: 'juyearrr', sheet_id: 'mint', total_cards: 1 },
      { user_id: 'juyearrr', sheet_id: 'grammar-21-a', total_cards: 21 },
      { user_id: 'juyearrr', sheet_id: 'grammar-21-b', total_cards: 21 },
      { user_id: 'juyearrr', sheet_id: 'grammar-41', total_cards: 41 },
      { user_id: 'juyearrr', sheet_id: 'talkfile-35', total_cards: 35 },
      { user_id: 'juyearrr', sheet_id: 'talkfile-60', total_cards: 60 },
      { user_id: 'juyearrr', sheet_id: 'talkfile-75', total_cards: 75 },
    ],
  )

  assert.equal(inventory.cards.get('juyearrr'), 75)
  assert.equal(inventory.ownCards.get('juyearrr'), 75)
})
