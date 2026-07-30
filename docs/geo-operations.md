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

## 미완

- **ChatGPT·Perplexity 미가동.** 어댑터는 준비돼 있고 키만 넣으면 붙는다. 지금은 Gemini 한 엔진의
  숫자라 "AI 전반"으로 읽으면 안 된다. 엔진마다 결과가 완전히 다르다는 건 이미 확인됐다
  (Copilot은 리뷰노트를 38회 인용, ChatGPT는 밸류체인을 인용, 보이스카드는 어디서도 0).
- **AI 유입 → 가입 → 활성화 미연결.** 클릭 이후 구간이 비어 있다. 양쪽 앱에 first-touch UTM 캡처가
  들어가야 이어진다. AI 유입 클릭이 아직 0이라 뒤로 미뤄둔 상태.
- 질문 세트가 영어 위주다. 로케일 컬럼은 있으나 실제 다국어 질문은 아직 없다.
