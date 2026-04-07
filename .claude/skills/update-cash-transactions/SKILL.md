---
name: update-cash-transactions
description: 은행계좌내역 파일을 받아 각사별 현금관리 테이블(tensw_mgmt_cash/willow_mgmt_cash)에 업데이트. "계좌내역 정리", "현금관리 업데이트", "은행 거래내역", "계좌 업데이트" 시 사용.
---

# Update Cash Transactions

은행 계좌 거래내역(Excel/CSV)을 받아서 기존 인보이스 테이블에 직접 업데이트하는 워크플로우.
별도 테이블 없이 프론트엔드가 읽는 테이블에 바로 넣는다.

## 대상 테이블

| 회사 | 테이블 | 프론트엔드 |
|------|--------|-----------|
| 텐소프트웍스 | `tensw_mgmt_cash` | /tensoftworks/management → 현금관리 |
| 윌로우 | `willow_mgmt_cash` | /willow-investment/management → 현금관리 |

**Supabase 프로젝트**: experiment-apps (`axcfvieqsaphhvbkyzzv`)

## 인보이스 테이블 구조

| 컬럼 | 타입 | 설명 |
|------|------|------|
| type | text | 'revenue' / 'expense' / 'asset' / 'liability' |
| counterparty | text | 거래 상대방 |
| description | text | 거래 내용 |
| amount | numeric | 금액 (음수 가능 — 환급, 상환 등) |
| payment_date | date | 거래일 |
| status | text | 'completed' (은행 거래는 항상 완료) |
| account_number | text | 계좌 표시 (예: '우리 1005-403-461450') |
| notes | text | 메모 (선택) |

## 거래 분류 규칙

### 입금 (credit)
| 패턴 | type | amount | counterparty |
|------|------|--------|-------------|
| 용역비, 수수료수입 | revenue | +금액 | 발주처명 |
| 부가세 환급 (삼성세무서 등) | expense | -금액 | 국세 |
| 대여금 상환 (윌로우→텐소프트) | asset | -금액 | 상대 법인명 |
| 대표 대여상환 (김동욱→회사) | liability | -금액 | 김동욱 |
| 대표 대여상환 (김철형→텐소프트) | liability | -금액 | 김철형 |
| 외화환전 입금 | revenue | +금액 | Exchange Traded Concepts 등 |

### 출금 (debit)
| 패턴 | type | amount | counterparty |
|------|------|--------|-------------|
| 카드결제, 전기요금, AWS, 수수료 | expense | +금액 | 업체명 |
| 대출이자 | expense | +금액 | 은행명 |
| 대출상환 (원금) | expense | +금액 | 은행명 (SBI, 하나캐피탈 등) |
| 국세/지방세 | expense | +금액 | 국세/지방세 |
| 대여금 지급 (텐소프트→윌로우) | liability | -금액 | 윌로우인베스트먼트 |
| 대여금 지급 (윌로우→텐소프트) | asset | +금액 | 텐소프트웍스 |
| 4대보험 | expense | +금액 | 국민연금/건강보험 |

### 부가세 환급 처리 (중요!)
- type: `expense` (매출 아님!)
- amount: `-금액` (마이너스 비용)
- description: "부가세 환급 (비용조정)"
- notes: "매출이 아닌 비용 환급으로 처리"

## 계좌 정보

### 텐소프트웍스
| 은행 | 계좌번호 | account_number 표기 |
|------|----------|-------------------|
| 우리은행 | 1005403461450 | 우리 1005-403-461450 |
| 우리은행 | 1005704524272 | 우리 1005-704-524272 |
| 신한은행 | 140013150883 | 신한 140-013-150883 |

### 윌로우인베스트먼트
| 은행 | 계좌번호 | account_number 표기 |
|------|----------|-------------------|
| 신한은행 | (원화) | 신한 (원화) |
| 신한은행 | (외화 USD) | 신한 (외화 USD) |

### 외화 계좌 처리
- 외화 입금(EXCHANGE TRADE 등)은 currency='USD', amount는 달러 기준
- 환전 후 원화 입금은 별도 원화 거래로 기록
- 외화계좌 Excel 컬럼: 거래일 | 적요 | 찾으신금액 | 맡기신금액 | 잔액 | 거래점

## Workflow

### Step 1: 파일 파싱
1. CEO가 Excel 파일 전달 (텔레그램 → `scripts/logs/tmp/`)
2. Node.js로 Excel 파싱 (xlsx 라이브러리)
3. 은행별 컬럼 매핑:

**우리은행**: No. | 거래일시 | 적요 | 기재내용 | 지급(원) | 입금(원) | 거래후 잔액(원) | 취급점 | 메모
**신한은행**: No | 전체선택 | 거래일시 | 적요 | 입금액 | 출금액 | 내용 | 잔액 | 거래점명 | 입금인코드 | 메모

> 주의: 신한은행은 입금/출금 순서가 우리은행과 반대!

### Step 2: 거래 분류
각 거래를 위 분류 규칙에 따라 type/amount/counterparty 결정.
자사 계좌간 이체(운영비이체 등)는 **스킵** (프론트에 불필요).

### Step 3: 중복 체크 후 INSERT
```sql
-- 같은 날짜 + 같은 금액 + 같은 거래처가 있으면 스킵
INSERT INTO tensw_mgmt_cash (type, counterparty, description, amount, payment_date, status, account_number, notes)
SELECT v.type, v.counterparty, v.description, v.amount, v.payment_date, 'completed', v.account_number, v.notes
FROM (VALUES (...)) AS v(type, counterparty, description, amount, payment_date, account_number, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM tensw_mgmt_cash
  WHERE counterparty = v.counterparty
    AND amount = v.amount
    AND payment_date = v.payment_date
);
```

### Step 4: 미수금 인보이스 매칭
입금 내역 중 매출(revenue)로 분류된 건이 있으면, 같은 테이블에서 `status='issued'`인 기존 인보이스와 매칭하여 `status='completed'`로 업데이트.
```sql
-- 매칭 기준: counterparty 유사 + amount 일치 + status='issued'
UPDATE tensw_mgmt_cash SET status = 'completed', payment_date = '입금일'
WHERE status = 'issued' AND counterparty ILIKE '%거래처%' AND amount = 입금액;
```
> 세금계산서(invoice_number 있는 건)도 함께 확인. 오늘 발견한 이슈: 현금관리와 세금계산서가 같은 테이블이지만, 세금계산서 쪽 미수금 처리를 놓칠 수 있음.

### Step 5: Playwright 검증
DB 업데이트 후 반드시 프론트엔드에서 실제 반영 여부를 확인:
1. 해당 회사 현금관리 페이지 열기
2. 추가한 거래가 표시되는지 확인
3. 표 뷰에서 합계 금액이 정확한지 확인
4. 미수금 뱃지가 사라졌는지 확인 (Step 4에서 처리한 경우)

### Step 6: 검증 & 보고
1. 추가된 건수 / 스킵된 건수 보고
2. 계좌별 잔액 요약
3. 주요 입출금 하이라이트
4. 윌로우 ↔ 텐소프트웍스 자금 흐름
5. 미수금 → 수금완료 처리 건수

## 자주 나오는 거래 패턴

| 키워드 | 분류 | type | 비고 |
|--------|------|------|------|
| SBI, CMS | 대출상환 | expense | SBI저축은행 4.8억 |
| 하나캐피탈 | 리스료 | expense | |
| 대출이자 + 대출번호 | 이자비용 | expense | account_number에 대출번호 표시 |
| 김철형대여상환 | 대표 대여금 상환 | liability (-) | |
| 윌로우대여금/상환 | 관계사 자금 | asset/liability | |
| 우리카드 | 카드결제 | expense | |
| 부가세, I-지로 | 세금 | expense | |
| 삼성세무서 환급 | 부가세 환급 | expense (-) | 비용조정 |
| 서울특별시체육회 | 용역비 수입 | revenue | |
| 운영비이체 | 자사간 이체 | **스킵** | 프론트 불필요 |
| 발급수수료 | 은행 수수료 | expense | |
| EXCHANGE TRADE | 외화 환전 | 별도 처리 | 외화 계좌 전용 |
