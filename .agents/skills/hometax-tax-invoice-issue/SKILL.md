---
name: hometax-tax-invoice-issue
description: Use when issuing a Tensoftworks sales 전자세금계산서 on 홈택스 from a 매출관리(tensw_mgmt_sales) scheduled row — fills the 건별발급 form from the row and the counterparty's previous invoice, screenshots it, and issues only after CEO approval. Trigger on "세금계산서 작성", "세금계산서 발급", "체육회 계산서", "홈택스 발급", "계산서 끊어".
---

# 홈택스 전자세금계산서 발급 (텐소프트웍스 매출)

## 한 줄

```bash
node scripts/hometax-issue-tax-invoice.mjs --counterparty 체육회              # 작성만 하고 캡처 (발급 안 함)
node scripts/hometax-issue-tax-invoice.mjs --counterparty 체육회 --issue      # 대표 "발급해" 뒤에만
#   [--sale-id <uuid>] [--date YYYY-MM-DD] [--keep-open]
```

캡처는 `~/logs/tensw-local-finance/issue/draft_<사업자번호>_<작성일>.png`, 발급 뒤 `issued_<작성일>_<승인번호>.png`.

## 무엇을 어디서 가져오나

| 칸 | 출처 |
|----|------|
| 품목·공급가액·세액 | 매출관리 `tensw_mgmt_sales` 예정 행(`payment_status` scheduled/planned)의 `items` |
| 받는 곳 상호·대표·주소·업태·종목·이메일 | 같은 사업자번호로 **직전에 발급한** 세금계산서의 홈택스 상세(최근 6개월) |
| 사업자번호 | 행에 없으면 같은 상대의 이전 행에서 |
| 작성일자 | `--date`, 기본 오늘(KST). 홈택스는 **오늘 뒤 날짜를 받지 않는다** |
| 청구/영수 | 청구 |

`--counterparty` 는 상호 일부(예: `체육회`)로 가장 이른 예정 행을 고른다. 여러 건이 겹치면 `--sale-id` 로 집는다.

## 멈추는 곳 (스크립트가 스스로 멈춘다)

- 품목 합 ≠ 행의 공급가액·세액 → 작성 안 함.
- 화면 합계 ≠ 행의 합계·공급가액 → 발급 안 함.
- 직전 발급분에서 받는 곳 정보를 못 읽음 → 작성 안 함 (`ISSUE_DEBUG=1` 로 상세 글을 남겨 본다).
- 인증서: 텐소 **범용** 인증서만 소유자 이름으로 고른다. 비밀번호는 한 번만 넣는다. 거부되면 다시 넣지 않는다(잠금 카운터 5회).
- 승인번호를 못 읽으면 실패로 끝낸다. **다시 발급하지 말고** 홈택스 발급목록을 사람이 확인한다(중복 발급 위험).

## 발급은 메일 발송과 같다

발급하면 홈택스가 받는 곳 이메일로 계산서를 보낸다. 그래서:

- 기본은 작성 + 캡처까지. 대표에게 캡처를 보이고 "발급해" 를 받은 뒤 `--issue`.
- `--issue` 는 `assertSendAllowed` 로 막혀 있다 — 윌리 로컬 디스패치 중에는 실행되지 않는다. 윌리는 디스패치로 작성까지만 넘기고, 발급 승인 뒤 직접 `--issue` 를 실행한다.
- 발급 뒤 매출관리 행을 `issue_date=작성일`, `payment_status='pending'`, notes 에 승인번호·전송 이메일로 고친다. 입금되면 은행 대조가 `paid` 로 바꾼다.

## 정기 건

| 상대 | 사업자번호 | 품목 | 금액 | 시기 |
|------|-----------|------|------|------|
| 서울특별시체육회 | 607-82-87556 | 웹사이트 유지보수 - N월 (1,381,818 + 138,182) · 클라우드 엔지니어링 - N월 (363,636 + 36,364) | 합계 1,920,000 | 다음 달 초 전월분, 청구 |

품목 이름의 달은 **용역 달**(전월)이고 작성일자는 발급하는 날이다. 예: 2026-10-01 작성, "- 9월" 품목 (승인 20261001-10261001-85062028).
매출관리 예정 행의 품목 이름을 그대로 쓰므로, 예정 행 품목 달이 틀렸으면 발급 전에 행을 고친다.

## 윌리(텔레그램)로 할 때

| 대표 말 | 윌리가 하는 일 |
|---------|----------------|
| "체육회 세금계산서 작성해" / "계산서 띄워놔" | 디스패치: `node scripts/hometax-issue-tax-invoice.mjs --counterparty 체육회` → 캡처 경로·합계 보고 |
| "발급해" / "발급 승인" (캡처를 본 뒤) | 윌리가 직접 `node scripts/hometax-issue-tax-invoice.mjs --counterparty 체육회 --issue` → 승인번호 보고 |
| "8월거 참고해" | 이미 직전 발급분을 참고한다. 다른 달을 참고하라면 그 달 행의 품목을 예정 행에 옮겨 적는다 |

## 덫

- 같은 크롬 프로필(`~/.willow/browser-profiles/tensw-finance`)을 수집기와 같이 쓴다. 다른 홈택스 스크립트가 돌고 있으면 프로필 잠금으로 실패한다 — 끝난 뒤 다시.
- 로그인 직후 뜨는 공지 팝업 창을 닫고 시작한다(스크립트가 한다). 팝업을 본 창으로 잘못 잡으면 화면을 못 찾는다.
- 품목 **월** 칸은 작성일자에서 자동으로 채워지고 잠겨 있다. 일 칸만 넣는다.
- 합계 칸은 input 이 아니라 span 이다(`textContent`).
- 상세 화면 글에는 "상호,성명,사업장…을(를) 나타낸 표" 같은 설명문이 섞여 있다. 칸은 `라벨<탭>값` 으로만 읽는다.
