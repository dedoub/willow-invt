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
- **하루 한도를 계속 꽉 채운다 (2026-08-11 CEO 결정).** 아래 "노출은 느는데 클릭이 안 는다"에
  적은 대로 지금 늘어나는 노출은 대부분 11위 아래로 떨어져 클릭이 안 나온다. 그래서 배치를
  줄이고 순위 작업으로 옮기자고 제안했으나, CEO는 **색인을 계속 늘리고 판단은 나중에**로
  정했다. 세션마다 이 트레이드오프를 다시 꺼내지 말 것 — 대기열대로 11건을 채우면 된다.

## 실행 프로토콜 (어느 세션이든 동일)

> 클로드 세션은 `seo-daily-indexing` 스킬로 진행한다. 아래 1~2단계는
> `node scripts/seo-daily-brief.mjs` 한 줄이 대신한다 — 전일 대비 증감, 신규 색인,
> 우선순위가 적용된 오늘 후보를 한 번에 낸다. 이 문서는 대기열과 로그(=상태)를
> 맡고, 절차는 스킬이 맡는다.

1. 당일 스냅샷 확인: 어제 요청분의 상태 이동 점검. 손으로 볼 때의 SQL
   (프로젝트 `axcfvieqsaphhvbkyzzv`)

   ```sql
   select site_key, path, coverage_state, is_indexed from seo_index_status
   where checked_on = (now() at time zone 'Asia/Seoul')::date
     and path = any(<어제 요청 경로들>);
   ```

   > `checked_on`은 **KST 날짜**로 쌓이고 Postgres `current_date`는 **UTC**다. 09:00 KST 전에
   > `checked_on = current_date`로 조회하면 조용히 **어제 스냅샷**을 본다 — 오늘 것이
   > 멀쩡히 있는데도 없는 것처럼 보인다. 2026-08-08 08:56 KST에 이 함정에 걸렸다.
   > 오전에 볼 때는 위처럼 KST로 캐스팅하거나 날짜를 직접 박을 것.

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
> (전부 unknown)**. 08-06 배치부터 EN 허브 2건이 후보 상단으로 올라온다.

1. `/templates/einbuergerungstest` (EN 허브)
2. `/templates/deutsch-a1` (EN 허브)

de 허브(`/de/templates/einbuergerungstest`, `/de/templates/deutsch-a1`)는 처음에 3·4순위로
잡았다. 헤드텀이 독일어라 그쪽이 정본 같아 보여서였는데, EN 원본이 아직 unknown인 상태에서
번역본을 먼저 태우면 구글이 정본을 못 잡는다. EN 허브 색인 후 hreflang으로 따라오는지
먼저 본다 — 안 따라오면 그때 개별 요청한다.

### 리뷰노트 (연습문제 16건) — 2026-08-08 소진

16건 전부 요청 완료. `/en/` 원본에 **unknown이 0건**이 됐다(색인 23 / 추적 34, 나머지는
Discovered·Duplicate). 원본 우선 규칙을 지킬 대상이 더 없으므로 리뷰노트는 **로케일로
넘어간다**. 다음 순서:

1. 로케일 허브 unknown — `/ko/demo`, `/uk/guides`, `/uk/practice` (08-08 배치)
2. 그다음은 로케일별 색인 실적이 있는 쪽의 unknown부터. 08-08 기준 각 34쪽 중
   색인: `zh` 10 · `ko` 9 · `ja` 9 · `es` 9 · `fr` 8 · `pt` 8 · `it` 8 · `ru` 8 · `pl`·`uk`·`de`·`vi` 7.
   unknown 여지가 큰 쪽은 `ko` 7 · `ru` 6 · `pl`·`uk` 5.
3. 로케일 허브가 색인되면 그 아래는 허브 크롤을 기다린다 (bible·quran에서 검증된 패턴).

08-09 갱신: 로케일 허브 unknown 5건(`/pt/practice`·`/it/practice`·`/de/practice`·`/de/demo`·`/vi/demo`)
요청 완료. 남은 depth 2 후보는 `/de/billing` 하나인데 결제 화면이라 검색 가치가 낮아 뺐다.
사이트맵 재읽기가 돌아온 뒤로 unknown 풀이 빠르게 마르고 있으니(위 참조) 다음 배치는
**Discovered 허브**에서 고른다.

> 브리프가 낸 후보를 그대로 태우면 안 되는 경우가 있다. 08-09 브리프는
> `/en/practice/grade-4-large-numbers`·`grade-5-number-operations`·`/en/templates/mistake-notebook`을
> 상단에 올렸는데, 셋 다 **08-07에 요청해서 08-08에 Discovered로 이미 움직인 것**이다.
> 브리프는 과거 요청 이력을 모른다 — 후보가 최근 배치에 있었는지 로그로 대조할 것.

아래 원본 목록은 이력으로 남긴다. 모두 `https://reviewnotes.app/en/practice/` 하위.

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

### 보이스카드 스페인어 (신규 클러스터, 2026-08-07 발행)

허브 `/templates/spanish` + 덱 3(`-daily-expressions`·`-el-la-nouns`·`-verbs-spoken`). 전부 unknown.
하위가 3건뿐이고 리뷰노트 원본 대기열이 소진돼 슬롯 경쟁자가 없어서 **허브와 덱을 같이**
08-08 배치에 넣었다(하위 66·114건이던 bible·quran과 다른 판단).

### 보이스카드 OPIc (신규 클러스터, 2026-08-09 발행) — 08-09 소진

허브 `/templates/opic` + 덱 5(`-comparison-preference-phrases-ja`·`-english-speaking-phrases-ja`·
`-past-experience-phrases-ja`·`-problem-solution-phrases-ja`·`-role-play-phrases-ja`). 오늘 스냅샷에
처음 잡혔고 전부 unknown이었다. 하위가 5건뿐이라 스페인어 선례대로 **허브와 덱을 같이** 넣었다.

요청 시점에 6건 모두 `No referring sitemaps detected` — 보이스카드 사이트맵 Last read가
Aug 6에 멈춰 있어 오늘 배포분이 구글 사본에 없다(아래 참조).

### 보이스카드 로케일 루트

`/it`, `/uk`, `/zh`는 08-08 배치에서 요청 완료. 남은 `/es`·`/fr`·`/ja`·`/ko`·`/pl`·`/pt`·`/ru`·`/vi`는
Discovered라 후순위로 뒀었는데, **그 근거(Discovered는 요청해도 소용없다)는 08-11에 폐기했다**
(아래 "스냅샷의 unknown/Discovered는 신뢰할 수 없다" 참조). 다만 depth 1 루트는 하위로 크롤을
흘려보내는 힘이 카테고리 허브보다 약해서, 순서는 여전히 카테고리 허브 뒤다.
`/faq`는 `Crawled - not indexed`라 제외.

### 보이스카드 로케일 카테고리 허브 (08-11 배치, 잔여 있음)

로케일별 카테고리 허브 — EN 원본(`/methods`·`/memorization`·`/audio-flashcards`·`/language-learning`
·`/exam-prep`·`/voice-flashcard-apps`)이 전부 색인돼 있어 "영어 원본 우선" 규칙을 통과한다.
08-11에 5건 요청(`/fr/methods`·`/ru/methods`·`/es/memorization`·`/ja/audio-flashcards`·`/ko/exam-prep`).

남은 것: `/pt/memorization`, `/ru/memorization`, `/fr/audio-flashcards`, `/fr/language-learning`,
`/ja/language-learning`, `/vi/language-learning`, `/es/voice-flashcard-apps`, `/uk/voice-flashcard-apps`.

### 리뷰노트 로케일 허브 (08-11 배치, 잔여 있음)

08-11에 6건 요청(`/es/practice`·`/es/demo`·`/it/demo`·`/zh/practice`·`/ja/practice`·`/fr/practice`).
남은 것: `/ko/practice`, `/ru/practice`, `/pl/practice`, `/fr/demo`, `/ru/demo`, `/zh/demo`,
`/pt/demo`, `/uk/demo`, `/vi/practice`, `/vi/guides`.

`/privacy`·`/terms` 로케일 변형은 대부분 `Duplicate, Google chose different canonical`이라 제외 —
요청으로 안 풀리는 canonical 문제다.

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
| 08-06 | VC 5: `/methods/chunking-translation`, `/templates/deutsch-a1`, `/templates/einbuergerungstest`, `/methods/active-recall`, `/methods/finish-date-pacing` · RN 6: `/en/practice/` 하위 `grade-4-2-polygons`·`-quadrilaterals`·`-triangles`·`grade-4-angles`·`grade-4-bar-graph`·`grade-4-large-numbers` | ✅ 11건 완료, quota 초과 없음. 12:00~12:40 KST. **사이트맵 재제출도 함께** (아래 참조) |
| 08-07 | VC 3: `/templates/bible-verse-memorization-kjv`, `/methods/two-way-recall`, `/methods/daily-five` · RN 8: `/en/practice/` `grade-4-multiplication`·`grade-4-transformations`·`linear-system`·`grade-4-rules`·`grade-5-fractions`·`grade-5-number-operations`·`grade-4-large-numbers` + `/en/templates/mistake-notebook` | ✅ 11건 전부 "Indexing requested", 12번째까지 quota 여유. 12:45~13:15 KST. 로케일 루트 대신 원본으로 채운 배치 |
| 08-08 | VC 7: `/templates/spanish`(신규 허브) + 덱 3(`-daily-expressions`·`-el-la-nouns`·`-verbs-spoken`) + 로케일 루트 3(`/it`·`/uk`·`/zh`) · RN 4: `/ko/demo`, `/uk/guides`, `/uk/practice`, `/ko/guides/assign-problems-without-student-accounts` | ✅ 11건 완료. 하루 만에 6건 색인(VC 스페인어 허브+덱 3, `/it`, RN `/ko/guides/…`) |
| 08-09 | VC 6: `/templates/opic`(신규 허브) + 덱 5(`-comparison-preference-phrases-ja`·`-english-speaking-phrases-ja`·`-past-experience-phrases-ja`·`-problem-solution-phrases-ja`·`-role-play-phrases-ja`) · RN 5: 로케일 허브 `/pt/practice`, `/it/practice`, `/de/practice`, `/de/demo`, `/vi/demo` | ✅ 11건 전부 "Indexing requested", quota 초과 없음. 18:40~19:20 KST |
| 08-10 | — (색인 배치 없음. 보이스카드 사이트맵 재제출만) | 요청 0건 |
| 08-11 | VC 5: 로케일 카테고리 허브 `/fr/methods`, `/ru/methods`, `/es/memorization`, `/ja/audio-flashcards`, `/ko/exam-prep` · RN 6: 로케일 허브 `/es/practice`, `/es/demo`, `/it/demo`, `/zh/practice`, `/ja/practice`, `/fr/practice` | ✅ 11건 전부 "Indexing requested", quota 초과 없음. 08:50~09:40 KST. 브리프 자동안(VC 로케일 루트 5 + RN 기요청 3건 포함)을 CEO 승인으로 교체한 배치 |
| 08-06~ | 스냅샷 기준 재평가. 요청분이 색인으로 넘어가는 속도를 보고 계속/중단 결정 | - |

### 08-07 배치 결과 (08-08 스냅샷)

11건 중 **6건이 하루 만에 색인**됐다. VC 3건은 전부 색인(`bible-verse-memorization-kjv`,
`two-way-recall`, `daily-five`), RN은 `grade-4-rules`·`grade-4-transformations`·`grade-5-fractions`
색인. `grade-5-number-operations`·`grade-4-large-numbers`·`mistake-notebook`은 Discovered로
이동 후 정체(재요청 안 함 — 상태가 움직였으므로 규칙상 1주 관찰).

문제 하나: `grade-4-multiplication`과 `linear-system`이 **`Duplicate without user-selected
canonical`** 로 갔다. 색인 요청으로 안 풀리는 canonical 문제다 — 연습문제 페이지가 서로
비슷해서 구글이 대표를 못 고른 것으로 보인다. `scripts/seo-template-similarity.mjs`로
중복도를 실측하고 canonical/콘텐츠 차별화를 봐야 한다. 같은 패턴이 다른 `/practice/`
하위로 번지는지 추적할 것.

### 허브 크롤 대기 규칙 검증 (08-08)

개별 요청 없이 허브 크롤만으로 하위가 얼마나 따라왔는지 실측했다.

| 클러스터 | 하위 총 | 색인 | Discovered | unknown |
|---|---|---|---|---|
| `/templates/bible` | 66 | 7 | 47 | 12 |
| `/templates/quran` | 114 | 11 | 85 | 18 |

요청 **0건**으로 18건 색인·132건 발견. 하위 제외 규칙을 유지한다.

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

### 복구 후 드러난 것 — 결정: 영어 원본 우선 (2026-08-05, 커밋 1c75b27)

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

## 리뷰노트 로케일이 관측 밖이었다 (2026-08-05 발견·해결, 커밋 d5bb79e)

GSC 색인 페이지 리포트가 리뷰노트를 **102쪽 색인**이라고 하는데 우리 스냅샷은 17이었다.
원인은 `scanLocales: false`다 — 콘텐츠당 대표 1개만 검사해서 34쪽만 추적하고 있었고,
사이트맵은 442쪽(13로케일 × 33)이다. 최근 30일 노출을 받은 57쪽 중 **56쪽이 로케일
프리픽스**였고 `/en/`은 12쪽뿐이었다. 트래픽을 버는 쪽을 통째로 안 보고 있었다.

전수 재스캔 결과 442 요청 / 441 검사 / 1 실패:

| | 원본(`/en/`) | 로케일 | 합 |
|---|---|---|---|
| 색인 | 17 / 34 | 96 / 407 | **113** |
| 구글이 모름 | 13 | 294 | 307 |

**로케일이 언어별로 고르다** — zh 10, es·ja·ko 9, fr·it·pt 8, de·pl·ru·uk·vi 7.
보이스카드 로케일 색인률 8.3%와 정반대다. 리뷰노트는 번역본이 자력으로 잡히고 있고,
보이스카드는 안 잡힌다. **두 사이트에 같은 처방을 쓰지 말 것.**

> 교훈: GSC 리포트와 우리 숫자가 갈리면 방향을 먼저 볼 것. **GSC가 더 크면 우리 관측
> 범위 문제**(여기), **우리가 더 크면 GSC 리포트 지연**(보이스카드 10 vs 80 — 같은 GSC의
> 실적 리포트가 40쪽 노출을 보고했으므로 10은 성립하지 않는다).

## GSC UI 를 자동으로 몰 때 (2026-08-07에 한 칸 버리고 배운 것)

**URL 입력과 REQUEST INDEXING 클릭을 한 배치에 묶지 말 것.** 검색창 입력이 실패해도
그다음 클릭은 그대로 나가고, 요청이 끝난 화면에서는 같은 자리가 **REQUEST AGAIN** 이다.
08-07에 그렇게 `/methods/two-way-recall` 을 두 번 요청해 하루 한도 한 칸을 버렸다
(재요청은 큐를 안 바꾸므로 아무 효과도 없다).

지켜야 할 순서:

1. 검색창에 URL 입력 → Enter
2. **화면 상단의 검사 URL이 방금 넣은 것인지 눈으로 확인** (여기서 끊는다)
3. 확인된 뒤에만 REQUEST INDEXING 클릭

프로퍼티를 바꾼 직후와 결과 토스트가 떠 있는 동안에는 첫 클릭이 자주 먹지 않는다.
한 번 더 클릭해서 입력하면 된다. 확인 단계가 있으면 이건 그냥 재시도로 끝난다.

> 라이브 테스트("Testing if live URL can be indexed")는 날에 따라 30초에서 3분 넘게 걸린다.
> 오래 걸린다고 취소하지 말 것 — 취소하면 요청이 등록되지 않는다.

## 리뷰노트 연습문제가 구글에게 남의 사이트 중복으로 잡혔다 (2026-08-06 발견, 미해결)

08-05에 요청한 연습문제 4건이 크롤은 됐는데(08-05 00:43 UTC, 요청 직후) **Duplicate without
user-selected canonical**로 떨어졌다. 구글이 붙인 정본이 우리 도메인도 아니다.

| 우리 URL | 구글이 고른 정본 |
|---|---|
| `/en/practice/factor-trinomial` 외 3건 | `https://www.marcustheatres.com/` (미국 영화관 체인) |
| `/fr/practice/grade-4-2-triangles`, `/fr/terms` | `https://www.747live.bet/` (도박 사이트) |

콘텐츠 문제는 아니다. `seo-template-similarity.mjs` 실측에서 **유사도 평균 12.0%(최대 13.3%),
고유비중 77%, 평균 780단어, 중복 title·desc 0쪽**이 나왔다. 근접 중복 기준(80%↑) 근처도 아니다.

지금 서버는 self-canonical을 정상으로 내준다(일반 UA·Googlebot UA 둘 다 확인). 그런데 GSC의
`user_canonical`은 null이다 — 크롤 시점에 못 봤다는 뜻이다. `page_fetch_state`는 SUCCESSFUL이라
못 가져간 건 아니다.

**미해결.** 가설은 크롤 시점(08-05 00:43 UTC)의 응답에 canonical이 없었다는 것인데, 리뷰노트 쪽
배포 이력을 봐야 확정된다. 08-06 배치의 연습문제 6건이 그 검증이다 — 같은 경로 패턴에 아직
크롤 안 된 URL들이라, 이것들도 duplicate로 가면 체계적 문제고 아니면 그날 크롤 창의 일회성이다.

## 사이트맵 재읽기가 10일간 멈춰 있었다 (2026-08-06 발견·조치)

08-06 배치 중 요청한 URL 대부분이 GSC 검사에서 **"No referring sitemaps detected"**로 나왔다.
사이트맵에 분명히 있는 URL인데도 그랬다. Sitemaps 화면을 열어 보니 원인이 나왔다.

| 사이트 | 사이트맵 실제 | 구글이 읽은 판 | Submitted | Last read |
|---|---|---|---|---|
| 보이스카드 | 670쪽 | 563쪽 | Jul 27 | **Jul 27** |
| 리뷰노트 | 442쪽 | 429쪽 | Jul 27 | **Jul 27** |

상태는 둘 다 Success다. 실패가 아니라 **재방문이 멈춘 것**이다. `lastmod`는 정상이었다 —
리뷰노트는 442쪽 전부 08-04, 보이스카드도 08-04분이 223쪽 있다. 그런데도 안 읽었다.

이 하나가 여러 증상을 설명한다. 08-04 배포한 독일어권 84 URL이 전부 unknown인 것,
리뷰노트 로케일 307쪽이 unknown인 것, 오늘 요청분이 사이트맵과 연결 안 되는 것.
구글이 7/27판만 들고 있으니 그 뒤에 낸 건 발견 경로 자체가 없다.

**두 사이트 모두 같은 URL로 재제출했다**(08-06, Submitted가 Aug 6으로 갱신). Last read는
구글이 실제로 다시 읽어야 바뀐다 — 그게 이 조치의 성패 지표다.

> **하루 11건 요청보다 이쪽이 큰 레버다.** 수동 요청은 하루 11개, 사이트맵 재읽기는 한 번에
> 수백 개다. 앞으로 신규 클러스터를 배포하면 **배포 후 사이트맵 Last read를 먼저 확인할 것.**
> 거기가 막혀 있으면 개별 요청은 밑 빠진 독이다.

## 팔로우업 로그

| 날짜 | 요청 | 결과 | 전일 요청분 상태 이동 |
|---|---|---|---|
| 08-03 | VC 8 + RN 3 | 11건 등록, quota 도달 | (첫 배치) 07-30 시민권 8건 중 3건 색인 확인 |
| 08-04 | 0건 (VC `/templates/einbuergerungstest` 시도 → Quota Exceeded) | ❌ 할당량 미회복. 08-03 배치가 늦게 돌아 24h 창이 안 넘어간 것으로 보임 — 다음 배치는 시각을 앞당길 것 | 08-03 요청분 확인: bible·quran 허브 + RN 3건(pythagorean·quadratic-formula·linear-function) **전부 Submitted and indexed** |
| 08-05 | VC 5: `/methods/spoken-rehearsal`, `/templates/cdl`, `/templates/cdl-air-brakes`, `/templates/cdl-combination-vehicles`, `/templates/cdl-general-knowledge` · RN 6: `/en/demo`, `/en/guides/assign-problems-without-student-accounts`, `/en/practice/factor-trinomial`, `/en/practice/grade-4-2-decimals`, `/en/practice/grade-4-2-fractions`, `/en/practice/grade-4-2-line-graphs` | ✅ 11건 전부 "Indexing requested". 09:45~10:20 KST 실행, quota 초과 없음. 요청 시점 11건 모두 GSC에서 "URL is unknown to Google" 확인 | 08-04가 0건이라 확인할 전일 요청분 없음. 브리프가 낸 신규 색인 8건(VC)·3건(RN)은 08-04 스냅샷 기준이라 위 08-04 행과 같은 사건 |
| 08-06 | VC 5: `/methods/chunking-translation`, `/templates/deutsch-a1`, `/templates/einbuergerungstest`, `/methods/active-recall`, `/methods/finish-date-pacing` · RN 6: `/en/practice/` `grade-4-2-polygons`·`-quadrilaterals`·`-triangles`·`grade-4-angles`·`grade-4-bar-graph`·`grade-4-large-numbers` | ✅ 11건 전부 "Indexing requested", quota 초과 없음. 추가로 **두 사이트 사이트맵 재제출** | 08-05 요청분: `/en/demo`·`/en/guides/assign-problems-without-student-accounts`·`/templates/cdl`·`/methods/spoken-rehearsal` **색인 완료**. 반면 RN 연습문제 4건(`factor-trinomial`, `grade-4-2-decimals`·`-fractions`·`-line-graphs`)은 **Duplicate without user-selected canonical** — 아래 참조 |
| 08-05 (사후) | — (스냅샷 복구 후 재확인) | 스캔 타임아웃 수정 후 08-05 스냅샷 생성: VC 665쪽(색인 80), RN 34쪽(색인 17) | **당일 요청분이 몇 시간 만에 반영**: RN `/en/demo`·`/en/guides/assign-problems-without-student-accounts` 색인 완료, VC `/templates/cdl` 허브 색인 완료(하위 3건은 이제 요청 대상에서 제외) |
| 08-09 | VC 6(OPIc 허브+덱 5) + RN 5(로케일 허브 `/pt/practice`·`/it/practice`·`/de/practice`·`/de/demo`·`/vi/demo`) | ✅ 11건 전부 "Indexing requested", quota 초과 없음 | 08-08 요청 11건 중 **6건 색인**: VC `/templates/spanish` 허브 + 덱 3, 로케일 루트 `/it`, RN `/ko/guides/assign-problems-without-student-accounts`. 나머지는 Discovered로 이동(VC `/uk`, RN `/ko/demo`·`/uk/guides`·`/uk/practice`), VC `/zh`만 아직 unknown |
| 08-11 | VC 5(로케일 카테고리 허브 `/fr/methods`·`/ru/methods`·`/es/memorization`·`/ja/audio-flashcards`·`/ko/exam-prep`) + RN 6(로케일 허브 `/es/practice`·`/es/demo`·`/it/demo`·`/zh/practice`·`/ja/practice`·`/fr/practice`) | ✅ 11건 전부 "Indexing requested", quota 초과 없음. 08:50~09:40 KST | 08-10은 요청 0건이라 확인할 전일분 없음. 08-09 요청 11건 중 **RN 5건 중 4건 색인**(`/pt/practice`·`/it/practice`·`/de/practice`·`/vi/demo`), `/de/demo`는 Duplicate without user-selected canonical로 이동 |

### 노출은 느는데 클릭이 안 는다 (2026-08-11 측정)

보이스카드 GSC, 최근 30일 vs 직전 30일: 노출 113 → 606(5.4배), 클릭 10 → 21(2.1배).
클릭도 늘었다. CTR이 8.8% → 3.5%로 떨어져 안 느는 것처럼 보일 뿐이다.

문제는 CTR이 아니라 새 노출이 떨어지는 자리다.

| 순위 구간 | 노출 | 클릭 | CTR |
|---|---|---|---|
| 1~3위 | 8 | 1 | 12.5% |
| 4~10위 | 348 | 18 | 5.2% |
| 11~20위 | 237 | 2 | 0.8% |
| 21위+ | 82 | 0 | 0% |

노출의 53%가 11위 아래다. 4~10위 348노출 중 244가 홈이고, 90일 클릭 36건 중 33건이 홈,
그중 23건이 브랜드 쿼리 `voicecards`(2.8위·CTR 35%)다. **비브랜드 클릭은 사실상 0.**

즉 색인 작업은 "구글이 우리를 모른다"는 문제를 이미 풀었고, 지금 막힌 곳은 순위다.
제목·설명 문제가 아니라 10위 밖이라 안 눌리는 것이다.

클릭을 늘리려면 손대야 할 곳(지금은 보류, 위 규칙 참조):

- 11~15위라 한 페이지만 올라오면 클릭이 생기는 자리: `/audio-flashcards`(89노출 0클릭 15.8위),
  `/voice-flashcard-apps`(13.4위), `/vs/anki`(12.9위), `/language-learning`(13.5위),
  `/methods/active-recall`(11.8위)
- 외부 신뢰도(백링크·언급) — 11위 아래에 머무는 주된 이유이고 사이트 안에서 못 푼다.
  GEO 추천 Top3 16.7%도 같은 신호다.
- 브랜드 단수형 `voicecard`가 25노출 5.4위 1클릭 — 우리 이름 검색인데 위에 다른 결과가 있다.

### 08-11에 드러난 것 — 스냅샷의 unknown/Discovered는 신뢰할 수 없다

브리프 후보가 계획 문서 규칙과 어긋나서 파고들었더니, 스냅샷의 상태값이 매일 대량으로
양방향 뒤집히고 있었다.

| 날짜 | VC Discovered→unknown | VC unknown→Discovered | RN D→u | RN u→D |
|---|---|---|---|---|
| 08-08 | 116 | 64 | 34 | 47 |
| 08-09 | 93 | 104 | 63 | 29 |
| 08-10 | 63 | 104 | 32 | 61 |
| 08-11 | 99 | 65 | 65 | 28 |

실제 상태 변화가 아니다 — Discovered는 구글이 URL을 아는 상태라 unknown으로 되돌아갈 수
없다. Inspection API 응답이 흔들리는 것으로 보이고, 08-06부터 매일 이 규모다. 실제로 오늘
브리프가 unknown이라고 낸 `/fr/methods`·`/es/memorization`·`/ko/exam-prep`은 GSC 라이브에서
전부 Discovered였다.

따라오는 것:

1. **브리프의 "unknown 우선" 정렬은 지금 의미가 없다.** 노이즈가 순서를 결정한다.
   후보 선정은 깊이(허브 우선)와 요청 이력으로 하고, 상태는 요청 직전 GSC 화면만 믿는다.
2. **"Discovered는 요청해도 소용없다"는 대기열 규칙은 실측과 어긋난다.** 08-09에 요청한 RN
   로케일 허브 5건은 요청 시점 전부 Discovered였는데 이틀 만에 4건이 색인됐다. 재요청(같은
   URL 두 번)이 무의미한 것이지, 처음 요청하는 Discovered URL은 효과가 있다. 대기열의
   "로케일 루트는 Discovered라 제외" 항목은 이 근거로 폐기한다.

### 08-09 배치에서 드러난 것 — 사이트맵 재읽기가 사이트별로 갈렸다

RN 후보를 검사해 보니 스냅샷(06:40 KST)에서 unknown이던 `/pt/practice`·`/it/practice`가 GSC
실시간으로는 전부 **Discovered**였고, `Sitemaps`에 `https://reviewnotes.app/sitemap.xml`이 잡혔다.
Sitemaps 화면으로 확인한 Last read가 갈린다.

| 사이트 | Submitted | Last read | Discovered pages |
|---|---|---|---|
| 리뷰노트 | Aug 6 | **Aug 9 (당일)** | 442 |
| 보이스카드 | Aug 6 | Aug 6 | 670 |

리뷰노트는 08-06 재제출이 먹혀 재방문이 돌아왔고, 그래서 로케일 unknown이 통째로 Discovered로
넘어갔다. 보이스카드는 재제출일 이후로 다시 안 읽혔다 — 오늘 배포한 OPIc 6건이 전부
`No referring sitemaps detected`로 나온 이유다.

> 08-10: 보이스카드 사이트맵을 같은 URL로 **재제출**했다(Submitted가 Aug 10으로 갱신).
> Last read는 아직 Aug 6이다 — 구글이 실제로 다시 읽어야 바뀌고, 그게 이 조치의 성패 지표다.
> 우리 쪽 생성은 자동이다(`voice-cards-landing/app/sitemap.ts`, 배포마다 재생성, 현재 680 URL로
> OPIc 6건 포함). 재읽기를 강제할 방법은 없다 — sitemap ping 엔드포인트는 2023년에 폐기됐고
> GSC 재제출이 유일한 넛지다.

따라오는 두 가지:

1. **RN 대기열의 "unknown 우선" 정렬이 곧 무의미해진다.** 다음 배치부터는 unknown이 남았는지
   먼저 보고, 없으면 Discovered 중 **허브부터**(하위 크롤 경로) 고른다.
2. **스냅샷과 GSC 실시간이 갈리기 시작했다.** 스캔은 06:40 KST 한 번인데 사이트맵 재읽기가
   재개되면 하루 안에도 상태가 움직인다. 요청 직전 검사 화면의 상태를 정본으로 볼 것.
