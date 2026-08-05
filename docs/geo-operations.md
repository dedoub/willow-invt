# GEO 운영 (답변엔진 점유 추적)

검색 결과가 아니라 **AI 답변** 안에서 우리가 어디쯤 있는지 추적하는 문서.
색인 추적(`docs/seo-indexing.md`)이 "구글이 우리 페이지를 실었는가"를 본다면, 여기는
"AI가 사용자에게 우리를 권하는가"를 본다. 둘은 원인도 처방도 다르므로 섞지 않는다.

## 핵심 지표는 인용률이 아니라 추천 점유율

답변엔진은 우리 URL을 출처로 달아놓고도 정작 본문에서는 경쟁사를 권하는 일이 흔하다.
인용률만 보면 좋아지는 것처럼 착각한다. 그래서 단계를 넷으로 나눠 기록한다.

| 단계 | 뜻 | 기록 컬럼 |
|---|---|---|
| 미등장 | 답변에도 출처에도 없음 | (전부 false) |
| 인용만 | 출처(grounding)에는 우리 URL이 붙었는데 본문엔 없음 | `cited` |
| 언급 | 본문에 브랜드가 등장 | `mentioned` |
| 추천 Top3 | 추천 목록 상위 3개 안에 들어감 | `top3` |

**북극성은 `top3`다.** 나머지는 그 앞 단계를 설명하는 보조 지표다.

전체 퍼널은 여기서 끝나지 않는다: 추천 Top3 → URL 인용 → AI 유입 클릭 → 가입 → 활성화.
클릭 이후 구간은 아직 안 이어져 있다(아래 "미완" 참고).

## 데이터 소스

| 항목 | 위치 |
|---|---|
| 질문 레지스트리 | `geo_questions` (site, question_id, question, question_group, locale, priority, active) |
| 측정 원본 | `geo_answer_measurements` (질문 × 엔진 × 회차 1행) |
| 개선 액션·실험 | `geo_actions` (가설 → 조치 → 전후 비교 → 판정) |
| 집계·진단 코드 | `src/lib/geo-answers.ts` (`getGeoAnswerStats`) |
| 측정 러너 (크론) | `src/lib/geo-runner.ts` (`runGeoMeasurement`) |
| 측정 러너 (수동) | `scripts/geo-measure.mjs` |
| 질문 세트 원본 | `scripts/geo-questions.json` → `scripts/geo-seed-questions.mjs`로 레지스트리에 동기화 |
| 화면 | 보이스카드/리뷰노트 페이지의 "AI 답변 점유" 섹션 (`geo-answer-card.tsx`) |
| API | `/api/geo/answers`, `/api/geo/actions` (POST 등록 / PATCH 상태갱신) |

판정 규칙이 러너 두 개에 복제돼 있다. **고칠 때는 반드시 양쪽을 같이 고칠 것** —
갈라지면 수동 실행과 주간 크론의 숫자가 어긋나 추세가 못 쓰게 된다.

## 측정 조건

- 질문은 **비브랜드** 30개/제품. 브랜드명을 넣으면 당연히 우리가 나와서 아무것도 측정 못 한다.
- 같은 질문을 **주 3회차** 반복한다. 답변엔진은 같은 질문에도 매번 다르게 답해서 1회로는 노이즈다.
- 회차 평균이 그 주의 값이고, 주 단위(`measured_week`)로 묶어 비교한다.
- 유일 제약도 주 단위다: `(measured_week, site, engine, question_id, run_no)`.
  같은 주의 같은 회차를 다시 돌리면 **나중 실행이 앞 실행을 덮는다.**
  날짜 단위로 걸어 놨을 때는 크론이 20:30 UTC(다음날 KST)에 도는 탓에 같은 회차가 날짜만
  다르게 두 번 쌓여서, 30문항 1회차가 60행이 되고 "주 3회차" 장부가 어긋났다.
  러너는 `measured_on`·`measured_at`을 명시해 넣는다 — 덮어쓸 때 SET 목록에 없는 컬럼은
  안 바뀌어서, 언제 다시 잰 건지 알 수 없어진다.
- API 응답은 소비자 제품(chatgpt.com 등)의 답과 같지 않다. **추세를 보는 용도**이지 절대값을
  제품 화면과 비교하면 안 된다.

### 회차 번호는 누가 쓰나

유일 제약이 `(주, 사이트, 엔진, 질문, 회차)`라, 같은 번호로 다시 돌리면 앞 실행이 사라진다.
그래서 번호 공간을 크론과 수동으로 갈라 놨다.

| 번호 | 주인 | 언제 |
|---|---|---|
| 1·2·3 | Vercel 크론 (`vercel.json`) | 요일 고정. voicecards 월·수·금, reviewnotes 화·목·토 (20:30 UTC) |
| 4·5·6 | 수동 `scripts/geo-measure.mjs` | 실행할 때 그 주에 빈 번호를 자동으로 잡는다 |

수동 실행이 1부터 세면, 그 주 크론이 나중에 같은 번호를 덮어써서 여러 번 재고도 장부에는
한 회차만 남는다. 실제로 07-30에 손으로 3회차를 채웠는데 금요일 크론이 3회차를 덮어썼다.

크론이 실패한 회차를 손으로 메울 때만 번호를 직접 지정한다.

```bash
node scripts/geo-measure.mjs voicecards gemini 1 --run=2   # 2회차를 다시 재서 덮어쓴다
```

`GEO_LIMIT`으로 만든 스모크 행은 반드시 지울 것. 앞쪽 질문 몇 개만 담긴 회차가 전량 회차와
같은 주에 섞이면 주간 값이 그만큼 왜곡된다.

### 엔진

| 엔진 | 상태 | 전제 |
|---|---|---|
| gemini | 동작 | 아래 "Gemini 호출 경로" 참고 |
| chatgpt | 동작 | 아래 "ChatGPT 호출 경로" 참고 |
| perplexity | 미가동 | `PERPLEXITY_API_KEY` 없으면 자동 건너뜀 |

두 엔진의 실행 빈도가 다르다. **Gemini는 주 3회차, ChatGPT는 주 1회차다.**
엔진별 표는 그대로 비교해도 되지만, 전체 합산 값은 Gemini 쪽으로 기운다(90행 대 30행).

### Gemini 호출 경로 (2026-07-28)

대시보드가 들고 있던 `GEMINI_API_KEY`는 무료 티어라 **그라운딩 일일 한도**가 낮다.
주간 한 회차(30문항)도 못 채우고 대부분 429로 떨어졌다. 보이스카드는 카드 생성에 결제된
키를 이미 쓰고 있어서, 키를 복사해 오는 대신 그 프로젝트 안에 얇은 프록시를 두고 호출만 빌린다.

| 항목 | 위치 |
|---|---|
| 프록시 함수 | 보이스카드 Supabase(`juyitkynbavhllyjidhz`)의 `geo-ask` 엣지 함수 |
| 형상 사본 | `supabase/voicecards/functions/geo-ask/index.ts` |
| 인증 | `verify_jwt: true` — 대시보드가 `VOICECARDS_SUPABASE_SERVICE_KEY`로 호출 |
| 폴백 | 보이스카드 자격증명이 없으면 대시보드 자체 `GEMINI_API_KEY`로 직접 호출 |

키가 한 곳에만 있으므로 교체·회수도 보이스카드 프로젝트에서 한 번이면 된다.
대신 **카드 생성과 사용량을 공유**한다는 점은 알고 있어야 한다.

프록시는 Gemini의 상태코드를 응답 본문에 실어 넘긴다. 호출자의 429 재시도가 그걸 보고 동작한다.

### ChatGPT 호출 경로 (2026-07-28)

CEO 봇이 쓰는 인증은 API 키가 아니라 **ChatGPT 구독 로그인**이다
(`~/.codex/auth.json`의 `auth_mode: chatgpt`, `OPENAI_API_KEY: null`).
그래서 `api.openai.com` 어댑터로는 못 쓴다. 대신 codex CLI가 같은 모델에 네이티브
`web_search`를 붙일 수 있어서 그 CLI를 통째로 어댑터로 쓴다.

```
codex exec --json -c tools.web_search=true --skip-git-repo-check -m gpt-5.5
```

`OPENAI_API_KEY`가 생기면 HTTP 경로가 자동으로 우선한다. 어댑터 안에서 갈린다.

알고 있어야 할 것 네 가지.

- **프롬프트는 인자가 아니라 stdin으로 준다.** 인자로 주면 codex가 stdin도 마저 읽으려고
  기다리는데, 셸에서는 터미널이 바로 EOF를 주지만 Node가 띄우면 파이프가 안 닫혀서
  빈 응답이나 타임아웃으로 끝난다. 셸에서 되는데 스크립트에서 안 되면 이걸 의심할 것.
- **codex는 grounding 배열을 안 준다.** 본문에 박힌 URL이 유일한 출처 신호다. 그래서 모든
  질문·모든 회차에 똑같은 출력 지시문(`CODEX_SUFFIX`)을 붙인다 — 순위 목록으로, 출처 URL 포함.
  이건 고정된 측정 조건의 일부다. 빼면 인용 신호가 통째로 사라진다.
- **코딩 에이전트 표면이라 소비자 chatgpt.com 답변과 더 멀다.** Gemini보다도 한 단계 멀다.
- **CEO 봇의 구독 사용량을 나눠 쓴다.** 한도를 먹으면 봇이 같이 멈춘다. 회차를 늘리기 전에
  여유를 먼저 확인할 것.

로컬 CLI라 Vercel 크론에서 못 돈다. 이 엔진만 launchd다.

| 항목 | 위치 |
|---|---|
| launchd | `com.willow.geo-measure-chatgpt` — 매주 일요일 03:00 KST |
| 래퍼 | `scripts/geo-measure-chatgpt.sh` (두 사이트 순차, 한쪽 실패해도 계속) |
| 로그 | `~/Library/Logs/geo-measure-chatgpt.log` |

한 사이트 30문항에 40~50분, 두 사이트면 1시간 반이다.

## 크론

주 3회차 × 2제품 × 2파트 = 12개 항목. 한 호출에 30문항을 다 돌리면 함수 제한시간에 걸려서
파트로 쪼개고, 요일로 흩어 하루치 한도를 나눠 쓴다.

| 요일(UTC) | 대상 |
|---|---|
| 월 20:30 / 20:50 | voicecards 1회차 (part 1 / 2) |
| 화 | reviewnotes 1회차 |
| 수 | voicecards 2회차 |
| 목 | reviewnotes 2회차 |
| 금 | voicecards 3회차 |
| 토 | reviewnotes 3회차 |

수동 실행:

```
# 크론과 같은 경로
GET /api/cron/geo-measure?site=voicecards&run=1&part=1&parts=2&secret=$CRON_SECRET

# 로컬 (레지스트리에서 질문을 읽고, 없으면 파일 세트로 폴백)
node scripts/geo-measure.mjs voicecards gemini 1
GEO_THROTTLE_MS=2500 node scripts/geo-measure.mjs reviewnotes gemini 1

# ChatGPT(codex)는 launchd 래퍼로. 인자는 회차 번호
bash scripts/geo-measure-chatgpt.sh 1

# 스모크 테스트 — 앞 N문항만. 실측에는 쓰지 말 것(주간 값이 왜곡된다)
GEO_LIMIT=2 node scripts/geo-measure.mjs voicecards chatgpt 1
```

셸에서 준 환경변수가 `.env.local`보다 우선한다.

## 실패 원인 분류

Top3에 못 들었을 때, 처방이 서로 완전히 다르므로 원인을 갈라 놓는다.
판정 순서가 중요하다 — 앞 단계가 막혀 있으면 뒤 원인은 볼 필요가 없다 (`geo-answers.ts` `causeOf`).

| 원인 | 판정 | 처방 |
|---|---|---|
| 색인 | 색인된 대표 URL이 사실상 없음 | 색인 추적으로 넘어간다. 답변엔진이 인용할 대상 자체가 없다 |
| 외부 신뢰도 | 색인은 됐는데 인용도 언급도 0 | 외부 언급·백링크. 우리 사이트 안에서 할 수 있는 게 없다 |
| 콘텐츠 | 출처로는 잡히는데 추천은 안 됨 | 그 페이지가 그 질문에 직접 답하지 않는다. 페이지를 고친다 |
| 경쟁사 우위 | 언급까지는 되는데 특정 경쟁사가 Top3를 계속 가져감 | 비교 콘텐츠·차별점 명시 |

색인 페이지 수는 사이트 전체 신호라 질문 단위 판정에 그대로 쓰지 않는다.
"색인이 사실상 없다"는 극단만 색인 원인으로 잡는다.

## 개선 액션 다루는 법

1. 원인이 붙은 질문에 액션을 등록한다 (`POST /api/geo/actions`).
   `baseline_top3`는 **서버가 조치 직전 회차 값으로 채운다.** 손으로 적으면 기준이 흔들려
   실험 결론이 안 남는다.
2. 조치를 배포하고 `shipped_on`을 남긴다.
3. 다음 주 회차가 쌓이면 `PATCH /api/geo/actions` (`status: done`)로 닫는다.
   서버가 현재 회차를 `result_top3`에 넣고 baseline과 비교해 `verdict`를 자동 판정한다
   (`worked` / `no_effect` / `worse` / `inconclusive`).

눈대중으로 "좋아진 것 같다"고 결론 내리지 않게 하는 게 이 구조의 목적이다.

## 현황

### 2026-07-28 (기준선, 두 엔진 × 30문항 전량 · 1회차)

무료 티어로는 8문항·3문항까지밖에 못 갔다. 보이스카드 결제 키로 경로를 바꾸고,
ChatGPT를 codex로 붙이고 나서야 양쪽 30문항을 두 엔진으로 다 돌렸다. 이게 실질적인 기준선이다.

| 사이트 | 엔진 | 언급 | 추천 Top3 | 인용 |
|---|---|---|---|---|
| voicecards | chatgpt | 16.7% | 16.7% | 13.3% |
| voicecards | gemini | 10.0% | 6.7% | 0% |
| reviewnotes | chatgpt | 3.3% | 3.3% | 3.3% |
| reviewnotes | gemini | 6.7% | 3.3% | 6.7% |

단계별로 보면 대부분이 미등장이다.

| 사이트 | 엔진 | 추천 Top3 | 언급만 | 미등장 |
|---|---|---|---|---|
| voicecards | chatgpt | 5 | 0 | 25 |
| voicecards | gemini | 2 | 1 | 27 |
| reviewnotes | chatgpt | 1 | 0 | 29 |
| reviewnotes | gemini | 1 | 1 | 28 |

숫자보다 **어디서 걸리느냐**가 갈린다.

- **보이스카드는 음성 관련 질문에서만 잡힌다.** 걸린 질문이 거의 다 `alt`군(음성으로 답하는
  플래시카드, 발음 채점, 핸즈프리 듣기)이다. 제품이 실제로 뾰족한 지점과 정확히 일치한다.
  일반 "앤키 대안" 질문에서는 anki·quizlet·brainscape·remnote에 밀린다.
- **엔진이 우리를 다르게 본다.** ChatGPT는 Top3에 넣을 때 우리 URL도 같이 인용한다(5중 4).
  Gemini는 브랜드는 아는데 출처로는 한 번도 우리 페이지를 잡지 않는다(인용 0%).
  Gemini 쪽 근거가 우리 사이트 밖에 있다는 뜻이다.
- **리뷰노트는 양쪽 엔진 다 거의 안 나온다.** Gemini는 한국어 질문(`ko`)에서만,
  ChatGPT는 영어 `mistake`군 한 문항에서만 잡힌다. 나머지 전량 미등장이고,
  그 자리를 quizlet(15)·anki(10)·knowt(8)가 가져간다.

처방은 사이트 안이 아니라 밖에 있다 — 색인 쪽 진단(백링크가 손 안 댄 유일한 레버)과
같은 결론이다. 보이스카드는 이미 잡히는 음성 니치를 굳히는 쪽이 먼저고,
리뷰노트는 진입할 질문군 자체를 다시 골라야 한다.

2·3회차가 쌓이면 이 값이 회차 평균으로 대체된다. 1회차만으로 추세를 읽으면 안 된다.

### 2026-07-30 (같은 주 재측정 · Gemini 3회차 + ChatGPT 1회차)

같은 주(`measured_week` 2026-07-27)를 다시 쟀다. 유일 제약이 주 단위라 위 1회차 행은 이 값으로
덮였다. 위 표는 기록으로만 남고, **지금 DB에 있는 이번 주 값은 아래다.**

| 사이트 | 엔진 | 행 | 언급 | 추천 Top3 | 인용 |
|---|---|---|---|---|---|
| voicecards | chatgpt | 30 | 10% | 10% | 6.7% |
| voicecards | gemini | 90 | 12.2% | 8.9% | 0% |
| reviewnotes | chatgpt | 30 | 0% | 0% | 0% |
| reviewnotes | gemini | 90 | 1.1% | 0% | 0% |

질문 30개를 회차 중 한 번이라도 들었는가로 접으면 이렇다.

| 사이트 | 엔진 | 추천 Top3 | 언급/인용만 | 미등장 |
|---|---|---|---|---|
| voicecards | chatgpt | 3 | 0 | 27 |
| voicecards | gemini | 6 | 1 | 23 |
| reviewnotes | chatgpt | 0 | 0 | 30 |
| reviewnotes | gemini | 0 | 1 | 29 |

- **1회차 값이 과장이었다.** 리뷰노트는 1회차에 양쪽 엔진에서 각 1문항 잡혔지만, 3회차로 보면
  Gemini 언급 1건이 전부고 Top3는 0, ChatGPT는 30문항 전량 미등장이다. 회차를 늘리기 전에
  "조금 잡히는 중"으로 읽었다면 틀린 판단이었다.
- **보이스카드 진단은 회차를 늘려도 같다.** Top3에 든 질문이 Gemini 6개·ChatGPT 3개인데
  전부 `alt`(35%)·`pdf`(16.7%)·`ko`(10%)군이다. `civics`·`bible`·`quran`·`lang`·`method`는 0%.
  음성으로 뾰족한 곳에서만 잡힌다.
- **Gemini 인용은 90번 중 0건.** 브랜드는 알면서 우리 페이지를 출처로 한 번도 안 잡는다.
  ChatGPT는 Top3 3건 중 2건에 URL을 같이 달았다. 1회차에서 본 엔진 차이가 그대로다.
- **같은 질문도 회차마다 흔들린다.** `vc-alt-01`·`vc-ko-02`는 3회 중 2회, 나머지는 1회만 들었다.
  단발 측정으로 개선 여부를 말하면 안 되는 이유가 이 표에 있다.
- 우리가 빠진 자리: 보이스카드는 anki 38·quizlet 23·brainscape 18·remnote 14,
  리뷰노트는 quizlet 26·notion 21·anki 19·revisely 18·quizgecko 18.

### 2026-08-05 (주 `measured_week` 2026-08-03 · 측정 중)

크론이 월·화에 Gemini 1회차만 채운 상태에서 수동으로 4회차를 더했다. 남은 크론(수·목·금·토의
2·3회차)이 이 주에 계속 쌓이므로 **아래는 확정값이 아니라 중간값**이다. 주말에 다시 접어야 한다.

| 사이트 | 엔진 | 행 | 언급 | 추천 Top3 | 인용 |
|---|---|---|---|---|---|
| voicecards | chatgpt | 30 | 23.3% | **20%** | 20% |
| voicecards | gemini | 60 | 8.3% | 5.0% | 0% |
| reviewnotes | gemini | 60 | 5.0% | 1.7% | 3.3% |

- **보이스카드 ChatGPT가 `alt`군에서 전부 잡혔다.** 5문항 중 **5문항 Top3**, 그중 4건은 URL도
  같이 인용됐다. 지난주 전체 Top3가 3건이었는데 이번엔 이 한 군에서만 5건이다.
  나머지 군(`bible`·`civics`·`es`·`ja`·`method`·`pdf`·`quran` 17문항)은 전량 0으로 그대로다.
  음성 니치에서만 잡힌다는 기존 진단이 더 뾰족해진 형태다.
- **Gemini 인용은 여전히 0.** 지난주 90번 중 0건, 이번 주 60번 중 0건. 브랜드는 알면서 우리
  페이지를 출처로 한 번도 안 잡는다. 회차를 더 쌓아도 안 움직이는 패턴으로 봐야 한다.
- **리뷰노트가 처음으로 0을 벗어났다.** Gemini Top3 0% → 1.7%, 인용 0% → 3.3%. 다만 질문
  1개짜리라 노이즈 범위다. 여기에 의미를 부여하면 지난주 1회차 과장과 같은 실수가 된다.
- 우리가 빠진 자리: 보이스카드 anki 40·quizlet 23·brainscape 19·remnote 10 /
  리뷰노트 quizlet 11·notion 10·anki 9·**mindgrasp 8·quizgecko 7·studyfetch 5**.
  리뷰노트 쪽에 AI 학습도구(mindgrasp·studyfetch·gizmo)가 새로 올라왔다 — 지난주 revisely 자리다.

> 리뷰노트 ChatGPT는 이 시점에 미측정이다. 아래 "측정이 조용히 날아가는 함정" 참고.

### 측정이 조용히 날아가는 함정 (2026-08-05)

ChatGPT 측정을 일반 백그라운드로 띄웠다가 **두 번 연속 날렸다.** 에이전트 세션의 턴이 끝날 때
프로세스가 정리되면서 죽는데, 에러가 한 줄도 안 남는다. 러너는 전량 완료 후에 저장하므로
중간에 죽으면 **0행**이고, 그때까지 태운 CEO 봇 구독 사용량은 회수가 안 된다.

띄울 때 세션에서 분리하고 PPID를 확인할 것 (macOS엔 `setsid`가 없다):

```bash
( ( nohup bash scripts/geo-measure-chatgpt.sh 1 > ~/geo-chatgpt.log 2>&1 < /dev/null & ) & )
ps -ax -o pid,ppid,command | grep geo-measure | grep -v grep   # PPID가 1이어야 산다
```

Gemini는 사이트당 몇 분이라 이 문제가 없다. ChatGPT만 해당한다.

## 미완

- **Perplexity 미가동.** 어댑터는 준비돼 있고 `PERPLEXITY_API_KEY`만 넣으면 붙는다. 지금 숫자는
  Gemini·ChatGPT 두 엔진이라 "AI 전반"으로 읽기엔 아직 좁다. 엔진마다 결과가 완전히 다르다는 건
  이미 확인됐다 (Copilot은 리뷰노트를 38회 인용, ChatGPT는 밸류체인을 인용, 보이스카드는 어디서도 0).
- **AI 유입 → 가입 → 활성화 미연결.** 클릭 이후 구간이 비어 있다. 양쪽 앱에 first-touch UTM 캡처가
  들어가야 이어진다. AI 유입 클릭이 아직 0이라 뒤로 미뤄둔 상태.
- 질문 세트가 영어 위주다. 로케일 컬럼은 있으나 실제 다국어 질문은 아직 없다.
