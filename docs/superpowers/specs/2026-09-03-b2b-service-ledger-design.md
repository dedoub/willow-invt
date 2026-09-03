# 윌로우 ↔ 텐소프트웍스 B2B 용역 거래 원장 (Inter-company Service Ledger) 설계 검토

**날짜**: 2026-09-03
**상태**: 검토 의견 + 설계안 (CEO 승인 대기). 법인 서류함(`2026-09-03-corp-records-design.md`) 위에 얹는 두 번째 System of Record.
**대상**: 윌로우인베스트먼트(제공자) ↔ 텐소프트웍스(고객). 같은 구조를 비블로 ↔ 텐소프트웍스에도 적용.

## 1. 검토 결론

CEO 초안의 원칙(실제 업무 → 기록 → 대가 확정 → 증빙 → 세금계산서 → 지급, 이익 배분 금지)은 그대로 채택한다.
DB와 법률 사실을 확인한 결과 초안에 없던 요건 네 가지를 추가해야 이 원장이 실제로 방어력을 갖는다.

| # | 확인된 사실 | 설계에 미치는 영향 |
|---|---|---|
| 1 | **두 회사는 특수관계다.** 텐소 주주명부(2025-12-31, 총 25,720주): 김철형 12,800(49.8%), 김지원 5,120(19.9%), 윌로우 2,200(8.6%). 윌로우는 김동욱·김지원·김류하 100% 가족회사. 김철형은 윌로우의 등기 감사 | 법인세법상 부당행위계산부인 대상 거래. **용역대가의 시가 근거를 건마다 기록**해야 한다(5절). 상법 398조(이사·주요주주와 회사 간 거래): 텐소 주요주주 김지원의 배우자 가족회사인 윌로우와 텐소의 계약은 **텐소 이사회(이사 3인 미만이면 주주총회) 사전 승인 + 거래의 공정성** 요건이 붙는다. 기본계약 체결 자체를 텐소 측 결의 문서와 함께 서류함에 보존한다 |
| 2 | **양사 간 세금계산서는 지금까지 0건.** 양사 현금 흐름은 전부 대여금·상환(`willow_mgmt_cash` transfer / `tensw_mgmt_cash` liability). 2025년 말 텐소→윌로우 대여 잔액 약 1.27억 | 용역대금은 새 채널이다. 실무상 **대여금 상환과 상계**할 유인이 크므로, 상계를 암묵적 순액 처리로 두지 않고 **상계약정 기록**(정산서에 상계액·현금지급액 분리)을 둔다. 4자 대사는 "세금계산서 = 상계액 + 현금지급액"으로 읽는다 |
| 3 | 텐소 쪽에 이미 프로젝트·고객계약·수금 구조가 있다: `tensw_projects`(개발 프로젝트 21), `tensw_project_contracts`(고객 계약 2) + `tensw_contract_payments`, `tensw_mgmt_sales`(매출 세금계산서), `tensw_codef_tax_invoices`(홈택스 수집), `tensw_todos`/`tensw_todo_assignees`/`tensw_comments`(업무 흔적) | 프로젝트 단위를 새로 만들지 않고 **`tensw_projects`를 PROJECT로 재사용**한다. 고객 계약금액은 `tensw_project_contracts`에서 읽는다. 업무 흔적은 이미 쌓이는 곳(todo·코멘트·위키·Gmail·ws_threads)에서 **수집해 연결**하지, 다시 쓰지 않는다 |
| 4 | 법인 서류함 1단계가 문서 원본·버전·해시체인·액션을 이미 제공한다 | 기본계약·업무확인서·정산서·상계약정서는 **서류함 문서**로 저장하고 원장은 `doc_no`만 참조한다. 서류함 문서에 `counterparty_company`를 추가해 한 문서가 양사 목록에 모두 보이게 한다 |

초안에서 바꾸는 것: ① 문서 저장소를 따로 두지 않음(서류함 재사용), ② "프로젝트" 테이블 신설 대신 텐소 프로젝트 참조, ③ 용역대가 산정에 시가 근거 필드 의무화, ④ 상계 명시, ⑤ 특수관계 승인 결의 절차 추가.

## 2. 범위

포함:
- 기본 용역계약(장기, 고정 보수 없음) 체결과 보존, 텐소 측 승인 결의 연결
- 업무기록(work record): 프로젝트·수행법인·기간·내용·산출물 링크
- 용역대가 산정 기록(pricing): 산정 요소 + 시가 근거 + 확정
- 정산(settlement): 여러 업무기록을 월·분기·프로젝트 단위로 묶은 청구 단위. 업무확인서·정산서 생성, 세금계산서·현금·상계 연결, 4자 대사
- 에이전트: 업무 흔적 수집 → 업무기록 초안 → 정산 시점에 문서 생성 → CEO 확인 → 세금계산서 발행 정보 정리 → 지급 매칭 → 보존
- 열람: 텐소 프로젝트 화면과 윌로우 사업관리 화면에서 정산 건을 열면 6절 체인이 한 화면에 나옴

제외(YAGNI):
- 시간 기록(타임시트) UI. 투입 기간은 업무 흔적의 날짜 범위와 CEO 입력으로 잡는다
- 홈택스 세금계산서 자동 발행. 발행 정보만 정리하고 발행은 홈택스에서 한다(수집기는 기존 것)
- 비블로 데이터 실제 등록. 스키마는 `provider_company`/`client_company`로 범용화만 한다
- 회계 분개 생성. 기존 현금관리 행에 링크만 한다

## 3. 핵심 원칙

1. **업무가 먼저, 돈은 나중**: 업무기록 없는 정산은 만들 수 없다(DB 제약). 정산에 묶이지 않은 지급은 대사에서 "근거 없음"으로 뜬다.
2. **시가로 설명 가능한 가격**: 모든 대가 확정에 산정 방식과 근거(단가표·유사 거래·투입량)를 남긴다. 텐소 이익이나 현금 잔액은 산정 요소가 아니며, 산정 기록에 그런 표현이 들어오면 에이전트가 거부한다.
3. **문서는 서류함, 관계는 원장**: PDF와 서명본은 법인 서류함, 링크·금액·상태는 이 원장.
4. **네 숫자의 일치**: 업무기록 합계 = 정산서 = 세금계산서 = (윌로우 매출 현금 + 상계) = (텐소 비용 현금 + 상계). 차이는 자동으로 액션이 된다.
5. **법인 귀속**: 수행 주체는 사람이 아니라 법인(`willow|tensw|biblo|external`).

## 4. 아키텍처

```
[업무 흔적 소스]  tensw_todos(assignee 김동욱)·tensw_comments·work_wiki(tensw-mgmt)·Gmail(tensoftworks)·ws_threads
        ↓ 에이전트 수집 (월 1회 또는 "이번 달 정산 준비해")
[b2b_work_records]  프로젝트·수행법인·기간·요청/수행 내용·산출물 링크(evidence)
        ↓ CEO 확인
[b2b_pricings]      산정 요소·시가 근거·금액 → 확정
        ↓ 묶기 (월/분기/프로젝트)
[b2b_settlements]   정산 단위: 업무확인서·정산서(서류함 doc) → 세금계산서 발행 정보 → 발행본 매칭 → 현금/상계 매칭 → 4자 대사 → closed
        ↓
[법인 서류함]       기본계약(contract, 양사) · 텐소 승인결의(의사결정 건) · 업무확인서 · 정산서 · 상계약정서
[기존 재무]         willow_finance_tax_invoices(매출) / tensw_codef_tax_invoices(매입) / willow_mgmt_cash / tensw_mgmt_cash
```

실행 입구는 서류함과 같다: 편집기 CLI 세션과 텔레그램 윌리, 스킬 `.claude/skills/b2b-ledger/SKILL.md`, CLI `scripts/b2b-ledger.ts`.

## 5. 데이터 모델 (접두사 `b2b_`, 주 프로젝트)

### 5.1 `b2b_agreements` — 기본 용역계약
| 컬럼 | 설명 |
|---|---|
| id | |
| provider_company, client_company | `willow` → `tensw` 등 |
| title | "윌로우-텐소프트웍스 기본 용역계약" |
| scope jsonb | 업무범위 목록(초안 2절) |
| rate_card jsonb | 시가 근거 단가표: `[{ role:'사업기획/PM', unit:'day', amount:..., basis:'SW기술자 평균임금 2026 (KOSA) 중급' }, ...]`. 고정 지급 의무 없음 |
| effective_from, effective_to | |
| document_doc_no | 서류함 계약 문서 |
| approval_decision_ref | 텐소 측 승인 결의(서류함 의사결정 ref_no). 상법 398조 요건 |
| status | draft \| active \| terminated |

### 5.2 `b2b_work_records` — 업무기록
| 컬럼 | 설명 |
|---|---|
| id, ref_no | `WT-2026-014` (provider-client 접두사 W→T) |
| agreement_id | |
| project_id | `tensw_projects.id` (nullable: 프로젝트 무관 업무) |
| provider_company, client_company | |
| title | 업무명 |
| requested_at, period_from, period_to | 요청일·수행기간 |
| request_text | 요청 내용 |
| performed_text | 실제 수행 내용 |
| purpose | 업무 목적·프로젝트와의 관계 |
| contacts jsonb | 관련 담당자 |
| status | draft(에이전트 초안) \| confirmed(CEO 확인) \| priced \| settled |
| settlement_id | 묶인 정산 |

### 5.3 `b2b_work_evidence` — 산출물·업무 흔적 링크
| 컬럼 | 설명 |
|---|---|
| work_record_id | |
| kind | todo \| comment \| wiki \| email \| file \| commit \| meeting \| doc \| other |
| source_table, source_id | 예: `tensw_todos` / id, `work_wiki` / id, gmail thread id |
| title, url, occurred_at | |
| doc_no | 서류함 문서인 경우 |

### 5.4 `b2b_pricings` — 용역대가 산정
| 컬럼 | 설명 |
|---|---|
| work_record_id (unique) | |
| method | rate_card \| comparable \| lump_sum |
| factors jsonb | 규모·난이도·투입일수·중요도·기여도 |
| basis_text | 시가 근거 서술(단가표 항목, 유사 업무 가격, 실제 결과물) |
| computed_amount | 산정식 결과 |
| agreed_amount | 확정 금액(공급가액) |
| decided_at, decided_by | |

### 5.5 `b2b_settlements` — 정산(청구) 단위
| 컬럼 | 설명 |
|---|---|
| id, ref_no | `WT-S-2026-003` |
| agreement_id, provider_company, client_company | |
| period_label | "2026-08" / "PROJECT A 완료" |
| supply_amount, vat_amount, total_amount | 업무기록 합계(트리거로 검증) |
| confirmation_doc_no, statement_doc_no | 업무확인서·정산서(서류함) |
| tax_invoice_willow_id, tax_invoice_tensw_id | `willow_finance_tax_invoices` / `tensw_codef_tax_invoices` |
| offset_amount, offset_doc_no | 대여금 상계액과 상계약정서 |
| cash_willow_ids uuid[], cash_tensw_ids uuid[] | 현금 수취·지급 행 |
| reconciliation jsonb | `{ work_sum, statement, invoice_w, invoice_t, cash_w, cash_t, offset, ok, diffs:[...] }` |
| status | open \| documents_ready \| invoiced \| paid \| closed \| disputed |

### 5.6 `b2b_events` — 감사 로그
서류함의 `willow_corp_events`를 그대로 쓴다(`entity_type='b2b_settlement'` 등). 별도 테이블 없음.

### 5.7 서류함 변경
`willow_corp_documents.counterparty_company text` 추가. 양사 계약·정산 문서는 `company='willow', counterparty_company='tensw'`로 한 번만 저장하고, 텐소 목록 조회는 `company='tensw' or counterparty_company='tensw'`.

## 6. 증빙 체인 (정산 건을 열면 보이는 것)

```
프로젝트 (tensw_projects)  ← 고객 계약 (tensw_project_contracts, 금액)
  └ 기본 용역계약 (b2b_agreements → 서류함 doc + 텐소 승인 결의)
      └ 업무기록 n건 (b2b_work_records) ── 산출물·흔적 (b2b_work_evidence)
          └ 산정 기록 (b2b_pricings: 요소·시가 근거·확정액)
              └ 정산 (b2b_settlements)
                  ├ 업무확인서 · 정산서 · (상계약정서)  [서류함]
                  ├ 세금계산서: 윌로우 매출본 = 텐소 매입본
                  └ 지급: 윌로우 수취 현금 + 텐소 지급 현금 + 상계
                      └ 대사 결과 (reconciliation.ok / diffs)
```

10절의 여섯 질문은 각각 `work_records`, `work_evidence`, `pricings`, `agreements`+`work_records`, `tax_invoice_*`, `cash_*`로 답한다.

## 7. 에이전트 역할

| 시점 | 에이전트 행동 | CEO 행동 |
|---|---|---|
| 기본계약 체결(1회) | 초안(범위·단가표·상계 조항·상법 398조 문구) 생성 → 서류함 draft → 텐소 승인 결의 문서 초안(텐소 서류함, company=tensw) | 양사 서명, 텐소 결의 서명 |
| 월말 또는 프로젝트 종료 | 흔적 수집(todo·코멘트·위키·메일·스레드에서 김동욱/윌로우 귀속분) → 업무기록 초안 + evidence 링크 → 요약 제시 | 업무기록 확인·수정(귀속 법인 판단 포함) |
| 대가 산정 | 단가표×투입 또는 유사 거래로 산정식 제시, 시가 근거 문장 작성. 이익·현금 잔액 언급은 거부 | 금액 확정 |
| 정산 문서 | 업무확인서·정산서 PDF → 서류함 draft → 서명 요청 | 서명본 업로드 |
| 세금계산서 | 발행 정보(공급가액·세액·품목·일자) 정리. 홈택스 수집기가 가져온 발행본을 금액·일자·거래처로 매칭 | 홈택스 발행 |
| 지급 | 현금관리 행(양사) 매칭, 상계 시 상계약정서 생성 | 이체 또는 상계 확인 |
| 대사 | 네 숫자 비교 → 불일치는 `disputed` + 액션 | 불일치 처리 |

## 8. 회계·세무 연결

- 윌로우: `willow_finance_tax_invoices`(sales) + `willow_mgmt_cash`(revenue) ← settlement 링크
- 텐소: `tensw_codef_tax_invoices`(purchase) + `tensw_mgmt_cash`(expense, 외주용역비) ← settlement 링크
- 상계: 양사 현금관리에 "대여금 상환(상계)" 행을 각각 만들고 settlement.offset에 연결. 대여 잔액 계산이 이미 현금관리 행 기준이므로 자연히 반영된다.
- 대사 함수 `b2b_reconcile(settlement_id)`: work_sum = supply_amount = invoice_w.supply = invoice_t.supply, total = cash_w + cash_t(절대값) + offset. 차이 1원 이상이면 diffs.

## 9. 열람

- 텐소 페이지(`/tensw`) 프로젝트 상세에 "윌로우 용역" 블록: 업무기록 목록·정산 상태.
- 윌로우 사업관리(`/mgmt`) 매출관리에 정산 건 표시(세금계산서 행 옆에 정산 ref_no 배지).
- 정산 상세 다이얼로그: 6절 체인을 위에서 아래로. 문서는 서명 URL로 열기.
- linear 공식 컴포넌트만 사용. 입력 폼 없음(CLI·윌리 입구).

## 10. 구현 단계 (법인 서류함 2단계 이후)

1. **스키마·CLI**: `b2b_*` 5테이블 + 서류함 `counterparty_company` + `scripts/b2b-ledger.ts`(agreement·work·evidence·price·settle·reconcile) + 테스트(대사 계산, ref_no, 합계 검증)
2. **기본계약 체결**: 계약 초안 템플릿(범위·단가표·상계·398조) + 텐소 승인 결의 → 서류함 등록. 첫 실전 문서
3. **에이전트 수집·정산**: 스킬 + 흔적 수집기 + 업무확인서·정산서 템플릿 + 세금계산서·현금 매칭 + 대사
4. **열람**: 텐소·윌로우 화면 블록

## 11. 확인이 필요한 사항

1. **텐소 이사 수**: 텐소 등기부로 이사 수를 확인해야 398조 승인 기관(이사회 vs 주주총회)이 정해진다. 텐소 등기부등본을 서류함(company=tensw)에 등록하면 프로필에서 자동 판정.
2. **단가표 기준**: SW기술자 평균임금(KOSA) 등급을 쓸지, 컨설팅 일당을 별도로 정할지. 시가 근거로 가장 무난한 건 공표 단가 인용이다.
3. **상계 허용 여부**: 대여금 상환과 용역대금 상계를 원칙으로 할지, 현금 지급 후 별도 상환으로 할지. 상계가 기본이면 기본계약에 상계 조항을 넣는다.
4. **비블로**: 법인 정보(사업자번호·대표)를 언제 등록할지. 스키마는 준비되지만 실제 등록은 후순위.
5. **김동욱 텐소 지분**: 주주명부에 김동욱 개인 지분은 없다. 김지원 지분(19.9%)의 성격(배우자 여부)에 따라 398조 적용 문장이 달라지므로 계약서 초안 전에 확인.
