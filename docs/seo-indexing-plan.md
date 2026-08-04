# 색인 요청 계획 (데일리 팔로우업)

GSC 수동 색인 요청의 대기열·일일 배치·실행 기록을 관리하는 운영 문서.
현황·진단·해석은 [seo-indexing.md](seo-indexing.md)에, 이 문서는 "오늘 뭘 요청하나"만 다룬다.

## 규칙

- 색인 요청 할당량은 **계정 단위 하루 약 11~12건**으로 합산된다 (2026-08-03 실측:
  보이스카드 8건 + 리뷰노트 3건 = 11건째까지 성공, 12건째 Quota Exceeded).
  프로퍼티를 나눠도 늘어나지 않으므로 하루 예산을 사이트 간 배분해야 한다.
- 우선순위 원칙: ① 허브(하위 페이지의 크롤 경로) ② unknown(구글이 모름) ③ 수요 있는 코어
  ④ Discovered 정체가 오래된 순. '크롤 후 미색인'은 요청해도 안 풀리므로 넣지 않는다.
- 같은 URL 재요청은 큐 순서를 바꾸지 않는다. 요청 후 1주일간 상태 이동이 없을 때만 재검토.
- 요청 전 반드시 당일 스냅샷(`seo_index_status`, 매일 06:40 KST 수집)으로 상태를 확인하고,
  이미 색인된 URL은 건너뛰고 대기열 다음 항목으로 채운다.

## 실행 프로토콜 (어느 세션이든 동일)

1. 당일 스냅샷 확인: 아래 SQL로 어제 요청분의 상태 이동 점검 (프로젝트 `axcfvieqsaphhvbkyzzv`)

   ```sql
   select site_key, path, coverage_state, is_indexed from seo_index_status
   where checked_on = current_date and path = any(<어제 요청 경로들>);
   ```

2. 오늘 배치 선정: 아래 대기열 최상단부터 11건. 이미 색인된 항목은 건너뜀.
3. Claude in Chrome으로 GSC URL Inspection → 각 URL 검사 → "Request indexing" 클릭 →
   "Indexing requested" 확인. 프로퍼티: 보이스카드 `sc-domain:voicecards.quest`,
   리뷰노트 `https://reviewnotes.app/` (URL-prefix. 도메인 프로퍼티 아님).
   Quota Exceeded가 뜨면 그날은 중단.
4. 이 문서의 로그 표와 대기열 갱신, seo-indexing.md 조치 이력에 한 줄 추가.

## 대기열

### 보이스카드 독일어권 (신규 클러스터, 최우선)

2026-08-04 배포. 84 URL(허브2 × 7로케일 + 덱10 × 7로케일) 전부 unknown이다.
허브부터 넣는다 — 어제 bible·quran 허브가 요청 하루 만에 색인된 패턴을 따른다.
나머지 로케일 허브(ru·uk·pl·it·vi)와 덱 페이지는 허브 색인 후 자연 크롤을 기다린다.

1. `/templates/einbuergerungstest` (EN 허브)
2. `/templates/deutsch-a1` (EN 허브)
3. `/de/templates/einbuergerungstest` (de 허브 — 이 클러스터의 헤드텀 언어)
4. `/de/templates/deutsch-a1` (de 허브)

### 리뷰노트 (연습문제 16건)

모두 `https://reviewnotes.app/en/practice/` 하위. 허브는 색인됐는데 하위가 전부 unknown이라 개별 요청.

1. `linear-system`
2. `factor-trinomial`
3. `grade-4-multiplication`
4. `grade-4-large-numbers`
5. `grade-4-angles`
6. `grade-4-bar-graph`
7. `grade-4-rules`
8. `grade-4-transformations`
9. `grade-4-2-decimals`
10. `grade-4-2-fractions`
11. `grade-4-2-line-graphs`
12. `grade-4-2-polygons`
13. `grade-4-2-quadrilaterals`
14. `grade-4-2-triangles`
15. `grade-5-fractions`
16. `grade-5-number-operations`

### 보이스카드 (리뷰노트 소진 후)

08-03 요청 8건(bible·quran 허브, 코어 3, 잔여 3)의 상태 이동을 본 뒤 선정한다. 후보 순서:

- bible·quran 허브가 색인되면: 수요 큰 권/수라 개별 페이지는 요청하지 않고 허브 크롤을 기다린다
  (시민권 패턴: 허브 색인 → 하위 자연 유입)
- 학습법 Discovered 정체분: `active-recall`, `chunking-translation`, `daily-five`,
  `finish-date-pacing`, `spoken-rehearsal`, `two-way-recall`
- 리뷰노트 unknown 잔여: `/en/demo`, `/en/guides/assign-problems-without-student-accounts`,
  `/en/templates/mistake-notebook`

## 일자별 계획

| 날짜 | 배치 | 상태 |
|---|---|---|
| 08-03 | VC 8건(허브2·코어3·잔여3) + RN 3건(pythagorean, quadratic-formula, linear-function) | ✅ 11건 완료, 12건째 quota |
| 08-04 | VC 독일어권 허브 4 + RN 대기열 1~7 | ❌ 첫 요청부터 Quota Exceeded — 0건 |
| 08-05 | VC 독일어권 허브 4 + RN 대기열 1~7 (08-04 미집행분) | 예정 |
| 08-06 | RN 대기열 8~16 + 스냅샷 보고 잔여 선정 | 예정 |
| 08-06~ | 스냅샷 기준 재평가. 요청분이 색인으로 넘어가는 속도를 보고 계속/중단 결정 | - |

## 팔로우업 로그

| 날짜 | 요청 | 결과 | 전일 요청분 상태 이동 |
|---|---|---|---|
| 08-03 | VC 8 + RN 3 | 11건 등록, quota 도달 | (첫 배치) 07-30 시민권 8건 중 3건 색인 확인 |
| 08-04 | 0건 (VC `/templates/einbuergerungstest` 시도 → Quota Exceeded) | ❌ 할당량 미회복. 08-03 배치가 늦게 돌아 24h 창이 안 넘어간 것으로 보임 — 다음 배치는 시각을 앞당길 것 | 08-03 요청분 확인: bible·quran 허브 + RN 3건(pythagorean·quadratic-formula·linear-function) **전부 Submitted and indexed** |
