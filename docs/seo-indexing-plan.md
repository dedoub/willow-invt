# 색인 요청 계획 (데일리 팔로우업)

GSC 수동 색인 요청의 대기열·일일 배치·실행 기록을 관리하는 운영 문서.
현황·진단·해석은 [seo-indexing.md](seo-indexing.md)에, 이 문서는 "오늘 뭘 요청하나"만 다룬다.

## 규칙

- 색인 요청 할당량은 **계정 단위 하루 약 11~12건**으로 합산된다 (2026-08-03 실측:
  보이스카드 8건 + 리뷰노트 3건 = 11건째까지 성공, 12건째 Quota Exceeded).
  프로퍼티를 나눠도 늘어나지 않으므로 하루 예산을 사이트 간 배분해야 한다.
- 우선순위 원칙: ① **영어 원본**(로케일 변형은 그 뒤) ② 허브(하위 페이지의 크롤 경로)
  ③ unknown(구글이 모름) ④ 수요 있는 코어 ⑤ Discovered 정체가 오래된 순.
  '크롤 후 미색인'은 요청해도 안 풀리므로 넣지 않는다.
- 같은 URL 재요청은 큐 순서를 바꾸지 않는다. 요청 후 1주일간 상태 이동이 없을 때만 재검토.
- 요청 전 반드시 당일 스냅샷(`seo_index_status`, 매일 06:40 KST 수집)으로 상태를 확인하고,
  이미 색인된 URL은 건너뛰고 대기열 다음 항목으로 채운다.

## 실행 프로토콜 (어느 세션이든 동일)

> 클로드 세션은 `seo-daily-indexing` 스킬로 진행한다. 아래 1~2단계는
> `node scripts/seo-daily-brief.mjs` 한 줄이 대신한다 — 전일 대비 증감, 신규 색인,
> 우선순위가 적용된 오늘 후보를 한 번에 낸다. 이 문서는 대기열과 로그(=상태)를
> 맡고, 절차는 스킬이 맡는다.

1. 당일 스냅샷 확인: 어제 요청분의 상태 이동 점검. 손으로 볼 때의 SQL
   (프로젝트 `axcfvieqsaphhvbkyzzv`)

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

> 08-05 경과: 이 클러스터가 스냅샷에 **0건**이라 브리프가 후보로 못 냈고, 그날 배치는
> 그다음 순위(CDL·RN)로 채워졌다. 원인은 스냅샷 스캔의 타임아웃이었다 — 아래
> "스냅샷 크론 중단" 참조. 같은 날 고쳐서 재실행했고 **84 URL 전부 추적에 들어왔다
> (전부 unknown)**. 08-06 배치부터 허브 4건이 후보 최상단으로 올라온다.

1. `/templates/einbuergerungstest` (EN 허브)
2. `/templates/deutsch-a1` (EN 허브)

de 허브(`/de/templates/einbuergerungstest`, `/de/templates/deutsch-a1`)는 처음에 3·4순위로
잡았다. 헤드텀이 독일어라 그쪽이 정본 같아 보여서였는데, EN 원본이 아직 unknown인 상태에서
번역본을 먼저 태우면 구글이 정본을 못 잡는다. EN 허브 색인 후 hreflang으로 따라오는지
먼저 본다 — 안 따라오면 그때 개별 요청한다.

### 리뷰노트 (연습문제 16건)

모두 `https://reviewnotes.app/en/practice/` 하위. 허브는 색인됐는데 하위가 전부 unknown이라 개별 요청.

1. `linear-system`
2. ~~`factor-trinomial`~~ (08-05 요청)
3. `grade-4-multiplication`
4. `grade-4-large-numbers`
5. `grade-4-angles`
6. `grade-4-bar-graph`
7. `grade-4-rules`
8. `grade-4-transformations`
9. ~~`grade-4-2-decimals`~~ (08-05 요청)
10. ~~`grade-4-2-fractions`~~ (08-05 요청)
11. ~~`grade-4-2-line-graphs`~~ (08-05 요청)
12. `grade-4-2-polygons`
13. `grade-4-2-quadrilaterals`
14. `grade-4-2-triangles`
15. `grade-5-fractions`
16. `grade-5-number-operations`

이 외 08-05에 `/en/demo`, `/en/guides/assign-problems-without-student-accounts` 요청 완료.
남은 unknown 잔여: `/en/templates/mistake-notebook`.

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
| 08-05 | VC 5(spoken-rehearsal + CDL 허브·하위 3) + RN 6(demo, guides 1, practice 4) | ✅ 11건 완료, quota 초과 없음. 계획했던 독일어권 허브는 스냅샷 누락으로 후보에 못 올라옴 |
| 08-06 | VC 5: `/methods/daily-five`, `/templates/deutsch-a1`, `/templates/einbuergerungstest`, `/methods/active-recall`, `/methods/chunking-translation` · RN 6: `/en/practice/` 하위 `grade-4-2-polygons`·`-quadrilaterals`·`-triangles`·`grade-4-angles`·`grade-4-bar-graph`·`grade-4-large-numbers` | 예정. 원본 우선 결정 반영분 — 브리프가 그대로 낸다 |
| 08-06~ | 스냅샷 기준 재평가. 요청분이 색인으로 넘어가는 속도를 보고 계속/중단 결정 | - |

## 스냅샷 크론 중단 (2026-08-05 발견·해결, 커밋 46d9a6d)

`seo_index_status`가 `checked_on=2026-08-04`(수집 08-03 21:42 UTC)에서 멈춰 있었다.
크론 설정 문제가 아니라 **함수 제한시간 초과**였다.

원인 사슬:
1. 08-04 독일어권 배포로 보이스카드 사이트맵이 217쪽 → 670쪽으로 늘었다(로케일 변형 포함).
2. 보이스카드는 `scanLocales: true`라 로케일 변형까지 전수 검사한다. 검사 대상이 3배가 됐다.
3. 실측 처리량이 10 워커에서 초당 1.2건이다. 기존 주석은 "호출당 1초"를 가정했지만 실제로는
   8초가 넘는다. 670쪽 = 약 560초 > `maxDuration` 300초 → 504.
4. 저장이 **전수 검사 후 일괄 upsert**였다. 죽으면 부분 결과조차 안 남아 그날 스냅샷이 0건.
   에러도 크론 로그에만 남으니 브리프는 하루 묵은 데이터로 조용히 계속 돌았다.

조치: `CONCURRENCY` 10 → 30 (실측 기준 분당 약 210건, GSC 분당 600건 제한 아래),
그리고 200건마다 중간 저장. 다음에 또 커져서 시간이 모자라도 거기까지는 남는다.

검증: 08-05 수동 실행에서 보이스카드 665쪽 전수를 161초에 완료(이전 560초 추정 → 504).
독일어권 84 URL 전부 추적에 들어왔고 전부 unknown이다.

교훈: **스냅샷 행수가 갑자기 줄거나 날짜가 안 넘어가면 사이트맵 증가부터 의심할 것.**
신규 클러스터 배포가 곧 스캔 시간 증가다.

### 복구 후 드러난 것 — 결정: 영어 원본 우선 (2026-08-05, 커밋 2c2ccbd)

추적이 217 → 665쪽으로 넓어지자 브리프 후보가 통째로 바뀌었다. **배치 11건이 전부
로케일 루트**(`/fr`, `/pt` unknown · `/es`, `/it`, `/ja` Discovered)로 찼다. 브리프가 얕은
경로를 허브로 보고 먼저 올리는데, depth 1인 로케일 루트가 depth 2인
`/templates/einbuergerungstest`를 앞섰기 때문이다.

**영어 원본을 먼저 태우기로 했다.** 근거 셋:

1. 로케일 루트 5개 중 `/es`·`/it`·`/ja`는 이미 Discovered다. 구글이 알고 있고 크롤
   우선순위를 안 준 상태라, 재요청이 큐 순서를 바꾸지 않는다(위 규칙). 독일어권 허브는
   전부 unknown이라 요청이 실제로 정보를 추가한다.
2. 허브 요청 → 하루 내 색인 → 하위 자연 크롤이 bible·quran·civics·cdl에서 네 번
   재현됐다. 로케일 루트에는 그 근거가 없다.
3. 원본 229쪽 중 185쪽이 아직 미색인이다. 원본이 안 잡힌 상태에서 번역본을 밀면 구글이
   정본을 못 잡는다. 원본 허브가 잡히면 hreflang으로 번역본에 길이 생긴다.

규칙에 박았으므로 브리프가 자동으로 이 순서를 낸다(`rank()`의 정렬키 1번). 곁가지로
드러난 것 둘도 같이 고쳤다.

- 허브 하위가 허브와 depth가 같아 알파벳순에 끼어들었다. `deutsch-a1` 하위 덱 3건이
  `einbuergerungstest` 허브를 배치 밖으로 밀어냈다 — 허브를 다 넣고 하위를 넣는다.
- 로케일 루트만 내리는 중간안은 안 통한다. `/de/faq` 같은 depth 1 로케일 코어가 그
  자리를 그대로 물려받는다. 로케일은 통째로 뒤여야 한다.

수동 실행 (시크릿은 `.env.local`의 `CRON_SECRET`, 프로덕션과 동일):
```
curl -H "Authorization: Bearer <CRON_SECRET>" \
  "https://willow-invt.vercel.app/api/cron/seo-index-scan?site=voicecards"
```
> 쿼리스트링 `?secret=`으로 넘기면 401이 날 수 있다 — 시크릿에 URL 위험 문자가 있어서다.
> 헤더로 넘기거나 `curl --data-urlencode`를 쓸 것. `vercel env pull`은 이 값을 마스킹해서
> 내려주니(`""`) 그 파일로는 복구가 안 된다.

## 팔로우업 로그

| 날짜 | 요청 | 결과 | 전일 요청분 상태 이동 |
|---|---|---|---|
| 08-03 | VC 8 + RN 3 | 11건 등록, quota 도달 | (첫 배치) 07-30 시민권 8건 중 3건 색인 확인 |
| 08-04 | 0건 (VC `/templates/einbuergerungstest` 시도 → Quota Exceeded) | ❌ 할당량 미회복. 08-03 배치가 늦게 돌아 24h 창이 안 넘어간 것으로 보임 — 다음 배치는 시각을 앞당길 것 | 08-03 요청분 확인: bible·quran 허브 + RN 3건(pythagorean·quadratic-formula·linear-function) **전부 Submitted and indexed** |
| 08-05 | VC 5: `/methods/spoken-rehearsal`, `/templates/cdl`, `/templates/cdl-air-brakes`, `/templates/cdl-combination-vehicles`, `/templates/cdl-general-knowledge` · RN 6: `/en/demo`, `/en/guides/assign-problems-without-student-accounts`, `/en/practice/factor-trinomial`, `/en/practice/grade-4-2-decimals`, `/en/practice/grade-4-2-fractions`, `/en/practice/grade-4-2-line-graphs` | ✅ 11건 전부 "Indexing requested". 09:45~10:20 KST 실행, quota 초과 없음. 요청 시점 11건 모두 GSC에서 "URL is unknown to Google" 확인 | 08-04가 0건이라 확인할 전일 요청분 없음. 브리프가 낸 신규 색인 8건(VC)·3건(RN)은 08-04 스냅샷 기준이라 위 08-04 행과 같은 사건 |
| 08-05 (사후) | — (스냅샷 복구 후 재확인) | 스캔 타임아웃 수정 후 08-05 스냅샷 생성: VC 665쪽(색인 80), RN 34쪽(색인 17) | **당일 요청분이 몇 시간 만에 반영**: RN `/en/demo`·`/en/guides/assign-problems-without-student-accounts` 색인 완료, VC `/templates/cdl` 허브 색인 완료(하위 3건은 이제 요청 대상에서 제외) |
