---
name: ui-review
description: 대시보드 화면(카드·표·필터·간격)을 고치거나 만든 뒤 커밋 전에 검수할 때, 그리고 CEO가 UI를 지적했을 때 사용. "UI 검수", "화면 검사", "ui-check", "카드 점검", "왜 또 같은 말", "간격 좁아", "필터 위치" 같은 요청에 반응한다. (linear) 화면 tsx 를 커밋하려면 이 검사를 통과해야 훅이 커밋을 연다.
---

# UI 검수

CEO가 같은 UI 지적을 반복하지 않게 하는 절차다. pdf-to-video-local 의 품질 루프(생성 → 심사 → 결함 반영 → 재심사, 지적은 심사 기준에 적립)를 대시보드에 옮긴 것이다.

## 태스크 정의 (자기강화 8단계 1단계)

1. **완결할 태스크**: CEO 의 화면 요청을 받아, CEO 가 같은 종류의 지적을 다시 하지 않는 화면을 배포한다.
2. **합격 기준**: 회귀 사례 전부 통과 → 결정적 검사 위반 0 → Codex 심사 85점 이상·blocker/major 0. 배포 뒤 CEO 지적이 없으면 합격, 있으면 실패.
3. **기록**: 실행마다 `.ui-check/<시각>/`(스크린샷·report·judge)와 `.ui-check/runs.jsonl`(통과·점수·시간). CEO 지적은 `docs/ui-review/feedback-log.md`.
4. **실패의 자산화**: 판단 → 루브릭·점검표, 반복 → 규칙 코드, 재발 금지 → 회귀 사례, 맥락 → 메모리. 지적 로그 "자산" 칸이 비면 끝난 게 아니다.
5. **줄여야 할 것**: 주당 CEO 지적 수(주 목표: 0으로 수렴)와 화면당 검사 반복 횟수. `npm run ui-check -- --stats` 로 본다.

## 구성

| 부품 | 파일 | 하는 일 |
|---|---|---|
| 점검표 | `docs/design-system/dashboard-system.md` "카드 점검표" | 사람이 읽는 규칙 |
| 회귀 사례 | `scripts/lib/ui-check-rules.test.mjs` | 과거 지적·오탐을 최소 HTML 로 되살려 규칙을 다시 돌린다. ui-check 가 매번 먼저 실행한다 |
| 결정적 검사 | `scripts/lib/ui-check-rules.mjs` 의 `RULES_SOURCE` | 렌더한 DOM 을 카드마다 잰다 (제목·필터 위치·페이지네이션·탭·한 글자 배지·제목 아래 간격) |
| 화면 심사 | `docs/design-system/ui-judge-rubric.md` + Codex | 대상·기준(/mgmt) 스크린샷을 나란히 보고 채점 (85점 미만 또는 blocker/major 면 실패) |
| 커밋 게이트 | `scripts/hooks/ui-check-gate.mjs` (`.claude/settings.json` PreToolUse) | `(linear)`·`_components` tsx 가 마지막 통과보다 새로우면 `git commit` 을 막는다 |

## 절차

1. 화면을 고친다. 요청받은 카드만이 아니라 **같은 페이지 전체**를 점검표로 훑는다.
2. `npm run ui-check -- /invest` (여러 화면은 이어서 적는다). 개발 서버가 없으면 스크립트가 :3123 에 띄운다.
   - 결정적 검사만 빠르게: `--no-judge` (통과 기록은 남지 않는다).
   - 배포본을 잴 때: `--base https://dash.willowinvt.com`.
3. 실패 항목을 고치고 다시 돌린다. 통과하면 `.ui-check/last-pass.json` 이 남고 커밋이 열린다.
4. 산출물(스크린샷·report.json·judge.json)은 `.ui-check/<시각>/` 에 있다. 보고할 때 스크린샷을 근거로 쓴다.

## 적립 — 이 절차의 핵심

- **CEO 가 새로 지적하면** 그 자리에서: `docs/ui-review/feedback-log.md` 에 한 줄, 회귀 사례 한 건(`ui-check-rules.test.mjs`), 기계로 잴 수 있으면 `RULES_SOURCE` 규칙, 눈 판단이면 `ui-judge-rubric.md` "지적 이력"(blocker, 날짜)과 점검표. 같은 규칙에 걸리는 다른 화면도 찾아 고친다.
- **같은 종류 지적이 또 나오면** 지적 로그 "재발" 칸에 날짜를 적고, 왜 자산이 못 막았는지부터 고친다.
- **심사가 오탐을 내면** `ui-judge-rubric.md` "위반이 아닌 것"에 한 줄 더한다. 오탐을 무시하고 넘기지 않는다.
- 게이트를 `UI_CHECK_SKIP=1` 로 넘기는 건 화면이 안 바뀌는 수정(타입·주석)뿐이다. 커밋 메시지에 이유를 적는다.

## 덫

- 대시보드는 안쪽 컨테이너가 스크롤한다. `fullPage` 스크린샷은 한 화면만 찍혀서 스크립트가 창 높이를 3400 으로 연다.
- `.next` 가 외장 exFAT 에서 커지면 turbopack 캐시가 깨진다 — 스크립트는 `next dev --webpack` 으로 띄운다.
- 간격은 "무엇에서 무엇까지"를 CEO 가 보는 기준(제목 → 첫 숫자)으로 잰다. 사업관리는 제목 아래 기간 이동 줄이 있어 첫 지표가 60px 아래에 있다 — 그 줄 없는 카드와 숫자만 맞추면 눈에는 다르다.
- /mgmt 는 기준 화면이지만 아직 본문 필터 줄(2번 규칙)과 6글자 제목(카드승인내역)이 남아 있다. 기준으로 쓰는 건 제목·여백·표 모양이다.
