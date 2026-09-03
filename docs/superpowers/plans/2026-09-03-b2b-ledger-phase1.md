# B2B 용역 거래 원장 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 윌로우↔텐소프트웍스 용역 거래를 세금계산서 단위로 묶어 "왜·무엇을·얼마에·어떤 계약으로·청구했고·받았나"를 기록하는 원장(`b2b_*`)과 CLI, 읽기 페이지 `/b2b`, 증빙 묶음(ZIP) 생성기를 만든다. 법인 서류함(`willow_corp_*`)의 문서·이벤트를 재사용한다.

**Architecture:** 스키마는 Supabase 주 프로젝트에 `b2b_` 접두사 6테이블 + ref_no 함수 + 대사 함수 + 정산 종료 가드 트리거. 순수 로직(`scripts/lib/b2b-ledger/*.mjs`, node:test)과 DB 리포지토리(`db.mjs`)는 법인 서류함 모듈(`scripts/lib/corp-records/db.mjs`의 `createCorpDb`)을 import해 문서 등록과 이벤트 체인을 공유한다. CLI는 `scripts/b2b-ledger.ts`. 읽기 API `src/app/api/b2b/*`와 페이지 `/b2b`는 법인 서류함 페이지의 패턴(linear 컴포넌트, `denyUnlessDashboardAccess`)을 그대로 따른다. 증빙 묶음은 Playwright로 인덱스 PDF를 만들고 시스템 `zip`으로 묶어 서류함 문서(`evidence_bundle`)로 저장한다.

**Tech Stack:** Node 26, tsx, `@supabase/supabase-js`, `playwright` (chromium, 이미 설치), 시스템 `zip`, node:test, Supabase MCP `apply_migration`/`execute_sql`, Next.js 16 App Router, linear 디자인 시스템.

**Spec:** `docs/superpowers/specs/2026-09-03-b2b-service-ledger-design.md` (5절 데이터 모델, 6절 체인, 6-1절 증빙 묶음, 8절 회계 연결). 법인 서류함 스펙 `docs/superpowers/specs/2026-09-03-corp-records-design.md`도 참조.

## Global Constraints

- 대상 DB는 주 프로젝트 `axcfvieqsaphhvbkyzzv`. 마이그레이션 파일 `supabase/migrations/YYYYMMDDHHMMSS_snake.sql`, 적용은 MCP `apply_migration`.
- 모든 `b2b_*` 테이블에 `provider_company text not null`, `client_company text not null` (`willow|tensw|biblo` 검사 제약). RLS 활성 + `"service_role all"` 정책만.
- ref_no 형식: 업무기록 `WT-2026-014`, 개별 약정 `WT-E-2026-002`, 정산 `WT-S-2026-003`. 접두사는 provider·client 첫 글자 대문자 조합(willow→W, tensw→T, biblo→B), 연도별 3자리 시퀀스(999 초과 시 자릿수 확장, `willow_corp_next_ref_no`와 같은 방식).
- 정산 `closed` 전이는 트리거가 막는다: 업무기록 합계 = supply_amount, 정산서·업무확인서 문서가 `final`, 세금계산서 양측 id 존재, 현금 합계 = total_amount, 개별 약정 정산 누계 ≤ fee_amount. 어긋나면 `raise exception`. 대여금 상계는 없다.
- 모든 쓰기는 이벤트를 남긴다: `willow_corp_events`에 `company = provider_company`, `entity_type in ('b2b_agreement','b2b_engagement','b2b_work','b2b_settlement')`, `entity_id = ref_no 또는 id`. `createCorpDb().appendEvent`만 사용(체인 규칙 동일).
- 문서는 법인 서류함에만 저장한다. 서류함 `willow_corp_documents`에 `counterparty_company text` 컬럼과 doc_type `evidence_bundle`을 추가한다(기존 doc_type은 check 제약이 없으므로 상수 목록만 확장).
- 산정 기록(`b2b_pricings.basis_text`)은 비어 있으면 거부한다. `factors`나 `basis_text`에 `이익|잉여|현금 잔|남은 돈` 문자열이 들어오면 CLI가 거부한다(시가 원칙, 스펙 3절 2항).
- 커밋되는 파일에 개인정보를 넣지 않는다. 원본 파일은 `scripts/logs/corp-records/`(gitignore).
- 커밋 메시지 영어, 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. 커밋 전 `git branch --show-current` 확인.
- 테스트: `npm run b2b:test` (= `node --test scripts/lib/b2b-ledger/*.test.mjs`). 타입: `npx tsx --check scripts/b2b-ledger.ts`, `npx tsc --noEmit`(src만).
- UI는 linear 공식 컴포넌트만(`LCard`, `LSectionHead`, `LStat`, `LSegmented`, `LTable*`, `LTableBadge`, `LBtn`, `Bone`), 폰트 크기는 `calc(Npx * var(--fz, 1))`. 쓰기 라우트 없음.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `supabase/migrations/20260903170000_b2b_ledger.sql` | `b2b_*` 6테이블, `b2b_next_ref_no`, `b2b_reconcile`, 종료 가드 트리거, RLS, 서류함 `counterparty_company` |
| `scripts/lib/b2b-ledger/constants.mjs` | 회사 접두사, enum, 금지어 |
| `scripts/lib/b2b-ledger/ids.mjs` | `formatB2bRef` / `parseB2bRef` |
| `scripts/lib/b2b-ledger/reconcile.mjs` | 순수 대사 계산 `reconcile(input) → { ok, diffs, figures }` |
| `scripts/lib/b2b-ledger/pricing.mjs` | 산정식(`rate_card`/`percent_of_contract`/`lump_sum`), 금지어 검사 |
| `scripts/lib/b2b-ledger/db.mjs` | 리포지토리(`createB2bDb({ url, key, actor })`), corp db 재사용 |
| `scripts/lib/b2b-ledger/bundle.mjs` | 증빙 묶음: 인덱스 HTML→PDF, 문서 다운로드, zip, 서류함 등록 |
| `scripts/lib/b2b-ledger/*.test.mjs` | 순수 로직 테스트 |
| `scripts/b2b-ledger.ts` | CLI 진입점 |
| `src/lib/willow-corp/constants.ts` | 서류함 doc_type 라벨에 `evidence_bundle` 추가(`src/types/willow-corp.ts` 수정) |
| `src/types/b2b.ts` | 읽기 모델 타입 |
| `src/app/api/b2b/settlements/route.ts`, `settlements/[ref]/route.ts` | 읽기 API |
| `src/app/(dashboard)/(linear)/b2b/{layout,page}.tsx`, `_components/*` | 읽기 페이지 |
| `src/app/(dashboard)/_components/linear-nav.ts` | 사이드바 항목 `용역 거래` (`/b2b`) |

---

### Task 1: 상수·ref_no·산정·대사 순수 로직

**Files:**
- Create: `scripts/lib/b2b-ledger/constants.mjs`, `ids.mjs`, `pricing.mjs`, `reconcile.mjs`
- Test: `scripts/lib/b2b-ledger/ids.test.mjs`, `pricing.test.mjs`, `reconcile.test.mjs`
- Modify: `package.json` scripts: `"b2b": "npx tsx scripts/b2b-ledger.ts"`, `"b2b:test": "node --test scripts/lib/b2b-ledger/*.test.mjs"`

**Interfaces (Produces):**
- `constants.mjs`: `COMPANY_INITIAL = { willow:'W', tensw:'T', biblo:'B' }`, `COMPANIES`, `REF_KINDS = { work:'', engagement:'E', settlement:'S' }`, `FEE_BASIS = ['fixed','percent_of_contract','rate_card']`, `PRICING_METHODS = ['rate_card','comparable','lump_sum']`, `SETTLEMENT_STATUSES = ['open','evidence_drafted','confirmed','documents_ready','paid','closed','disputed']`, `WORK_STATUSES = ['draft','confirmed','priced','settled']`, `EVIDENCE_KINDS = ['todo','comment','wiki','email','file','commit','meeting','doc','other']`, `FORBIDDEN_BASIS = ['이익', '잉여', '현금 잔', '남은 돈', '배분']`
- `ids.mjs`: `formatB2bRef({ provider, client, kind, year, seq })` → `WT-2026-014` / `WT-E-2026-002` / `WT-S-2026-003`; `parseB2bRef(ref)` → `{ provider:'W', client:'T', kind, year, seq } | null`
- `pricing.mjs`: `computeFee({ basis, percent, contractAmount, amount })` → number (percent_of_contract = round(contractAmount × percent / 100)); `computePricing({ method, factors, rateCard })` → number for `rate_card` (Σ days × unit amount by role), pass-through for others; `assertBasisAllowed(text, factors)` throws `Error('basis must cite market evidence, not profit or cash')` when any FORBIDDEN_BASIS substring appears in `text` or JSON.stringify(factors)
- `reconcile.mjs`: `reconcile({ workSum, supplyAmount, vatAmount, totalAmount, invoiceProviderSupply, invoiceClientSupply, cashProviderIn, cashClientOut, engagementFee, engagementSettledBefore, documentsFinal })` → `{ ok: boolean, diffs: string[], figures: {...echo} }`. Rules: workSum===supplyAmount; supplyAmount===invoiceProviderSupply===invoiceClientSupply (null invoice → diff `invoice_provider_missing`/`invoice_client_missing`); totalAmount===supplyAmount+vatAmount; cashProviderIn===totalAmount; Math.abs(cashClientOut)===totalAmount; engagementFee != null → engagementSettledBefore+supplyAmount ≤ engagementFee else diff `engagement_cap_exceeded`; documentsFinal===false → diff `documents_not_final`. Tolerance 0 (정수 원).

- [ ] Step 1: package.json 스크립트 2줄 추가.
- [ ] Step 2: 세 테스트 파일 작성 (각 5개 이상 케이스: 포맷/파싱 왕복·999 초과 확장·미지 회사 거부 / percent 반올림·rate_card 합산·금지어 거부(한글 '이익' 포함) / 전부 일치 ok·각 불일치 diff 코드·세금계산서 누락·상한 초과·문서 미확정). `npm run b2b:test` 실패 확인.
- [ ] Step 3: 구현. `npm run b2b:test` 통과, 출력 pristine.
- [ ] Step 4: 커밋 `feat(b2b): add ledger ids, pricing, and reconciliation logic`.

---

### Task 2: 마이그레이션

**Files:** Create `supabase/migrations/20260903170000_b2b_ledger.sql`

**Produces:** 테이블 `b2b_agreements`, `b2b_engagements`, `b2b_work_records`, `b2b_work_evidence`, `b2b_pricings`, `b2b_settlements`; 함수 `b2b_next_ref_no(p_provider text, p_client text, p_kind text, p_year int) → text` (시퀀스는 `willow_corp_sequences`에 `company = provider||'>'||client`, `kind = 'b2b_'||p_kind` 행으로 저장. `willow_corp_sequences.kind`의 check 제약(`decision|document`)을 `b2b_work|b2b_engagement|b2b_settlement` 포함으로 확장), `b2b_reconcile(p_settlement uuid) → jsonb` (SQL로 Task 1의 규칙을 그대로 계산: work_sum은 `b2b_pricings.agreed_amount` 합, invoice_provider_supply는 `willow_finance_tax_invoices.supply_amount`, invoice_client_supply는 `tensw_codef_tax_invoices.supply_amount`, cash_provider_in은 `willow_mgmt_cash.amount` 합(ids 배열), cash_client_out은 `tensw_mgmt_cash.amount` 합의 절대값, documents_final은 두 doc_no의 `willow_corp_documents.status='final'`), 트리거 `b2b_settlements_close_guard`(BEFORE UPDATE: `new.status='closed' and old.status<>'closed'` 이면 `b2b_reconcile(new.id)->>'ok'`가 `'true'`가 아닐 때 `raise exception 'settlement % cannot close: %'`; 닫힌 뒤에는 status 외 컬럼 변경 금지 = `willow_corp_guard_decision`과 같은 jsonb 비교), `b2b_touch_updated_at`.

컬럼은 스펙 5.1~5.5 그대로. 추가 사항: 모든 테이블 `provider_company`/`client_company` + `check (provider_company in ('willow','tensw','biblo'))`, `ref_no text unique`(work/engagement/settlement), `source_key text unique`(시드·멱등용), `created_at`, `updated_at`. `b2b_settlements`에 `opened_from text check in ('tax_invoice','work_records')`, `bundle_doc_no text`, `tax_invoice_willow_id uuid references willow_finance_tax_invoices(id)`, `tax_invoice_tensw_id uuid references tensw_codef_tax_invoices(id)`, `cash_willow_ids uuid[] default '{}'`, `cash_tensw_ids uuid[] default '{}'`, `reconciliation jsonb`. `b2b_work_records.settlement_id` FK, `b2b_pricings.work_record_id unique FK`, `b2b_work_evidence.work_record_id FK`. 서류함: `alter table willow_corp_documents add column if not exists counterparty_company text; create index ... (counterparty_company)`. RLS + 정책 루프는 법인 서류함 마이그레이션과 같은 `do $$` 블록.

- [ ] Step 1: SQL 작성(전문). `b2b_next_ref_no`는 `willow_corp_next_ref_no`의 `case when v_seq < 1000 ...` 방식 그대로.
- [ ] Step 2: MCP `apply_migration`(name `b2b_ledger`).
- [ ] Step 3: `execute_sql` 검증: `select b2b_next_ref_no('willow','tensw','work',2026)` → `WT-2026-001`; `('willow','tensw','settlement',2026)` → `WT-S-2026-001`; 빈 정산을 만들어 `update ... set status='closed'` 시 예외 문구에 `work_sum` 불일치가 포함되는지; 이후 테스트 행 삭제(정산은 open 상태라 삭제 가능), 시퀀스 행 `kind like 'b2b_%' and year=2026` 삭제.
- [ ] Step 4: 커밋 `feat(b2b): add ledger schema with close guard and reconciliation`.

---

### Task 3: 리포지토리 `db.mjs`

**Files:** Create `scripts/lib/b2b-ledger/db.mjs`

**Consumes:** `createCorpDb` (`scripts/lib/corp-records/db.mjs`: `appendEvent`, `createDocument`, `addVersion`, `getDocument`, `signedUrl`, `client`), Task 1 순수 함수.
**Produces:** `createB2bDb({ url, key, actor }) → {
 corp, // createCorpDb 인스턴스
 nextRef(provider, client, kind, year),
 createAgreement({ provider, client, title, scope, rateCard, effectiveFrom, effectiveTo, documentDocNo, approvalDecisionRef, sourceKey }),
 activateAgreement(id), listAgreements({ provider, client }),
 createEngagement({ agreementId, projectId, clientContractId, roleScope, feeBasis, feePercent, feeAmount, basisText, billingPlan, agreedAt, documentDocNo, sourceKey }) // fee_amount는 percent이면 computeFee로 계산; basisText 금지어 검사
 listEngagements({ agreementId }), getEngagement(ref),
 createWork({ agreementId, engagementId, projectId, title, requestedAt, periodFrom, periodTo, requestText, performedText, purpose, contacts, sourceKey }),
 confirmWork(ref), addEvidence({ workRef, kind, sourceTable, sourceId, title, url, occurredAt, docNo }),
 priceWork({ workRef, method, factors, basisText, computedAmount, agreedAmount, decidedBy }) // assertBasisAllowed; work.status → priced
 openSettlement({ agreementId, engagementId, periodLabel, supplyAmount, vatAmount, totalAmount, openedFrom, taxInvoiceWillowId, taxInvoiceTenswId, sourceKey }) // status open, ref 발급
 attachWork(settlementRef, workRefs[]) // work.settlement_id 설정, work.status → settled
 setDocuments(settlementRef, { confirmationDocNo, statementDocNo }),
 linkInvoices(settlementRef, { willowId, tenswId }), linkCash(settlementRef, { willowIds, tenswIds }),
 setStatus(settlementRef, status) // 'closed'는 reconcileSettlement 결과 ok일 때만 시도(트리거가 최종 방어)
 reconcileSettlement(ref) // rpc b2b_reconcile → reconciliation 컬럼에 저장 + 반환
 getSettlement(ref) // 정산 + 약정 + 업무기록(evidence, pricing 포함) + 문서 + 세금계산서 2건 + 현금 행 요약을 한 객체로
 listSettlements({ provider, client, status }),
 setBundle(settlementRef, docNo)
}`. 각 쓰기는 `corp.appendEvent({ company: provider, entityType, entityId: ref, event, payload })`.

- [ ] Step 1: 구현(약 250줄). 실패 시 `unwrap` 패턴으로 컨텍스트 있는 에러.
- [ ] Step 2: 스모크(라이브): 테스트 약정·업무·정산을 `source_key='__smoke_*'`로 만들고 `reconcileSettlement` → `ok:false` diffs에 `invoice_provider_missing` 포함 확인 → `setStatus(..., 'closed')`가 트리거 예외로 실패하는지 확인 → open 상태 행들 삭제(`client.from(...).delete().eq('source_key', ...)`; 이벤트는 남는다, 허용). 이 삭제 코드는 스모크 스크립트에만 두고 리포지토리에는 삭제 메서드를 만들지 않는다.
- [ ] Step 3: 커밋 `feat(b2b): add ledger repository over corp-records events and documents`.

---

### Task 4: CLI `scripts/b2b-ledger.ts`

**Files:** Create `scripts/b2b-ledger.ts`; Modify `src/types/willow-corp.ts` (`CORP_DOC_TYPE_LABEL.evidence_bundle = '증빙 묶음'`) — 타입 파일은 Task 6에서 UI가 쓰므로 여기서 함께 추가.

`node:util` parseArgs, `.env.local` 로딩(`scripts/corp-records.ts`와 동일). 명령:

| 명령 | 플래그 |
|---|---|
| `agreement new` | `--provider willow --client tensw --title --scope <json> --rate-card <json> --from D [--to D] [--doc <doc_no>] [--approval <ref_no>] [--key]` |
| `agreement activate <id>` / `agreement list` | |
| `engagement new` | `--agreement <id> --project <uuid> [--contract <uuid>] --role <json> --fee-basis --fee-percent N \| --fee-amount N --basis "..." [--billing <json>] --agreed D [--doc <doc_no>] [--key]` |
| `engagement list --agreement <id>` / `engagement show <ref>` | |
| `work new` | `--agreement <id> [--engagement <ref>] [--project <uuid>] --title --from D --to D [--requested D] --request "..." --performed "..." [--purpose] [--contacts <json>] [--key]` |
| `work confirm <ref>` / `work evidence <ref> --kind --source-table --source-id [--title] [--url] [--at D] [--doc <doc_no>]` | |
| `work price <ref>` | `--method --factors <json> --basis "..." [--computed N] --agreed N [--by]` |
| `settle open` | `--agreement <id> [--engagement <ref>] --period "2026-08" --supply N --vat N [--total N] --from tax_invoice\|work_records [--invoice-willow <uuid>] [--invoice-tensw <uuid>] [--key]` |
| `settle attach <ref> --work <ref,ref>` / `settle docs <ref> --confirmation <doc_no> --statement <doc_no>` / `settle invoices <ref> [--willow <uuid>] [--tensw <uuid>]` / `settle cash <ref> [--willow <uuid,...>] [--tensw <uuid,...>]` / `settle status <ref> --to <status>` / `settle show <ref>` / `settle list [--status]` | |
| `reconcile <ref>` | 대사 결과 출력, ok 아니면 exit 1 |
| `bundle <ref>` | Task 5 |

- [ ] Step 1: 구현. 금액 인자는 정수 원. `--total` 생략 시 supply+vat.
- [ ] Step 2: `npx tsx --check scripts/b2b-ledger.ts`; `npm run b2b -- nope` → usage exit 2; `npm run b2b -- agreement list` → `[]`(또는 목록).
- [ ] Step 3: 커밋 `feat(b2b): add ledger CLI`.

---

### Task 5: 증빙 묶음 `bundle.mjs` + `bundle` 명령

**Files:** Create `scripts/lib/b2b-ledger/bundle.mjs`, `scripts/b2b-ledger/templates/bundle-index.html` (머스태시식 `{{ }}` 치환, 인라인 CSS, 한글 폰트 `'Apple SD Gothic Neo','Malgun Gothic',sans-serif`)

**Produces:** `buildBundle({ db, settlementRef, outDir }) → { zipPath, indexPdfPath, manifest }` 와 `registerBundle({ db, settlementRef, zipPath, manifest }) → doc_no`.

절차: `db.getSettlement(ref)` → 문서 목록(기본계약 doc, 약정 doc, 업무확인서, 정산서, 업무기록의 evidence 중 `doc_no`가 있는 것) → 각 문서 최신 확정본을 `corp.client.storage.from('corp-records').download(storage_path)`로 받아 `outDir/docs/<doc_no>_v<n>.<ext>` 저장 → `index.html` 렌더(표지: 정산 ref·기간·양사, 체인 요약 표: 기본계약→약정→업무기록 n건(제목·기간·산정액·근거)→정산서→세금계산서 승인번호·금액 양측→입금 행·금액→대사 결과, 문서 해시 목록: doc_no·버전·sha256·이벤트 id) → Playwright chromium `page.pdf({ path: index.pdf, format:'A4', printBackground:true })` → `manifest.json`(settlement, documents[{doc_no, version_no, sha256, file}], reconciliation, generated_at) → `zip -r -X bundle.zip index.pdf manifest.json docs/`(cwd=outDir, `spawnSync`) → `registerBundle`: `corp.createDocument({ company: provider, docType:'evidence_bundle', category:'contract', title:'증빙 묶음 '+ref+' ('+period+')', tags:['b2b', ref] })` 후 `counterparty_company`를 client로 update(리포지토리에 `setCounterparty(docNo, company)` 추가), `corp.addVersion({ docNo, kind:'final_signed', buffer: zip, mime:'application/zip', contentText: manifest 요약 텍스트, note:'evidence bundle', generatedBy:'agent' })`, `db.setBundle(ref, docNo)`. `application/zip` → `versions.mjs`의 `extensionForMime`에 `'application/zip': 'zip'` 추가(테스트 1줄 추가).

- [ ] Step 1: 템플릿·모듈 구현. 이미지 PDF 문서도 그대로 포함(변환 없음).
- [ ] Step 2: 스모크: Task 3의 `__smoke_*` 정산과 같은 방식으로 정산 1건을 만들고(문서는 서류함의 실제 문서 2개를 `settle docs`로 연결: `WI-DOC-2021-001` 정관을 임시로 statement/confirmation 자리에 넣어도 됨) `npm run b2b -- bundle <ref>` → zip 생성, 서류함 문서 `evidence_bundle` 등록, `unzip -l`로 index.pdf·manifest.json·docs/ 확인. 확인 후 정산 행만 삭제(묶음 문서는 append-only라 남는다 → title에 `[smoke]`를 붙여 구분하고 보고서에 doc_no 기록).
- [ ] Step 3: 커밋 `feat(b2b): generate evidence bundles as corp-records documents`.

---

### Task 6: 읽기 API + `/b2b` 페이지

**Files:**
- Create `src/types/b2b.ts`, `src/app/api/b2b/settlements/route.ts` (`?provider=&client=&status=` → `{ settlements: [...] }` with agreement title, engagement ref, work count, bundle_doc_no, reconciliation), `src/app/api/b2b/settlements/[ref]/route.ts` (정산 + 약정 + 업무기록(증거·산정) + 문서 4종의 doc_no·status + 세금계산서 2건 요약(approval_no, issue_date, supply_amount, total_amount) + 현금 행(payment_date, amount, counterparty) + reconciliation), 둘 다 `denyUnlessDashboardAccess`, `force-dynamic`.
- Create `src/app/(dashboard)/(linear)/b2b/layout.tsx`, `page.tsx`, `_components/settlements-table.tsx`, `_components/settlement-dialog.tsx`; Modify `linear-nav.ts` (윌로우 그룹 `corp` 뒤에 `{ id:'b2b', href:'/b2b', label:'용역 거래', icon:'coin' }`), `linear-skeleton.tsx` (`B2bSkeleton`: KPI 4 + 표 8행).

페이지: `LCard` 상단(eyebrow `INTER-COMPANY LEDGER`, title `용역 거래`, note "세금계산서 한 장마다 업무기록·산정·문서·입금을 묶어 대사합니다.", tools: 방향 `LSegmented`(윌로우→텐소 / 텐소→윌로우 / 비블로→텐소)), KPI `LStat` 4개(열린 정산, 대사 불일치, 이번 연도 청구 합계, 증빙 묶음 수). 두 번째 `LCard`: 상태 `LSegmented`(전체/진행/닫힘/불일치) + `LTable*` 표(정산번호·기간·약정·공급가액·세금계산서 양측 ✓/✗·입금 ✓/✗·대사 배지·묶음 ✓). 행 클릭 → `settlement-dialog.tsx`: 법인 서류함 `document-dialog.tsx`와 같은 오버레이 규격(폭 640), 본문은 6절 체인 순서의 섹션 6개(기본계약·약정 / 업무기록 목록(제목·기간·산정액, 펼치면 수행 내용·근거·증거 링크) / 문서(업무확인서·정산서 배지, "열기" = `/api/willow-corp/documents/<doc_no>/url`) / 세금계산서 양측 / 입금 / 대사 결과(diffs 목록, ok면 done 배지)) + 하단 "증빙 묶음 열기"(bundle_doc_no 있으면) 버튼.

- [ ] Step 1: 타입·API 작성. `execute_sql` 없이 `getServiceSupabase()` 쿼리로 조합.
- [ ] Step 2: 페이지·컴포넌트·네비·스켈레톤. `npx tsc --noEmit`, `npx eslint --ignore-pattern '**/._*' src/app/\(dashboard\)/\(linear\)/b2b src/app/api/b2b` 통과.
- [ ] Step 3: 로컬 개발 서버(`rm -rf .next .turbo node_modules/.cache; npx next dev -p 3106`)에서 `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3106/api/b2b/settlements?provider=willow&client=tensw` 200, 미인증 401, `/b2b` 페이지 200 확인 후 서버 종료.
- [ ] Step 4: 커밋 `feat(b2b): add read-only ledger page and APIs`.

---

### Task 7: 문서 갱신

- Modify `CLAUDE.md`·`AGENTS.md`: MCP 도구 표 아래 "법인 서류함·B2B 원장" 한 줄(CLI 2개, 페이지 2개, 쓰기는 CLI만). `docs/superpowers/specs/2026-09-03-b2b-service-ledger-design.md` 상태 줄을 `**상태**: 승인됨 (2026-09-03). 1단계(스키마·CLI·열람·증빙 묶음) 구현 완료. 2단계 세금계산서 감지·초안 생성 대기`로.
- 커밋 `docs(b2b): register ledger CLI and page; mark phase 1 done`.

---

## Self-Review

- 스펙 5절 6테이블 → Task 2. 5.7 `counterparty_company` → Task 2·5. 6-1 증빙 묶음 → Task 5. 8절 4자 대사 → Task 1 `reconcile` + Task 2 `b2b_reconcile`(같은 규칙 두 벌: JS는 테스트·CLI 미리보기, SQL은 종료 가드의 최종 방어). 9절 열람 → Task 6(전용 페이지로 단순화; 텐소·사업관리 블록 삽입은 2단계). 3절 시가 원칙 → Task 1 `assertBasisAllowed`.
- 이름 일치: `createB2bDb` 메서드명은 Task 3에 정의, Task 4·5·6이 그대로 사용. `formatB2bRef`, `reconcile`, `computeFee`, `assertBasisAllowed` 동일.
- 스모크 데이터 정책: open 정산·약정·업무기록은 삭제 가능(닫히기 전), 이벤트·문서는 남는다. 실데이터가 아직 없어 허용하되 `source_key`에 `__smoke_` 접두사를 붙인다.
