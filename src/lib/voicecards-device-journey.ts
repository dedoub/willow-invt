import { kstDateKey } from './kst'

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
export const VOICECARDS_USER_STATS_CACHE_KEY = 'voicecards-user-stats-v8'

export interface VoicecardsAnonymousLearningRow {
  device_id: string | null
  user_id: string | null
  event_name: string | null
  created_at: string | null
  properties: Record<string, unknown> | null
}

export interface VoicecardsAnonymousLearningMetrics {
  flips: number
  attempts: number
  listens: number
  flipsToday: number
  attemptsToday: number
  listensToday: number
}

const VOICECARDS_LISTEN_EVENTS = new Set([
  'tts_played',
  'voice_preview_played',
  'device_tts_played',
])

export function buildVoicecardsAnonymousLearningMap(
  rows: VoicecardsAnonymousLearningRow[],
  deviceOwners: ReadonlyMap<string, string>,
  todayKst: string,
) {
  const result = new Map<string, VoicecardsAnonymousLearningMetrics>()

  for (const row of rows) {
    // user_id가 생긴 이후 이벤트는 로그인 사용자 롤업이 이미 집계한다.
    if (row.user_id || !row.device_id || !row.event_name) continue
    const ownerId = deviceOwners.get(row.device_id) || `device:${row.device_id}`
    const isAttempt = row.event_name === 'card_attempted'
    const isListen = VOICECARDS_LISTEN_EVENTS.has(row.event_name)
    const isFlip = row.event_name === 'card_flipped_manual'
      && !String(row.properties?.sheet_id || '').startsWith('demo-')
    if (!isAttempt && !isListen && !isFlip) continue

    const isToday = !!row.created_at && kstDateKey(row.created_at) === todayKst
    const previous = result.get(ownerId) || {
      flips: 0,
      attempts: 0,
      listens: 0,
      flipsToday: 0,
      attemptsToday: 0,
      listensToday: 0,
    }
    result.set(ownerId, {
      flips: previous.flips + Number(isFlip),
      attempts: previous.attempts + Number(isAttempt),
      listens: previous.listens + Number(isListen),
      flipsToday: previous.flipsToday + Number(isToday && isFlip),
      attemptsToday: previous.attemptsToday + Number(isToday && isAttempt),
      listensToday: previous.listensToday + Number(isToday && isListen),
    })
  }

  return result
}

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
    // Adding local/device activation reveals historical Google owners too.
    // Baseline the whole expanded snapshot once so migration does not alert them as new.
    for (const id of activeIds) known.add(id)
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

export function countVoicecardsDailyActivations(
  activeIds: Iterable<string>,
  activationDates: ReadonlyMap<string, string>,
  dateKey: string,
) {
  let count = 0
  for (const id of activeIds) {
    const activatedAt = activationDates.get(id)
    if (activatedAt && kstDateKey(activatedAt) === dateKey) count += 1
  }
  return count
}

export function voicecardsActivationDateFromEvidence(
  accountCreatedAt: string | null,
  evidenceDates: Iterable<string>,
) {
  let earliest: string | null = null
  let earliestMs = Number.POSITIVE_INFINITY

  for (const value of evidenceDates) {
    const valueMs = Date.parse(value)
    if (!Number.isFinite(valueMs) || valueMs >= earliestMs) continue
    earliest = value
    earliestMs = valueMs
  }

  return earliest || accountCreatedAt
}

export function buildVoicecardsAnalyticsActivationDateMap(
  rows: Array<{
    user_id: string
    total_cards: number | null
    sheet_id: string | null
    created_at: string | null
  }>,
  ownerId: (userId: string) => string = userId => userId,
) {
  const result = new Map<string, string>()

  for (const row of rows) {
    if ((Number(row.total_cards) || 0) <= 0) continue
    if (String(row.sheet_id || '').startsWith('demo-')) continue
    if (!row.created_at || !Number.isFinite(Date.parse(row.created_at))) continue

    const owner = ownerId(row.user_id)
    const previous = result.get(owner)
    if (!previous || row.created_at < previous) result.set(owner, row.created_at)
  }

  return result
}

export function voicecardsJourneyOwnerId(row: Pick<VoicecardsDeviceJourneyRow, 'device_id' | 'user_id'>) {
  return row.user_id || (row.device_id ? `device:${row.device_id}` : null)
}

export function voicecardsCanonicalOwnerId(
  ownerId: string,
  mergedDeviceOwners: ReadonlyMap<string, string>,
) {
  return mergedDeviceOwners.get(ownerId) || ownerId
}

export function buildVoicecardsJourneyMetaMap(
  rows: VoicecardsDeviceJourneyRow[],
  mergedDeviceOwners: ReadonlyMap<string, string> = new Map(),
) {
  const result = new Map<string, VoicecardsDeviceJourneyMeta>()

  for (const row of rows) {
    const rawOwnerId = voicecardsJourneyOwnerId(row)
    if (!rawOwnerId || !row.device_id) continue
    const ownerId = voicecardsCanonicalOwnerId(rawOwnerId, mergedDeviceOwners)

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
