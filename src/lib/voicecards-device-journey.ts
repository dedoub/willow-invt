export interface VoicecardsDeviceJourneyRow {
  device_id: string | null
  user_id: string | null
  first_seen_at: string | null
  last_seen_at: string | null
  platform: string | null
  app_version: string | null
  locale: string | null
  country: string | null
  active_days_7d: number | null
}

export interface VoicecardsDeviceJourneyMeta {
  deviceId: string
  firstSeenAt: string | null
  lastSeenAt: string | null
  platform: string | null
  appVersion: string | null
  locale: string | null
  country: string | null
  activeDays7d: number
}

// Next의 persistent unstable_cache는 배포 사이에도 남을 수 있어 응답 스키마 변경 시 키를 올린다.
export const VOICECARDS_USER_STATS_CACHE_KEY = 'voicecards-user-stats-v4'

export interface VoicecardsLearningActivationUser {
  id: string
  createdAt?: string | null
  installedAt?: string | null
  activatedAt?: string | null
  sheetCount: number
  cards: number
  ownCards?: number
  flips?: number
}

export function voicecardsLearningActivationDate(user: VoicecardsLearningActivationUser) {
  const activated = user.sheetCount > 0
    || (user.ownCards ?? user.cards) > 0
    || (user.flips ?? 0) > 0
  if (!activated) return null

  return user.activatedAt || user.createdAt || user.installedAt || null
}

export function voicecardsLocalActivationOwnerId(
  event: { device_id: string | null; user_id: string | null },
  mergedDeviceOwners: ReadonlyMap<string, string>,
) {
  if (event.user_id) return mergedDeviceOwners.get(event.user_id) || event.user_id
  if (!event.device_id) return null
  const deviceAccountId = `device:${event.device_id}`
  return mergedDeviceOwners.get(deviceAccountId) || deviceAccountId
}

export function diffVoicecardsActivationIds(
  knownIds: string[],
  activeIds: string[],
  deviceBaselineInitialized: boolean,
) {
  const known = new Set(knownIds)
  if (!deviceBaselineInitialized) {
    for (const id of activeIds) {
      if (id.startsWith('device:')) known.add(id)
    }
  }

  const freshIds = activeIds.filter(id => !known.has(id))
  return {
    freshIds,
    nextKnownIds: Array.from(new Set([...known, ...activeIds])),
  }
}

export function expandVoicecardsKnownActivationIds(
  knownIds: string[],
  mergedDeviceOwners: ReadonlyMap<string, string>,
) {
  const expanded = new Set(knownIds)
  for (const id of knownIds) {
    const mergedOwner = mergedDeviceOwners.get(id)
    if (mergedOwner) expanded.add(mergedOwner)
  }
  return Array.from(expanded)
}

export function voicecardsJourneyOwnerId(row: Pick<VoicecardsDeviceJourneyRow, 'device_id' | 'user_id'>) {
  return row.user_id || (row.device_id ? `device:${row.device_id}` : null)
}

export function buildVoicecardsJourneyMetaMap(rows: VoicecardsDeviceJourneyRow[]) {
  const result = new Map<string, VoicecardsDeviceJourneyMeta>()

  for (const row of rows) {
    const ownerId = voicecardsJourneyOwnerId(row)
    if (!ownerId || !row.device_id) continue

    const previous = result.get(ownerId)
    if (!previous) {
      result.set(ownerId, {
        deviceId: row.device_id,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        platform: row.platform,
        appVersion: row.app_version,
        locale: row.locale,
        country: row.country,
        activeDays7d: Number(row.active_days_7d) || 0,
      })
      continue
    }

    const firstSeenAt = !previous.firstSeenAt || (row.first_seen_at && row.first_seen_at < previous.firstSeenAt)
      ? row.first_seen_at
      : previous.firstSeenAt
    const rowIsLatest = !previous.lastSeenAt || !!row.last_seen_at && row.last_seen_at >= previous.lastSeenAt

    result.set(ownerId, {
      deviceId: rowIsLatest ? row.device_id : previous.deviceId,
      firstSeenAt,
      lastSeenAt: rowIsLatest ? row.last_seen_at : previous.lastSeenAt,
      platform: rowIsLatest ? row.platform || previous.platform : previous.platform,
      appVersion: rowIsLatest ? row.app_version || previous.appVersion : previous.appVersion,
      locale: rowIsLatest ? row.locale || previous.locale : previous.locale,
      country: rowIsLatest ? row.country || previous.country : previous.country,
      activeDays7d: Math.max(previous.activeDays7d, Number(row.active_days_7d) || 0),
    })
  }

  return result
}

export function voicecardsDeviceDisplayName(id: string) {
  const rawId = id.startsWith('device:')
    ? id.slice('device:'.length)
    : id.startsWith('dev:')
      ? id.slice('dev:'.length)
      : id
  return `#${rawId.replace(/-/g, '').slice(0, 4) || '????'}`
}
