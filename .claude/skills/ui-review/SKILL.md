---
name: ui-review
description: 대시보드 화면(카드·표·필터·간격)을 고치거나 만든 뒤 커밋 전에 검수할 때, 그리고 CEO가 UI를 지적했을 때 사용. "UI 검수", "화면 검사", "ui-check", "카드 점검", "왜 또 같은 말", "간격 좁아", "필터 위치" 같은 요청에 반응한다. (linear) 화면 tsx 를 커밋하려면 이 검사를 통과해야 훅이 커밋을 연다.
---

# UI 검수

CEO가 같은 UI 지적을 반복하지 않게 하는 절차다. pdf-to-video-local 의 품질 루프(생성 → 심사 → 결함 반영 → 재심사, 지적은 심사 기준에 적립)를 대시보드에 옮긴 것이다.

## 구성

| 부품 | 파일 | 하는 일 |
|---|---|---|
| 점검표 | `docs/design-system/dashboard-system.md` "카드 점검표" | 사람이 읽는 규칙 |
| 결정적 검사 | `scripts/ui-check.mjs` 의 `RULES_SOURCE` | 렌더한 DOM 을 카드마다 잰다 (제목·필터 위치·페이지네이션·탭·한 글자 배지·제목 아래 간격) |
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

- **CEO 가 새로 지적하면** 그 자리에서 세 군데에 적는다: 점검표 항목, `ui-judge-rubric.md` "지적 이력"(blocker, 날짜), 기계로 잴 수 있으면 `RULES_SOURCE` 한 줄. 그리고 같은 규칙에 걸리는 다른 화면도 찾아 고친다.
- **심사가 오탐을 내면** `ui-judge-rubric.md` "위반이 아닌 것"에 한 줄 더한다. 오탐을 무시하고 넘기지 않는다.
- 게이트를 `UI_CHECK_SKIP=1` 로 넘기는 건 화면이 안 바뀌는 수정(타입·주석)뿐이다. 커밋 메시지에 이유를 적는다.

## 덫

- 대시보드는 안쪽 컨테이너가 스크롤한다. `fullPage` 스크린샷은 한 화면만 찍혀서 스크립트가 창 높이를 3400 으로 연다.
- `.next` 가 외장 exFAT 에서 커지면 turbopack 캐시가 깨진다 — 스크립트는 `next dev --webpack` 으로 띄운다.
- 간격은 "무엇에서 무엇까지"를 CEO 가 보는 기준(제목 → 첫 숫자)으로 잰다. 사업관리는 제목 아래 기간 이동 줄이 있어 첫 지표가 60px 아래에 있다 — 그 줄 없는 카드와 숫자만 맞추면 눈에는 다르다.
- /mgmt 는 기준 화면이지만 아직 본문 필터 줄(2번 규칙)과 6글자 제목(카드승인내역)이 남아 있다. 기준으로 쓰는 건 제목·여백·표 모양이다.
