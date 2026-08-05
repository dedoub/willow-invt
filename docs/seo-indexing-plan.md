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

> ⚠️ 08-05 확인: 이 클러스터는 `seo_index_status`에 **0건**이다. 사이트맵엔 있는데
> 추적에 없다 — 최신 스냅샷이 08-04자(수집 시각 08-03 21:42 UTC)라 배포 전 사이트맵을
> 찍었기 때문이다. 브리프는 스냅샷에서 후보를 뽑으므로 이 클러스터를 낼 수 없었고,
> 08-05 배치는 그다음 순위(CDL·RN)로 채워졌다. **스냅샷이 갱신돼야 대기열 최상단이
> 후보로 올라온다.** 아래 "스냅샷 크론 중단" 참조.

1. `/templates/einbuergerungstest` (EN 허브)
2. `/templates/deutsch-a1` (EN 허브)
3. `/de/templates/einbuergerungstest` (de 허브 — 이 클러스터의 헤드텀 언어)
4. `/de/templates/deutsch-a1` (de 허브)

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
| 08-06 | VC 독일어권 허브 4 (스냅샷 복구 후) + RN 대기열 잔여 | 예정 |
| 08-06~ | 스냅샷 기준 재평가. 요청분이 색인으로 넘어가는 속도를 보고 계속/중단 결정 | - |

## 스냅샷 크론 중단 (2026-08-05 발견, 미해결)

`seo_index_status`의 최신 스냅샷이 `checked_on=2026-08-04`(수집 2026-08-03 21:42 UTC)에서 멈췄다.
크론은 `vercel.json`에 21:40/21:45 UTC(= KST 06:40/06:45)로 걸려 있고 08-01~08-04는 매일 정확히
돌았다. 08-04 21:40 UTC분이 처음으로 안 들어왔다.

영향: 브리프가 하루 묵은 스냅샷으로 후보를 낸다. 그날 배포된 신규 클러스터는 추적에 없으니
대기열 최상단이어도 후보에 못 올라온다(08-05 독일어권 사례).

확인한 것:
- 사이트맵엔 독일어권 URL이 정상 존재 → 사이트 쪽 문제 아님
- 엔드포인트는 살아 있음(`?secret=` 틀리면 401 JSON 정상 반환)
- `vercel env pull`은 CRON_SECRET을 마스킹해서 내려준다(민감값 표시) → 수동 트리거를 자동화에서
  못 한다. `SUPABASE_SECRET_KEY`도 같이 마스킹되므로 이 파일로는 시크릿 복구 불가

수동 실행 (시크릿을 아는 사람이 직접):
```
curl "https://willow-invt.vercel.app/api/cron/seo-index-scan?site=voicecards&secret=<CRON_SECRET>"
curl "https://willow-invt.vercel.app/api/cron/seo-index-scan?site=reviewnotes&secret=<CRON_SECRET>"
```

다음에 볼 것: Vercel 대시보드의 Cron Jobs 실행 이력(성공/실패/미실행 구분). `vercel logs`로는
과거 크론 호출이 안 잡혔다.

## 팔로우업 로그

| 날짜 | 요청 | 결과 | 전일 요청분 상태 이동 |
|---|---|---|---|
| 08-03 | VC 8 + RN 3 | 11건 등록, quota 도달 | (첫 배치) 07-30 시민권 8건 중 3건 색인 확인 |
| 08-04 | 0건 (VC `/templates/einbuergerungstest` 시도 → Quota Exceeded) | ❌ 할당량 미회복. 08-03 배치가 늦게 돌아 24h 창이 안 넘어간 것으로 보임 — 다음 배치는 시각을 앞당길 것 | 08-03 요청분 확인: bible·quran 허브 + RN 3건(pythagorean·quadratic-formula·linear-function) **전부 Submitted and indexed** |
| 08-05 | VC 5: `/methods/spoken-rehearsal`, `/templates/cdl`, `/templates/cdl-air-brakes`, `/templates/cdl-combination-vehicles`, `/templates/cdl-general-knowledge` · RN 6: `/en/demo`, `/en/guides/assign-problems-without-student-accounts`, `/en/practice/factor-trinomial`, `/en/practice/grade-4-2-decimals`, `/en/practice/grade-4-2-fractions`, `/en/practice/grade-4-2-line-graphs` | ✅ 11건 전부 "Indexing requested". 09:45~10:20 KST 실행, quota 초과 없음. 요청 시점 11건 모두 GSC에서 "URL is unknown to Google" 확인 | 08-04가 0건이라 확인할 전일 요청분 없음. 브리프가 낸 신규 색인 8건(VC)·3건(RN)은 08-04 스냅샷 기준이라 위 08-04 행과 같은 사건 |
