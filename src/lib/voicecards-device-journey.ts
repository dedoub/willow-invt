export interface VoicecardsDeviceJourneyRow {
  device_id: string | null
  user_id: string | null
  first_seen_at: string | null
  last_seen_at: string | null
  platform: string | null
  app_version: string | null
  locale: string | null
  country: string | null
}

export interface VoicecardsDeviceJourneyMeta {
  deviceId: string
  firstSeenAt: string | null
  lastSeenAt: string | null
  platform: string | null
  appVersion: string | null
  locale: string | null
  country: string | null
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
