import { kstDateKey } from './kst'

// 로컬(기기 전용) 덱은 users.sheet_ids/user_analytics에 없다. 그래서 대시보드는
// `pending_local_sheet_created` 이벤트를 세어 시트·카드 수에 더한다.
//
// 그런데 로컬 덱은 사라지지 않고 **이사한다**: 로그인 후 백업이 성공하면
// `pending_local_sheet_flushed`가 찍히고 그 덱은 Drive 시트가 되어
// users.sheet_ids와 user_analytics에 들어간다. 생성 이벤트를 무조건 더하면 그
// 순간부터 같은 덱이 두 번 잡힌다(로컬 1 + Drive 1). 2026-08-16 기준 실제로
// gnr.nagyantal 사용자의 덱이 3개인데 4개로 표시됐고, 전체 합계도 시트 5개·
// 카드 78장이 부풀어 있었다.
//
// 그래서 기기별로 flush된 개수만큼 **가장 오래된 생성 이벤트부터** 제외한다.
// 이벤트에 로컬 덱 id가 없어 1:1로 짝지을 수 없기 때문인데, flushAll이 보류
// 목록을 삽입 순서대로 훑으므로 오래된 것부터 빠지는 게 실제 순서와 맞는다.
//
// 활성화 판정(firstCreatedAt, activatedOwnerIds)은 **제외하지 않는다**. 백업했다고
// "덱을 만든 적 없는 사용자"가 되지는 않으므로, 활성화 시각은 생성 이벤트 전체에서 뽑는다.
export interface VoicecardsLocalSheetRow {
  device_id: string | null
  created_at: string | null
  event_name?: string | null
  properties?: { card_count?: number | string } | null
}

export interface VoicecardsLocalAssets {
  sheets: number
  cards: number
  sheetsToday: number
  cardsToday: number
  firstCreatedAt: string | null
}

export const LOCAL_SHEET_CREATED_EVENT = 'pending_local_sheet_created'
export const LOCAL_SHEET_FLUSHED_EVENT = 'pending_local_sheet_flushed'
const DUPLICATE_CREATION_WINDOW_MS = 2_000

function ascendingByCreatedAt(a: VoicecardsLocalSheetRow, b: VoicecardsLocalSheetRow): number {
  return (a.created_at || '').localeCompare(b.created_at || '')
}

/**
 * 기기별 로컬 덱을 소유자별 시트·카드 수로 접는다.
 *
 * @param rows `pending_local_sheet_created` + `pending_local_sheet_flushed` 이벤트.
 *   event_name이 없는 행은 생성 이벤트로 본다(생성만 조회하던 이전 호출부 호환).
 * @param resolveOwnerId device_id → 집계 대상 소유자. 보이지 않는 기기는 null.
 * @param todayKst 오늘(KST) 날짜 키.
 */
export function buildVoicecardsLocalAssetMap(
  rows: VoicecardsLocalSheetRow[],
  resolveOwnerId: (deviceId: string) => string | null,
  todayKst: string,
): { assets: Map<string, VoicecardsLocalAssets>; activatedOwnerIds: Set<string> } {
  const createdByDevice = new Map<string, VoicecardsLocalSheetRow[]>()
  const flushedByDevice = new Map<string, number>()

  for (const row of rows || []) {
    if (!row?.device_id) continue
    if (row.event_name === LOCAL_SHEET_FLUSHED_EVENT) {
      flushedByDevice.set(row.device_id, (flushedByDevice.get(row.device_id) || 0) + 1)
      continue
    }
    const list = createdByDevice.get(row.device_id)
    if (list) list.push(row)
    else createdByDevice.set(row.device_id, [row])
  }

  const assets = new Map<string, VoicecardsLocalAssets>()
  const activatedOwnerIds = new Set<string>()

  for (const [deviceId, created] of createdByDevice) {
    const ownerId = resolveOwnerId(deviceId)
    if (!ownerId) continue

    created.sort(ascendingByCreatedAt)
    const uniqueCreated = created.filter((row, index) => {
      const previous = created[index - 1]
      if (!previous?.created_at || !row.created_at) return true
      const elapsedMs = new Date(row.created_at).getTime() - new Date(previous.created_at).getTime()
      return elapsedMs > DUPLICATE_CREATION_WINDOW_MS
        || Number(row.properties?.card_count) !== Number(previous.properties?.card_count)
    })
    const stillLocalFrom = Math.min(flushedByDevice.get(deviceId) || 0, uniqueCreated.length)

    for (let i = 0; i < uniqueCreated.length; i++) {
      const row = uniqueCreated[i]
      // 활성화는 백업 여부와 무관하다 — flush된 덱도 "덱을 만든 시점"을 남긴다.
      activatedOwnerIds.add(ownerId)
      const prev = assets.get(ownerId) || {
        sheets: 0, cards: 0, sheetsToday: 0, cardsToday: 0, firstCreatedAt: null as string | null,
      }
      const firstCreatedAt = !prev.firstCreatedAt
        || (!!row.created_at && row.created_at < prev.firstCreatedAt)
        ? row.created_at || prev.firstCreatedAt
        : prev.firstCreatedAt

      if (i < stillLocalFrom) {
        // Drive로 옮겨간 덱. sheet_ids/user_analytics가 이미 세고 있으므로 더하지 않는다.
        assets.set(ownerId, { ...prev, firstCreatedAt })
        continue
      }

      const cardCount = Math.max(0, Number(row.properties?.card_count) || 0)
      const isToday = !!row.created_at && kstDateKey(row.created_at) === todayKst
      assets.set(ownerId, {
        sheets: prev.sheets + 1,
        cards: prev.cards + cardCount,
        sheetsToday: prev.sheetsToday + (isToday ? 1 : 0),
        cardsToday: prev.cardsToday + (isToday ? cardCount : 0),
        firstCreatedAt,
      })
    }
  }

  return { assets, activatedOwnerIds }
}
