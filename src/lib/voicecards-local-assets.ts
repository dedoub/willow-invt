import { kstDateKey } from './kst'

// 로컬(기기 전용) 덱은 users.sheet_ids/user_analytics에 없다. 그래서 대시보드는
// 앱이 보내는 신호로 따로 세야 한다.
//
// 원래는 `pending_local_sheet_created` 생성 이벤트를 누적해서 셌다. 그런데 생성
// 이벤트는 "만든 적 있다"는 이력이지 "지금 갖고 있다"가 아니다. 덱 삭제와 앱
// 재설치는 이벤트를 남기지 않으므로, 누적값은 한 번 올라가면 절대 내려오지
// 않는다 — 대시보드가 보유량을 영구히 부풀렸다 (2026-09-04).
//
// 그래서 앱이 현재 로컬 덱·카드 수를 `local_library_snapshot`으로 보낸다. 스냅샷이
// 있으면 **그 값이 현재 보유량의 정본**이고, 그 이전 생성 이벤트는 버린다.
// 스냅샷을 보내지 않는 구버전 앱 기기만 예전 누적 방식으로 남는다.
//
// 앱 쪽 계약 (voice-cards `buildLocalLibrarySnapshot`):
//   deck_count/card_count는 **Drive가 아직 세지 않는 로컬 덱만** 담는다
//   (flushState !== 'flushed' 이고 driveSheetId가 sheet_ids에 없는 것).
//   그래서 대시보드는 이 값을 sheet_ids/user_analytics 위에 그냥 더하면 된다.
//
// 스냅샷 이전 시대의 flush 처리(아래 flushed 차감)는 그대로 둔다: 로컬 덱은
// 사라지지 않고 **이사한다**. 로그인 후 백업이 성공하면
// `pending_local_sheet_flushed`가 찍히고 그 덱은 Drive 시트가 되어
// users.sheet_ids와 user_analytics에 들어간다. 생성 이벤트를 무조건 더하면 그
// 순간부터 같은 덱이 두 번 잡힌다(로컬 1 + Drive 1). 2026-08-16 기준 실제로
// gnr.nagyantal 사용자의 덱이 3개인데 4개로 표시됐고, 전체 합계도 시트 5개·
// 카드 78장이 부풀어 있었다.
//
// 활성화 판정(firstCreatedAt, activatedOwnerIds)은 **보유량과 무관하다**. 백업했다고,
// 지웠다고 "덱을 만든 적 없는 사용자"가 되지는 않으므로 생성 이벤트 전체에서 뽑는다.
//
// 반면 "오늘 증가분"은 활동량이 아니라 **이 모듈이 지금 더하고 있는 덱** 중 오늘 것이다.
// 오늘 만들어 오늘 백업한 덱을 여기서 세면 Drive 쪽 오늘치와 겹쳐 두 번 잡힌다.
export interface VoicecardsLocalSheetRow {
  device_id: string | null
  created_at: string | null
  event_name?: string | null
  properties?: { card_count?: number | string; deck_count?: number | string } | null
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
export const LOCAL_LIBRARY_SNAPSHOT_EVENT = 'local_library_snapshot'
const DUPLICATE_CREATION_WINDOW_MS = 2_000

function ascendingByCreatedAt(a: VoicecardsLocalSheetRow, b: VoicecardsLocalSheetRow): number {
  return (a.created_at || '').localeCompare(b.created_at || '')
}

function cardCountOf(row: VoicecardsLocalSheetRow): number {
  return Math.max(0, Number(row.properties?.card_count) || 0)
}

/**
 * 같은 덱 하나가 텔레메트리에서 두 번 찍힌 경우를 접는다. 이벤트에 로컬 덱 id가
 * 없어 2초 안에 같은 card_count로 들어온 것을 재전송으로 본다.
 */
function dedupeCreations(created: VoicecardsLocalSheetRow[]): VoicecardsLocalSheetRow[] {
  return created.filter((row, index) => {
    const previous = created[index - 1]
    if (!previous?.created_at || !row.created_at) return true
    const elapsedMs = new Date(row.created_at).getTime() - new Date(previous.created_at).getTime()
    return elapsedMs > DUPLICATE_CREATION_WINDOW_MS
      || Number(row.properties?.card_count) !== Number(previous.properties?.card_count)
  })
}

/**
 * 기기별 로컬 덱을 소유자별 시트·카드 수로 접는다.
 *
 * @param rows `pending_local_sheet_created` + `pending_local_sheet_flushed`
 *   + `local_library_snapshot` 이벤트.
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
  const flushedByDevice = new Map<string, VoicecardsLocalSheetRow[]>()
  const snapshotByDevice = new Map<string, VoicecardsLocalSheetRow>()

  for (const row of rows || []) {
    if (!row?.device_id) continue
    if (row.event_name === LOCAL_SHEET_FLUSHED_EVENT) {
      const list = flushedByDevice.get(row.device_id)
      if (list) list.push(row)
      else flushedByDevice.set(row.device_id, [row])
      continue
    }
    if (row.event_name === LOCAL_LIBRARY_SNAPSHOT_EVENT) {
      const seen = snapshotByDevice.get(row.device_id)
      if (!seen || (row.created_at || '') > (seen.created_at || '')) {
        snapshotByDevice.set(row.device_id, row)
      }
      continue
    }
    const list = createdByDevice.get(row.device_id)
    if (list) list.push(row)
    else createdByDevice.set(row.device_id, [row])
  }

  const assets = new Map<string, VoicecardsLocalAssets>()
  const activatedOwnerIds = new Set<string>()

  const devices = new Set([...createdByDevice.keys(), ...snapshotByDevice.keys()])
  for (const deviceId of devices) {
    const ownerId = resolveOwnerId(deviceId)
    if (!ownerId) continue

    const created = (createdByDevice.get(deviceId) || []).slice().sort(ascendingByCreatedAt)
    const uniqueCreated = dedupeCreations(created)
    const snapshot = snapshotByDevice.get(deviceId)

    let sheets = 0
    let cards = 0
    // 지금 보유 중이라고 보는 생성 이벤트들. "오늘 증가분"은 여기서만 뽑는다.
    let heldCreations: VoicecardsLocalSheetRow[] = []
    if (snapshot) {
      // 스냅샷이 현재 상태의 정본. 그 이전 생성 이벤트는 삭제·재설치를 못 담으므로 버린다.
      sheets = Math.max(0, Number(snapshot.properties?.deck_count) || 0)
      cards = Math.max(0, Number(snapshot.properties?.card_count) || 0)

      // 스냅샷은 변경마다 나가지만 전송이 실패할 수 있다. 스냅샷 **이후** 생성분만
      // 복구로 더한다 — 이전 것은 버린 채라 삭제 반영은 그대로 남는다.
      const since = snapshot.created_at || ''
      const laterCreated = uniqueCreated.filter(row => (row.created_at || '') > since)
      const laterFlushed = (flushedByDevice.get(deviceId) || [])
        .filter(row => (row.created_at || '') > since).length
      // 스냅샷 직후 백업된 덱은 sheet_ids가 이미 세고 있다. 오래된 것부터 뺀다.
      for (let i = laterFlushed; i < laterCreated.length; i++) {
        sheets += 1
        cards += cardCountOf(laterCreated[i])
      }
      // 스냅샷은 "지금 N개"만 말하고 그게 어느 생성분인지는 말하지 않는다.
      // 남아 있을 가능성이 큰 최근 N개를 보유분으로 본다 — 오늘 증가분 판정에만 쓴다.
      heldCreations = sheets > 0 ? uniqueCreated.slice(-sheets) : []
    } else {
      // 구버전 앱 기기: 예전 누적 방식 그대로. flush된 개수만큼 오래된 생성부터 제외한다.
      // 이벤트에 로컬 덱 id가 없어 1:1로 짝지을 수 없는데, flushAll이 보류 목록을
      // 삽입 순서대로 훑으므로 오래된 것부터 빠지는 게 실제 순서와 맞는다.
      const flushedCount = Math.min((flushedByDevice.get(deviceId) || []).length, uniqueCreated.length)
      heldCreations = uniqueCreated.slice(flushedCount)
      for (const row of heldCreations) {
        sheets += 1
        cards += cardCountOf(row)
      }
    }

    // 활성화는 지금 갖고 있는지와 무관하므로 생성 이벤트 전체에서 뽑는다.
    let firstCreatedAt: string | null = null
    for (const row of uniqueCreated) {
      activatedOwnerIds.add(ownerId)
      if (!firstCreatedAt || (!!row.created_at && row.created_at < firstCreatedAt)) {
        firstCreatedAt = row.created_at || firstCreatedAt
      }
    }

    let sheetsToday = 0
    let cardsToday = 0
    for (const row of heldCreations) {
      if (row.created_at && kstDateKey(row.created_at) === todayKst) {
        sheetsToday += 1
        cardsToday += cardCountOf(row)
      }
    }

    const prev = assets.get(ownerId)
    if (!prev) {
      assets.set(ownerId, { sheets, cards, sheetsToday, cardsToday, firstCreatedAt })
      continue
    }
    // 한 소유자가 기기를 여러 대 쓰면 기기별 기여를 합친다.
    assets.set(ownerId, {
      sheets: prev.sheets + sheets,
      cards: prev.cards + cards,
      sheetsToday: prev.sheetsToday + sheetsToday,
      cardsToday: prev.cardsToday + cardsToday,
      firstCreatedAt: !prev.firstCreatedAt || (!!firstCreatedAt && firstCreatedAt < prev.firstCreatedAt)
        ? firstCreatedAt || prev.firstCreatedAt
        : prev.firstCreatedAt,
    })
  }

  return { assets, activatedOwnerIds }
}
