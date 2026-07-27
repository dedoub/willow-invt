# 색인 추적 (SEO Indexing)

보이스카드/리뷰노트 발행 페이지가 구글에 실제로 색인되는지 추적하는 문서.
노출·클릭 지표는 "이미 노출된 페이지"만 보여주므로, 노출 0의 원인(미발견 / 크롤 후 거부 / 제외)은
URL Inspection API로만 갈라진다. 이 문서는 그 스냅샷의 해석과 조치 이력을 남긴다.

## 데이터 소스

| 항목 | 위치 |
|---|---|
| 스냅샷 테이블 | `seo_index_status` (willow-dash-tensw-todo, `axcfvieqsaphhvbkyzzv`) |
| 수집 크론 | `/api/cron/seo-index-scan`, 매일 21:40 UTC (06:40 KST) |
| 수집 코드 | `src/lib/gsc-index.ts` (`scanSiteIndexStatus`, `getIndexStatusSummary`) |
| 화면 | 보이스카드/리뷰노트 페이지 상단 "검색 노출 → 클릭" 섹션의 색인 상태·버티컬별 색인률 카드 |
| 수동 실행 | `GET /api/cron/seo-index-scan?secret=$CRON_SECRET[&site=voicecards]` |

검사 대상은 사이트맵의 콘텐츠 대표 URL이다. 로케일 변형(`/de/faq`, `/es/faq` 등)은 기본 경로 하나로
접어서 검사한다. 그래서 사이트맵 URL 수(보이스카드 566)와 검사 수(210)가 다르다.

## 상태 구분

| 버킷 | GSC 원문 | 의미 | 처방 |
|---|---|---|---|
| 색인됨 | Submitted and indexed | 검색에 나올 수 있음 | - |
| 크롤 후 미색인 | Crawled - currently not indexed | 읽고 나서 실을 가치 없다고 판단 | 콘텐츠 자체를 고쳐야 함. 재제출로는 안 풀림 |
| 발견·크롤 대기 | Discovered - currently not indexed | URL은 알지만 아직 안 읽음 | 대기. 크롤 예산 문제 |
| 구글이 모름 | URL is unknown to Google | URL 존재 자체를 모름 | 사이트맵·내부링크 문제 |

## 현황

### 2026-07-27 (최초 스냅샷)

| 사이트 | 검사 | 색인 | 색인률 | 구글이 모름 | 발견·대기 | 크롤 후 미색인 |
|---|---|---|---|---|---|---|
| 보이스카드 | 210 | 5 | 2.4% | 202 | 2 | 1 |
| 리뷰노트 | 32 | 9 | 28.1% | 23 | 0 | 0 |

보이스카드 색인 5쪽: `/`, `/language-learning`, `/privacy`, `/vs/anki`, `/vs/quizlet`
리뷰노트 색인 9쪽: `/en`, `/en/guides` + 가이드 글 4개, `/en/billing`, `/en/privacy`, `/en/terms`

미색인 구성:
- 보이스카드: 템플릿 188, 학습법(`/methods`) 11, 코어 3 (`/templates`, `/audio-flashcards`, `/voice-flashcard-apps`)
- 리뷰노트: 연습문제(`/en/practice`) 18, 가이드 2, 데모 1, 템플릿 1, 연습문제 허브 1

진행 신호: `/exam-prep`, `/memorization`이 '발견·크롤 대기'로 넘어왔다. 구글이 URL을 알기 시작했다는 뜻이라
템플릿 전체의 선행지표로 볼 것.

## 진단 (2026-07-27)

사이트맵은 정상이다. 원인은 사이트맵이 아니라 **크롤 시점**이다.

| 확인 항목 | 결과 |
|---|---|
| 사이트맵 제출 | 양쪽 다 제출됨. 보이스카드 563 URL, 리뷰노트 429 URL |
| 마지막 다운로드 | 2026-07-27 02:14 UTC (양쪽 다 당일, 오류 0 / 경고 0) |
| robots.txt | 양쪽 다 `Allow: /` + Sitemap 지시문 정상. 차단 없음 |
| 페이지 응답 | 템플릿 페이지 200, noindex 없음, canonical 자기 자신 |
| 내부링크 | `/templates` 허브가 템플릿 191개를 링크. 홈에서 템플릿 9개 링크 |

핵심은 두 가지다.

1. **사이트맵이 오늘 처음 읽혔다.** lastDownloaded가 스냅샷 검사(01:55~02:01 UTC) 직후인 02:14 UTC다.
   즉 검사 시점에 구글은 이 URL 목록을 아직 받지 못한 상태였다. 563 URL 발견에는 며칠에서 몇 주가 걸린다.
2. **허브 페이지가 아직 미발견이다.** `/templates` 자체가 unknown이라 크롤 경로로도 하위 188쪽에 닿지 못한다.
   홈(`/`)은 색인됐지만 마지막 크롤이 2026-07-22라, 그 이후 추가된 내부링크는 아직 구글이 못 봤다.

sitemaps API의 `indexed=0`은 무시할 것. 구글이 오래전에 보고를 중단한 필드다.

## 콘텐츠 중복도 (2026-07-27)

크롤 후 미색인이 터졌을 때 원인을 콘텐츠로 돌리기 전에, 실제로 중복인지 먼저 재둔 기준점이다.
본문에서 태그·스크립트를 걷어낸 뒤 5-gram 자카드 유사도와 페이지 고유 비중을 냈다.
점검 스크립트: `node scripts/seo-template-similarity.mjs <도메인> <경로 프리픽스> [표본수]`

| 묶음 | 쪽수 | 평균 유사도 | 최대 | 고유 비중 | 평균 단어 |
|---|---|---|---|---|---|
| VC 코란 수라 | 114 | 50.2% | 55.4% | 32.1% | 648 |
| VC 성경 권별 | 66 | 47.8% | 55.3% | 32.2% | 601 |
| VC 시민권 | 8 | 22.3% | 47.6% | 39.6% | 569 |
| VC 허브(bible·quran·civics) | 3 | 3.8% | 5.0% | 91.3% | 641 |
| RN 연습문제 | 19 | 12.1% | 14.0% | 76.6% | 762 |
| RN 가이드 | 6 | 8.5% | 10.5% | 82.1% | 738 |

판정: **중복 문제 아님.** 양쪽 다 80% 넘는 쌍이 하나도 없고, 300단어 미만도 없고,
title·description 중복이나 누락도 없다. 리뷰노트는 형제 페이지끼리 12% 이하로 사실상 별개 문서다.

보이스카드 형제 페이지가 50%대인 것은 학습법 설명을 공유하기 때문이다. 문단 단위로 뜯어보면
(Colossians vs Titus) 고유 15문단 / 공통 9문단이고, 고유한 쪽이 책 소개·구절 수·해당 책에서 뽑은
예시 구절처럼 알맹이다. 공통인 쪽이 Listen/Speak 모드 설명 같은 방법론이다. 카탈로그형 페이지의
정상적인 구성이다.

그래서 남는 위험은 중복이 아니라 규모와 도메인 신뢰도다. 신생 도메인이 같은 틀의 페이지를
한꺼번에 올리면 품질과 무관하게 크롤이 느리고 색인이 선별적이다. 기대치는 "188쪽이 다 색인된다"가
아니라 "수요가 있는 몇 쪽이 먼저 뚫리고 그게 나머지를 끌어올린다"로 잡을 것.

## 조치 이력

| 날짜 | 조치 | 결과 |
|---|---|---|
| 2026-07-27 | 색인 추적 파이프라인 구축, 사이트맵 재제출, 내부링크 구조 수리 | 최초 스냅샷 확보 |
| 2026-07-27 | GSC URL 검사에서 색인 요청 5건 (아래) | 전부 priority crawl queue 등록 확인 |

색인 요청한 URL:

| 사이트 | URL | 요청 시점 상태 | 의도 |
|---|---|---|---|
| 보이스카드 | `/templates` | Discovered | 허브. 하위 템플릿 188쪽의 크롤 경로 |
| 보이스카드 | `/methods` | Discovered | 허브. 하위 학습법 11쪽의 크롤 경로 |
| 보이스카드 | `/` | Indexed (마지막 크롤 07-22) | 수리한 내부링크를 다시 읽히기 |
| 리뷰노트 | `/en/practice` | Discovered | 허브. 하위 연습문제 18쪽의 크롤 경로 |
| 리뷰노트 | `/en` | Indexed (마지막 크롤 07-17) | 같은 이유 |

요청 시점에 `/templates`가 이미 'Discovered'로 올라와 있었다. 아침 스냅샷의 'unknown'에서 하루도 안 돼
넘어온 것이고, 발견 경로로 사이트맵과 함께 referring page `https://voicecards.quest/de/methods/active-recall`이
잡혔다. 사이트맵이 읽히기 시작했다는 직접 증거다. `/methods`, `/en/practice`도 같은 상태였다.

## 다음 액션

- [x] `/templates`, `/methods` 허브 색인 요청 (2026-07-27 완료)
- [x] 홈 재크롤 유도 (보이스카드 `/`, 리뷰노트 `/en` 색인 요청, 2026-07-27 완료)
- [x] 리뷰노트 `/en/practice` 허브 색인 요청 (2026-07-27 완료)
- [ ] 07-28 스냅샷에서 요청한 5쪽의 상태 이동 확인. 허브가 색인되면 하위 페이지는 요청 없이도 따라온다
- [ ] 1주일간 unknown이 안 줄면 사이트맵 외 발견 경로(외부 링크)를 검토
- [ ] `/faq`는 유일한 '크롤 후 미색인'. 재제출로 안 풀리므로 내용을 고치거나 방치 결정
- [x] 템플릿 중복도 점검 (2026-07-27 완료, 중복 아님)
- [ ] 크롤 후 미색인이 늘면 중복 재점검이 아니라 외부 링크·수요 검증 쪽을 볼 것.
      중복은 위 표로 이미 배제했다

## 알아둘 것

- GSC 색인 리포트의 페이지 수와 이 문서의 숫자는 다르다. GSC는 로케일 변형을 각각 세고
  (리뷰노트 33쪽 색인), 이 문서는 대표 URL만 센다 (리뷰노트 9쪽). 추세 비교는 같은 기준끼리 할 것.
- 색인 요청은 하루 할당량이 있다. 같은 URL을 여러 번 넣어도 큐 순서는 안 바뀐다.
  허브부터 넣는 이유가 이것이다. 하위 페이지는 허브가 크롤되면 따라온다.

## 갱신 방법

스냅샷 표 갱신:

```sql
select site_key, checked_on, count(*) total,
  count(*) filter (where is_indexed) indexed,
  count(*) filter (where coverage_state ilike '%unknown to google%') unseen,
  count(*) filter (where coverage_state ilike '%discovered%') discovered,
  count(*) filter (where coverage_state ilike '%crawled%' and coverage_state ilike '%not indexed%') crawled_not_indexed
from seo_index_status
group by 1, 2 order by checked_on desc, site_key;
```

전날 대비 상태가 바뀐 경로:

```sql
select a.site_key, a.path, b.coverage_state as before, a.coverage_state as after
from seo_index_status a
join seo_index_status b
  on a.site_key = b.site_key and a.path = b.path
 and b.checked_on = a.checked_on - 1
where a.coverage_state is distinct from b.coverage_state
order by a.site_key, a.path;
```

사이트맵 제출 상태는 GSC Sitemaps API로 확인한다.
`GET https://www.googleapis.com/webmasters/v3/sites/{property}/sitemaps`
(서비스 계정 `GOOGLE_SA_JSON_B64`, 스코프 `webmasters.readonly`)
