export interface VoicecardsInventoryUser {
  user_id: string
  sheet_ids: string[] | null
}

export interface VoicecardsInventoryAnalyticsRow {
  user_id: string
  sheet_id: string | null
  total_cards: number | null
}

export function buildVoicecardsCurrentCardMaps(
  users: VoicecardsInventoryUser[],
  analytics: VoicecardsInventoryAnalyticsRow[],
): { cards: Map<string, number>; ownCards: Map<string, number> } {
  const currentSheetsByUser = new Map(
    users.map(user => [user.user_id, new Set(user.sheet_ids || [])]),
  )
  const cards = new Map<string, number>()
  const ownCards = new Map<string, number>()

  for (const row of analytics) {
    if (!row.sheet_id || !currentSheetsByUser.get(row.user_id)?.has(row.sheet_id)) continue
    const count = Number(row.total_cards) || 0
    cards.set(row.user_id, (cards.get(row.user_id) || 0) + count)
    if (!row.sheet_id.startsWith('demo-')) {
      ownCards.set(row.user_id, (ownCards.get(row.user_id) || 0) + count)
    }
  }

  return { cards, ownCards }
}
