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

// 학습 활성화 판정 — 퍼널 카드·사용자 표(헤더/셀/정렬)가 **모두** 이 함수를 쓴다.
// 예전에는 같은 식이 다섯 군데에 손으로 적혀 있었고, 그중 퍼널 헤드라인만
// voicecardsLearningActivationDate()를 통과해 "날짜가 있을 것"을 추가로 요구했다.
// 기기 계정은 createdAt이 ''이라 activatedAt·installedAt이 둘 다 비면 활성화인데도
// 여기서 떨어진다. 2026-09-07 실측으로는 활성화된 기기 계정 23개가 모두 journey 행을
// 가져 installedAt이 채워져 있어 실제 누락은 0건이었다 — 터지지 않은 함정이지 관측된
// 버그는 아니다. journey 행이 없는 기기가 활성화되는 순간 조용히 갈리므로 미리 끊는다.
export function isVoicecardsLearningActivated(user: VoicecardsLearningActivationUser) {
  return user.sheetCount > 0
    || (user.ownCards ?? user.cards) > 0
    || (user.flips ?? 0) > 0
}

// 활성화 시점. 활성화가 아니면 null, 활성화인데 어떤 날짜도 모르면 null —
// **활성화 여부 판정에는 쓰지 말 것**(그게 위 버그였다). 추이 축을 그릴 때만 쓴다.
export function voicecardsLearningActivationDate(user: VoicecardsLearningActivationUser) {
  if (!isVoicecardsLearningActivated(user)) return null

  return user.activatedAt || user.createdAt || user.installedAt || null
}

// 사용자 표의 행 종류. 표는 셋을 한 표로 합쳐 보여주고(같은 사람이 로그인 전후로
// 두 곳에 나뉘지 않게), 퍼널은 이 구분으로 각 칸의 모집단을 고른다.
//   구글 사용자   → users 행, 실제 구글 로그인
//   기기 계정     → users 행, 'device:<uuid>' (로그인 없이 크레딧을 쓰는 사용자)
//   익명 기기     → 계정 없는 기기, 클라에서 만든 합성 id 'dev:<uuid>'
export function isVoicecardsDeviceAccountRow(id: string) {
  return id.startsWith('device:')
}

export function isVoicecardsAnonDeviceRow(id: string) {
  return id.startsWith('dev:')
}

export function isVoicecardsGoogleUserRow(id: string) {
  return !isVoicecardsDeviceAccountRow(id) && !isVoicecardsAnonDeviceRow(id)
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
