# 법인 서류함 (Corporate Records) 설계

**날짜**: 2026-09-03
**상태**: 검토 대기 (CEO 승인 후 구현 계획 작성)
**대상 회사**: 윌로우인베스트먼트 주식회사 (1차), 텐소프트웍스 (구조는 공유, UI는 후순위)

## 1. 목표

윌로우 업무관리시스템 안에서 주주총회·이사회·임원보수·정관개정·등기·세무·계약 등 법인의 공식 의사결정을
**실제로 수행하고**, 그 증빙을 빠짐없이, 시간순으로, 변경 불가능한 형태로 남긴다.

사용자는 하려는 일을 자연어로 입력한다. 에이전트가 시행 중인 정관·사규와 회사 기본정보(주주 구성, 이사 수,
자본금)를 확인해 필요한 절차와 문서를 판단하고, 초안을 만들고, 서명·날인만 요청하며, 확정본을 PDF 원본으로
보존한다. 등기부등본·사업자등록증·주주명부·계약서 같은 상시 서류도 같은 서류함에서 발급 시점별 버전으로 관리한다.

이 서류함은 파일 저장소가 아니라 **윌로우인베스트먼트의 의사결정 기록 저장소(System of Record)**다.
급여·지급·계약·세무 기록은 이 서류함의 문서 ID를 근거로 참조한다.

## 2. 범위

포함:
- 의사결정 건(decision) 접수 → 절차 판단 → 문서 초안 → 서명 요청 → 확정 → 보존, 전 과정 시스템 내부에서 수행
- 정관·사규의 시행기간별 버전 보존, "특정 시점에 시행 중이던 규정" 조회
- 상시 서류(등기부등본, 사업자등록증, 주주명부, 계약서, 세무 신고·납부 증빙) 등록과 재발급 버전 관리
- 문서·의사결정 고유 ID, 다른 업무 기록(현금관리, 세금관리 등)에서의 참조 링크
- 변조 검출 가능한 감사 로그(해시 체인)
- 입구 둘: 편집기 CLI 세션(Claude Code·Codex)과 텔레그램 윌리. 둘 다 같은 스킬과 CLI 스크립트로 전 과정을 수행
- 웹 `/corp` 페이지는 열람 전용 서류함(의사결정·문서·규정·대기 액션 조회, 문서 열기)
- MCP 도구(`willow_corp_*`)로 윌리·Codex 세션이 서류함을 조회·기록

제외(YAGNI):
- 웹 입력창. CEO가 편집기나 윌리에서 자연어로 지시하므로 GUI 접수 폼은 두지 않는다
- 전자서명·공인인증 연동. 서명은 출력 → 자필서명·날인 → 스캔 업로드로 처리
- 등기소·홈택스에 대한 자동 신청·제출. 등기 필요 여부 판단과 서류 준비까지만
- 텐소프트웍스 전용 UI(스키마의 `company` 컬럼으로 준비만)
- 회계 분개, 급여 계산. 기존 현금관리·세금관리가 담당하고 서류함은 근거 문서만 제공

## 3. 핵심 원칙

1. **규정 우선**: 모든 의사결정은 그 의사결정일에 시행 중이던 정관·사규 버전을 근거로 판단하고, 근거 조항을 건에 기록한다.
2. **추가 전용(append-only)**: 확정된 문서 버전과 감사 이벤트는 수정·삭제하지 않는다. 변경은 새 버전 또는 새 건(대체)으로만.
3. **절차는 회사 사실에서 도출**: 주주 수, 이사 수, 자본금 같은 회사 기본정보를 등기부·주주명부에서 추출해 저장하고, 에이전트는 이를 근거로 소집 생략·서면결의·이사회 부존재 여부를 판단한다.
4. **사용자 행동 최소화**: 시스템이 요청하는 것은 확인(confirm), 서명·날인 후 업로드(sign), 정보 제공(provide) 세 가지뿐.
5. **기존 시스템 재사용**: 실행은 편집기 CLI 세션 + `scripts/` 관례(tsx 스크립트, `scripts/lib/*.mjs` 순수 로직 + node:test), 저장은 Supabase(주 프로젝트), UI는 linear 컴포넌트.

## 4. 아키텍처

```
[입구 A] 편집기 CLI 세션 (Claude Code 또는 Codex, cwd=willow-invt)
         CEO: "내 연봉을 2억원으로 변경해"
[입구 B] 텔레그램 윌리 → dispatch_command → ws_commands(project=willow-invt, source='corp')
         → scripts/ws-dispatcher.ts (30초 주기) → codex exec (cwd=willow-invt) → 결과 텔레그램 보고
                              ↓ 두 입구 모두 스킬 .claude/skills/corp-records/SKILL.md (Codex는 AGENTS.md에서 같은 파일을 가리킴)
[두뇌] 세션 에이전트가 스킬 절차대로 CLI 스크립트를 호출
       1. corp profile + corp rules --at <의사결정일>  → 회사 사실·시행 규정 로드
       2. 절차 판단 (6절) → corp decision new --plan <json>  → 건 생성, 근거·계획 기록
       3. 템플릿 채움 → corp doc render → Playwright HTML→PDF → corp doc add-version (draft) → 버킷 업로드
       4. corp action add (sign/confirm/provide) → 세션에서 CEO에게 요청 사항 출력
                              ↓
[사용자] 초안 PDF 열어 확인(웹 /corp 또는 윌리가 보낸 파일) → 출력·서명·날인 → 스캔 PDF를 세션 또는 윌리에게 건네며 "서명본이야"
         (윌리 경로: 텔레그램 파일 수신 → 로컬 저장 → dispatch_command에 파일 경로 포함)
                              ↓
[확정] corp doc add-version --kind final_signed <file> → sha256·텍스트 추출 → 버전 append
       corp decision finalize → 모든 sign 완료 검증 → finalized → events 해시체인 기록
                              ↓
[열람] 웹 /corp (읽기 전용) · 급여/현금 기록에서 ref_no로 참조
```

로컬(편집기 세션 또는 디스패처 Codex)에서 실행하는 이유: CEO 정책(AI 기능은 Codex CLI) 준수, 한국어 법률 문서 초안에 긴 컨텍스트(정관 전문 + 템플릿)가 필요, PDF 렌더링의 한글 폰트가 macOS에 있음. 디스패처는 이미 30초 주기로 돌고 있어 윌리 경로도 체감 지연이 1분 내외다. 디스패처 변경은 `source='corp'`의 타임아웃 분기(`timeoutForSource`)뿐이다.

CLI 진입점은 `scripts/corp-records.ts` 하나(서브커맨드: `profile`, `rules`, `decision`, `doc`, `action`, `verify`, `seed`). 모든 쓰기는 이 스크립트를 통해서만 하고, 스킬은 SQL 직접 실행을 금지한다.

## 5. 데이터 모델 (주 프로젝트 `axcfvieqsaphhvbkyzzv`, 접두사 `willow_corp_`)

모든 테이블에 `company text not null default 'willow'` (`willow|tensw`), RLS는 service_role 전용(기존 ws_* 관례).

### 5.1 `willow_corp_profiles` — 회사 기본정보 스냅샷
| 컬럼 | 설명 |
|---|---|
| id, company | |
| as_of date | 기준일(등기부 발급일 또는 주주명부 작성일) |
| source_document_id | 근거 문서(FK documents) |
| facts jsonb | `{ corp_reg_no, biz_reg_no, address, capital, shares_issued, par_value, directors:[{role,name,term_end}], auditors:[], shareholders:[{name, shares, relation}], fiscal_year_end, business_purposes:[] }` |
| created_at | |

최신 스냅샷이 현재 사실. 주민등록번호 등 개인식별정보는 facts에 넣지 않는다(이름·지분만).

### 5.2 `willow_corp_rules` — 정관·사규 (시행기간별 버전)
| 컬럼 | 설명 |
|---|---|
| id, company | |
| rule_type | `articles`(정관 본문) \| `retirement_regulation`(별첨1 임원퇴직금지급규정) \| `bonus_regulation`(별첨2 임원상여금지급규정) \| `survivor_regulation`(별첨3 임원유족보상금지급규정) \| `other` |
| parent_rule_id | 별첨 규정이 속한 정관 버전. 정관과 별첨은 같은 문서에 있어도 규정 단위로 따로 버전을 가진다(별첨2·3은 제8조·제4조에 따라 주주총회 결의로만 개폐) |
| title, version_no | |
| effective_from, effective_to | `effective_to null` = 현행. 개정 시 이전 버전의 `effective_to`만 채운다 |
| adopted_by_decision_id | 이 버전을 채택한 의사결정 건(정관개정 결의). 최초 등록은 null |
| document_id | 규정 원본 PDF(FK documents) |
| content_text | 전문 텍스트(에이전트 검색용). 주민등록번호 패턴은 마스킹해 저장하고 원문은 PDF 버전에만 남긴다 |
| articles jsonb | `[{ no:'제30조', title:'임원의 보수', text:'...' }]` 조 단위 파싱 |

조회 함수 `willow_corp_rules_effective_at(company, date)` → 그 날짜에 시행 중이던 규정 세트.

### 5.3 `willow_corp_decisions` — 의사결정 건 (= 회의·결의 그 자체)
| 컬럼 | 설명 |
|---|---|
| id, company | |
| ref_no | 사람이 읽는 고유 ID `WI-2026-003` (회사·연도별 시퀀스, 함수로 발급) |
| category | `shareholders_meeting` \| `board` \| `exec_compensation` \| `articles_rules` \| `registration` \| `tax` \| `contract` \| `other` |
| title | 안건명 |
| request_text | 사용자가 입력한 원문 |
| summary | 결정 내용(에이전트가 정리, 확정 시 고정) |
| decision_date | 의사결정일 |
| effective_from, effective_to | 적용일·적용기간 |
| amount numeric, currency | 관련 금액 |
| parties jsonb | `[{ role:'대표이사', name:'김동욱' }, { role:'주주', name:'...' }]` |
| basis jsonb | `[{ rule_id, article_no, quote }]` 근거 정관·규정 조항 |
| agent_plan jsonb | 판단한 절차: `{ resolution_type:'shareholders_written', needs_board:false, needs_registration:false, documents:[...], reasoning }` |
| status | `draft` → `awaiting_signature` → `finalized`; 종료계 `superseded` \| `void` |
| supersedes_id | 이 건이 대체하는 이전 건 |
| finalized_at, created_at, created_by | |

확정(`finalized`) 이후에는 `status`(→superseded/void), `supersedes_id` 외 컬럼 UPDATE를 트리거로 차단한다.

### 5.4 `willow_corp_documents` — 문서(논리 단위)
| 컬럼 | 설명 |
|---|---|
| id, company | |
| doc_no | `WI-DOC-2026-012` |
| decision_id | 소속 의사결정 건. 상시 서류는 null |
| doc_type | 결의계: `minutes_shareholders`(주주총회 의사록) \| `written_resolution_shareholders`(서면결의서) \| `waiver_notice`(소집절차 생략 동의서) \| `minutes_board` \| `resolution_board` \| `compensation_notice` \| `bonus_payment_resolution` \| `exec_contract` \| `audit_notice`(감사 통지) \| `regulation`(정관·사규 원본); 상시계: `registry_extract`(등기부등본) \| `business_registration`(사업자등록증) \| `license_permit`(통신판매업신고증 등 인허가·신고) \| `shareholder_list`(주주명부) \| `contract` \| `tax_filing` \| `tax_payment_proof` \| `other` |
| category | decisions와 같은 enum(상시 서류 분류용) |
| title | |
| status | `draft` \| `final` |
| current_version_id | |
| issued_by | 발급기관(등기소·세무서·자체) |
| issued_at, valid_from, valid_to | 발급일·유효기간(등기부는 발급일+3개월 관행을 valid_to로) |
| counterparty | 계약 상대방 |
| contract_start, contract_end | 계약기간 |
| tags text[] | |
| created_at | |

### 5.5 `willow_corp_document_versions` — 문서 버전 (추가 전용)
| 컬럼 | 설명 |
|---|---|
| id, document_id, version_no | |
| kind | `draft` \| `final_signed` \| `reissue`(등기부 재발급 등) |
| storage_path | `corp-records/{company}/{doc_no}/v{n}_{sha8}.pdf` |
| mime, size_bytes | |
| sha256 | 파일 해시. 동일 해시 재업로드는 거부 |
| content_text | pdf-parse 또는 OCR 추출 텍스트(검색·에이전트용) |
| generated_by | `agent` \| `upload` |
| note | |
| created_at, created_by | |

`kind in ('final_signed','reissue')` 행은 UPDATE·DELETE를 트리거로 차단한다. 스토리지 버킷 `corp-records`는 private, 앱에 삭제 경로를 만들지 않는다.

### 5.6 `willow_corp_actions` — 사용자에게 요청되는 행동
| 컬럼 | 설명 |
|---|---|
| id, decision_id, document_id | |
| kind | `confirm`(내용 확인) \| `sign`(서명·날인 후 업로드) \| `provide`(정보·파일 제공) |
| description | 에이전트가 쓴 요청문 |
| status | `pending` \| `done` \| `skipped` |
| due_at, done_at, result jsonb | |

### 5.7 `willow_corp_links` — 다른 업무 기록과의 참조
| 컬럼 | 설명 |
|---|---|
| id, decision_id \| document_id | 둘 중 하나 |
| target_table, target_id | 예: `willow_mgmt_cash` / 급여 지급 행 |
| relation | `basis_for`(이 문서가 근거) \| `evidence_of`(이 기록이 이행 증빙) |

### 5.8 `willow_corp_events` — 감사 로그 (해시 체인, 추가 전용)
| 컬럼 | 설명 |
|---|---|
| id bigserial | |
| company, entity_type, entity_id | |
| event | `created` \| `plan_recorded` \| `draft_generated` \| `action_done` \| `version_added` \| `finalized` \| `superseded` \| `void` \| `rule_registered` |
| actor | `agent` \| `dw.kim@willowinvt.com` |
| payload jsonb | |
| prev_hash, hash | `hash = sha256(prev_hash + entity_id + event + payload + at)` |
| at | |

UPDATE·DELETE 차단 트리거. `willow_corp_verify_chain(company)` 함수로 체인 무결성 검증.

## 6. 절차 판단 규칙 (에이전트 스킬의 핵심 지식)

`.claude/skills/corp-records/SKILL.md`에 두고, 규정 원문과 회사 사실은 DB에서 읽는다. 아래 규칙은 2026-09-03 확인한
현행 정관(2021년 제정, 별첨 1~3 포함)을 근거로 한다. 조항 번호는 DB의 `articles`와 일치시킨다.

### 6.1 정관에서 확인된 회사 구조 사실
- 발행주식 200주 × 1주 5,000원 = 자본금 1,000,000원 (제6조, 제7조). 자본금 10억 미만.
- 이사 1명 이상 (제28조). 감사는 자본금 10억 미만이면 두지 않을 수 있음 (제41조).
- 사업연도 1/1~12/31 (제47조), 정기주주총회는 사업연도 종료 후 3월 이내 (제18조).
- 주주 3인(2026-07-17 주주명부: 80주·80주·40주), 전원 가족.
- **등기부등본(2026-06-04 발급) 확인 결과**: 법인등록번호 110111-7840089, 회사 성립 2021-04-05, 본점 서울 강남구 테헤란로70길 12, 402-592에이호(2025-08-29 이전 등기).
  임원은 **사내이사 1인(김동욱, 2024-04-05 중임)** 과 **감사 1인(김철형, 2024-03-31 중임)** 뿐이다. 따라서 이사회는 존재하지 않고(상법 383조①), 정관·규정의 "이사회 결의" 조항은 전부 주주총회 결의로 갈음한다(383조④). 1인 이사가 회사를 대표한다(383조⑥).
- 임기: 이사 3년(제30조) → 2027-04-05 만료, 감사는 2027년 정기주주총회 종결 시(제43조). 둘 다 2027년 3월 정기주주총회에서 중임 결의 + 등기가 필요하다. profile에서 이 만료일을 계산해 `provide` action을 미리 생성한다.
- **사업목적이 2026-05-26 변경·2026-05-27 등기됐다**(삭제 2, 추가 5: 시스템·응용소프트웨어 개발 및 공급업, 정보통신업, 데이터베이스 및 온라인 정보 제공업, 관련 개발업, 관련 도소매업 및 유통업). 사업목적 변경은 정관 제2조 개정이므로 그 시점의 주주총회 특별결의와 개정 정관이 존재해야 한다. CEO가 준 정관 docx는 2021년 원시정관(목적 7항)이라 **정관 v2(2026-05-26 시행)와 그 결의 의사록을 받아 백필**해야 한다.
- 사업자등록증(2025-09-08, 삼성세무서): 등록번호 205-88-01897, 개업 2021-04-05, 업태 전문·과학·기술서비스업 + 정보통신업, 종목 경영컨설팅업 + 데이터베이스 및 온라인 정보 제공업.
- 통신판매업신고증(2026-07-14, 강남구청 제2026-서울강남-03934호). 인허가·신고증은 상시 서류 `license_permit`으로 둔다.

### 6.2 결의 기관 판정 (모든 건에 공통)
| 조건 | 판정 |
|---|---|
| 정관이 "주주총회 결의"를 요구 | 주주총회. 주주 3인·자본금 10억 미만 → 상법 363조④⑤에 따라 주주 전원 동의로 소집절차 생략 + 서면결의. 문서: `waiver_notice`(소집절차 생략 동의서) + `written_resolution_shareholders`(서면결의서) + `minutes_shareholders`(의사록, 제27조: 의장과 출석 이사 기명날인) |
| 정관·규정이 "이사회 결의"를 요구하고 이사가 3인 이상 | 이사회. 제34조②: 이사·감사 전원 동의로 소집절차 생략 가능. 제35조 이사 과반 출석·출석 과반. 문서: `resolution_board` + `minutes_board`(제36조) |
| "이사회 결의"를 요구하는데 이사가 1~2인 (**현재 상태: 이사 1인**) | 이사회 부존재(상법 383조①). 상법 383조④에 따라 주주총회 결의로 갈음하고, 이해관계 있는 이사 본인의 보수·상여 건은 특별이해관계자로서 의결권 제한(상법 368조③)을 검토해 정족수 계산에 반영한다. basis에 상법 383조④ + 해당 정관 조항을 함께 인용. 감사가 있으므로 결의 결과를 감사에게 통지하는 `audit_notice`를 선택 문서로 둔다 |
| 주주총회 보통결의 정족수 | 출석 의결권 과반 + 발행주식총수 1/4 이상 (제26조). 특별결의(정관 변경)는 상법 434조: 출석 2/3 + 발행주식총수 1/3 |

### 6.3 입력 유형별 절차
| 입력 유형 | 근거 | 판단·문서 |
|---|---|---|
| 임원 기본연봉(보수) 변경 | 제33조① "임원의 보수는 주주총회의 결의로 정한다" | 주주총회 결의(6.2). 결의 내용은 보수 총액 또는 개인별 연봉과 적용일. 문서: 결의 3종 + `compensation_notice`(임원보수 결정 통지) + `exec_contract`(연봉계약서 갱신, 대표이사 계약서 존재 시) |
| 임원 정기상여 지급 | 별첨2 제4조: 기본연봉의 200% 범위 내, 연 3회 이상 분할, 지급 시마다 이사회 결의로 금액 확정. 제6조 확정일=결의일, 제7조 확정일부터 3개월 내 지급 | 검증: 당해연도 누적 정기상여 ≤ 기본연봉 200%, 회차 ≥ 3회 계획 여부. 결의 기관은 6.2(이사 수)로 판정. 문서: `bonus_payment_resolution` + 의사록. 지급기한(결의일+3개월)을 `provide` action 기한과 현금관리 링크 기대값으로 기록 |
| 임원 성과상여 지급 | 별첨2 제5조: 전년도 순이익 대비 100% 초과 달성 시 초과 달성액의 50% 범위 내, 이사회 결의 | 검증: financial_summaries에서 전년도·당해 순이익 조회 → 초과 달성액·50% 상한 계산. 미달이면 지급 불가로 회신하고 정기상여 전환을 제안. 문서는 정기상여와 동일 |
| 임원 퇴직금·특별공로금 | 별첨1 제4조 3배수 이내, 제6조 특별공로금은 이사회 의결 | 산정 근거(퇴직 전 3개월 월평균 총급여, 재임연수 제5조)를 계산해 결의 문서에 첨부 |
| 상여·퇴직·유족 규정 개정 | 별첨2 제8조, 별첨3 제4조: 주주총회 결의로만 개폐 | 주주총회 결의 + rules 새 버전(`effective_from`=결의일) + 신구 대비표 |
| 정관 변경(사업목적 추가, 본점 이전, 공고방법 등) | 상법 433·434조 특별결의 | 주주총회 특별결의 + 신 정관 전문 `regulation` v(n+1) + rules 새 버전 + `needs_registration=true`(사업목적·본점은 등기사항) → 등기부등본 재발급 `provide` action |
| 이사·감사 선임·퇴임 | 제29조, 제42조(감사 3% 의결권 제한) | 주주총회 결의 + 등기 필요. 대표이사 선임은 제38조: 이사회, 이사 2명이면 주주총회 |
| 지점·사무소 설치, 상담역·고문, 중간배당 | 제3조②, 제37조, 제51조② 이사회 | 6.2로 기관 판정. 중간배당은 제51조③ 한도 계산 첨부 |
| 이익배당 | 제49·50조, 정기주주총회 재무제표 승인(제48조) | 정기주주총회 안건으로 묶고 재무제표 승인 문서와 함께 기록 |
| 임원과 회사 간 계약(자기거래) | 상법 398조: 이사회 승인(이사회 부존재 시 주주총회) | 승인 결의 + `contract` 문서 |
| 일반 계약 체결 | 결의 불필요 | `contract` 문서 등록만. 상대방·기간·금액 메타 |
| 세무 신고·납부 | 결의 불필요 | `tax_filing` / `tax_payment_proof` 등록. 세금관리 기록과 링크 |

에이전트는 판단 근거(조항 인용 + 회사 사실 + 상한 계산)를 `agent_plan.reasoning`과 `basis`에 남긴다.
규정에서 근거를 찾지 못하거나 회사 사실(이사 수 등)이 비어 있으면 임의 판단하지 않고 `provide` action으로 사용자에게 묻는다.
정관 부칙의 시행일이 공란이라 정관 v1의 `effective_from`은 등기부등본의 회사 성립연월일로 잡는다.

## 7. 문서 템플릿과 PDF

- 템플릿: `scripts/corp-records/templates/*.md` (한국어, 머스태시 변수). 주주총회 소집절차 생략 동의서, 서면결의서, 주주총회 의사록, 임원보수 결정 통지, 임원 연봉계약서, 이사 결정서, 정관 개정안 대비표, 상여금 지급 결의서.
- 렌더: md → HTML(회사 로고, 문서번호, 의사결정 ref_no, 생성일 워터마크 "초안") → Playwright chromium PDF. macOS 시스템 한글 폰트 사용.
- 초안 PDF에는 "DRAFT" 표시. 서명본 업로드 시 draft 표시 없는 원본은 사용자가 출력한 것이므로, 확정본은 업로드된 스캔 PDF 그대로다.
- 파일명·경로에 sha256 앞 8자리를 넣어 동일 내용 중복 저장을 막는다.

## 8. CLI 스크립트와 스킬 (쓰기 경로의 전부)

`scripts/corp-records.ts` (tsx) + 순수 로직 `scripts/lib/corp-records/*.mjs`. `.env.local`의 service key로 주 프로젝트에 접근한다(`ws-dispatcher.ts`의 `loadEnv` 관례).

| 서브커맨드 | 역할 |
|---|---|
| `profile show` / `profile snapshot --as-of D --source <doc_no> --facts <json>` | 회사 사실 조회·스냅샷 |
| `rules list --at D` / `rules register --type articles --file <pdf> --text <txt> --from D [--to D] [--parent <rule_id>] [--adopted-by <ref_no>]` | 시행 규정 조회, 규정 버전 등록(조 단위 파싱, 주민번호 마스킹) |
| `decision new --category .. --title .. --date D --plan <json> --basis <json> [--amount N] [--parties <json>] [--request "원문"]` | 건 생성, ref_no 발급 |
| `decision show <ref_no>` / `decision list [--status ..]` | |
| `decision finalize <ref_no>` | 모든 sign 액션 done + final_signed 버전 존재 검증 후 확정 |
| `decision supersede <ref_no> --by <ref_no>` / `decision void <ref_no> --reason ..` | |
| `doc new --type .. --title .. [--decision <ref_no>] [--issued D --valid-to D --counterparty ..]` | 문서 생성, doc_no 발급 |
| `doc render --template <name> --vars <json> --out <pdf>` | md 템플릿 → HTML → Playwright PDF(초안 워터마크) |
| `doc add-version <doc_no> --kind draft\|final_signed\|reissue --file <pdf> [--note ..]` | sha256, 중복 거부, 텍스트 추출(텍스트 PDF는 pdf-parse, 이미지 PDF는 `--text <txt>`로 세션이 판독한 텍스트를 넘김), 업로드, 이벤트 |
| `doc url <doc_no> [--version N]` | 서명 URL 출력 |
| `action add --decision <ref_no> --kind sign\|confirm\|provide --desc .. [--doc <doc_no>] [--due D]` / `action done <id>` / `action list` | |
| `link add --decision <ref_no> --table willow_mgmt_cash --id <uuid> --relation evidence_of` | |
| `verify` | 해시체인 검증 + 확정 건의 버전 무결성(storage sha256 재계산) |
| `seed` | 12절 초기 등록을 idempotent하게 실행 |

스킬 `.claude/skills/corp-records/SKILL.md`: 6절의 판정 규칙, 서브커맨드 사용 순서, 템플릿 변수 규약, "규정에 근거가 없으면 묻는다" 원칙, 서명본 수령 시 확정 절차. `AGENTS.md`에 같은 스킬 경로를 적어 Codex 세션도 동일 절차를 따른다.

## 9. 웹 열람 페이지 (`/corp`, linear 대시보드, 윌로우 그룹 사이드바 "법인 서류함")

읽기 전용. 디자인은 `docs/design-system/*` 공식 컴포넌트만 사용한다.

- **`LStat` 4개**: 진행 중 건, 대기 액션, 확정 문서 수, 현행 정관 시행일.
- **`LSegmented`** 3모드:
  1. **의사결정** — `LFilterChip`(카테고리) + `DataTable`(ref_no, 안건, 의사결정일, 금액, 상태 `LBadge`). 행 클릭 → 상세 다이얼로그(`invoice-detail-dialog` 패턴): 결정 내용, 적용기간, 관련자, 근거 조항 인용, 문서·버전 목록(열기 링크), 대기 액션, 이벤트 타임라인.
  2. **문서** — 상시 서류 필터(등기부등본·사업자등록증·인허가·주주명부·계약서·세무). 최신 버전, 발급일·유효기간, 만료 임박 `LBadge`. 계약서는 상대방·기간·금액.
  3. **규정** — 정관·사규 시행기간 타임라인. 날짜 입력 → 그 시점 시행 버전의 조문 목록.
- 문서 열기는 서명 URL(1시간) 새 탭.

읽기 API `src/app/api/willow-corp/`: `GET decisions`, `GET decisions/[ref]`, `GET documents`, `GET documents/[doc]/url`, `GET rules?at=`, `GET actions`, `GET events?entity=`. 쓰기 라우트는 두지 않는다.

## 10. MCP 도구와 공유 로직

`src/lib/mcp/tools/willow-corp.ts` (접두사 `willow_corp_`, 관례대로 `checkToolPermission` + `logMcpAction`):
`list_decisions`, `get_decision`, `list_documents`, `get_document_url`, `list_rules_effective_at`, `get_profile`, `list_pending_actions`, `add_document_version`(파일 경로 또는 base64), `record_plan`, `finalize_decision`, `link_record`.
윌리(텔레그램)는 "서명 대기 뭐 있어?" 같은 조회에 이 도구를 직접 쓰고, 문서 생성 같은 긴 작업은 `dispatch_command`로 세션에 넘긴다. 디스패처 Codex 세션은 CLI 스크립트를 우선 쓰고 MCP는 조회에만 쓴다.

DB 접근과 규칙은 `scripts/lib/corp-records/`(mjs)에 두고 CLI가 쓴다. 웹 읽기 API와 MCP 도구는 `src/lib/willow-corp/queries.ts`·`mutations.ts`를 쓴다. 두 곳이 공유하는 상수(enum, ref_no 형식)와 해시체인 함수는 `src/lib/willow-corp/`에 두고 스크립트에서 import한다.

## 11. 기존 기록과의 연결

- 현금관리 상세 다이얼로그에 "근거 문서" 필드(`willow_corp_links` 조회)를 표시하고, 급여·상여 지급 행에서 결의 문서를 고를 수 있게 한다.
- 세금관리의 신고·납부 증빙 업로드는 `tax_filing`/`tax_payment_proof` 문서로 서류함에 저장하고 링크한다.
- 정관 개정으로 등기가 필요해지면 상시 서류의 등기부등본에 `provide`(재발급 업로드) action이 자동 생성된다.
- **계약서의 원본은 서류함이다.** 지금까지 위키 첨부로 흩어져 있던 계약서(윌로우: ETC 2021, 아크로스 자문 2023·2026 / 텐소프트웍스: 독립잇다 2건, 평택대, 성균관대, NIA)는 1단계 시드에서 `contract` 문서로 옮기고, 위키 노트는 `doc_no`로 참조한다. 앞으로 체결되는 계약은 "계약 체결" 입력 한 번으로 서류함에 등록되고(서명본 없으면 `provide` action), 위키·매출관리·현금관리는 그 `doc_no`를 링크한다. 계약기간 만료·자동연장 시점은 `contract_end` 기준으로 `confirm` action이 뜬다.

## 12. 초기 등록 (시드)

1. **정관 v1(2021-04-05 시행, 별첨 1~3 포함)** — CEO가 docx로 제공(로컬 보관: `scripts/logs/corp-records/`, gitignore). docx → PDF 변환본을 `regulation` 문서 v1로, 본문 51조와 별첨 3개 규정을 rules 4행(v1)으로 등록한다. 조 단위 파싱은 docx 텍스트에서 `제N조(제목)` 패턴으로 자른다. 정관 본문 v1의 `effective_to`는 2026-05-25(목적 변경 전일). 별첨 3개 규정은 개정 이력이 없으므로 현행.
2. **정관 v2(2026-05-26 시행, 제2조 사업목적 개정)** — CEO에게 개정 정관과 2026-05 주주총회 의사록을 요청. 받으면 첫 백필 의사결정 건 `WI-2026-001`(사업목적 변경, category `articles_rules`, status `finalized`)으로 등록하고 rules v2를 잇는다. 받기 전까지는 등기부의 목적란으로 v2 제2조를 재구성해 `provide` action을 남긴다.
3. 상시 서류: 등기부등본(2026-06-04 발급, 이미지 PDF. 발급확인번호 유효 3개월 → 2026-09-04 만료라 재발급 action 즉시 생성), 사업자등록증(2025-09-08, 2026-06-10 두 버전), 통신판매업신고증(2026-07-14), 주주명부(2026-07-17), 대표이사 계약서(docx → PDF 변환). 이미지 PDF는 pdftoppm으로 페이지 PNG를 만든 뒤 Codex(멀티모달)로 판독해 `content_text`를 채운다. 로컬 tesseract에는 kor 데이터가 없다.
4. profile 스냅샷(as_of 2026-06-04): 이사 1인·감사 1인, 자본금 1,000,000원, 200주, 성립 2021-04-05, 본점, 사업목적 v2. 임원 임기 만료(2027-04-05, 2027 정기주총)를 due 액션으로 생성.
4-1. **인감 이미지**: 양사 법인인감(대표이사 인) 이미지는 상시 서류 `other`(태그 `seal`)로 보관만 한다. 에이전트가 문서에 인감 이미지를 합성해 날인을 대신하는 일은 금지한다. 날인은 항상 사람이 실물로 하고 스캔본을 올린다. 인감 이미지의 용도는 서명본 대조(인영 확인)뿐이다.
5. 과거 의사결정 백필 후보: 2024-04 임원 중임(주총 결의·등기), 2025-08-29 본점 이전(주총 특별결의·등기), 2026-05-26 사업목적 변경, 현행 대표이사 기본연봉 8,800만원 결정(주총 결의). 문서가 있으면 `finalized`로 등록한다. 문서가 없으면 건은 `awaiting_signature`로 만들되 문서 버전을 0개로 두고 `provide` action(결의 문서 제출)을 걸어, 증빙 공백이 목록에서 그대로 보이게 한다.
3. 기존에 결의가 있었던 사항(현행 대표이사 연봉 8,800만원 등)은 문서가 있으면 등록하고, 없으면 `void`가 아닌 "기록 없음" 상태로 첫 건에서 참조만 한다.

## 13. 테스트

- `scripts/lib/corp-records/*.test.mjs`(node:test): ref_no 시퀀스, 해시체인 생성·검증, 동일 sha256 중복 거부, 확정 조건(sign 미완료 시 거부), 조문 파서(`제N조(제목)` 분리, 별첨 경계), 주민번호 마스킹, 정기상여 200% 상한·성과상여 50% 상한 계산.
- 마이그레이션 적용 후 `execute_sql`로 트리거 동작 확인(확정 버전 UPDATE 시 에러, `rules_effective_at` 개정일 당일 경계).
- 스킬: 예시 3건(연봉 2억 변경, 상여 5천만원, 사업목적 추가)을 실제 세션에서 돌려 agent_plan과 문서 세트가 6절과 일치하는지 확인.
- 웹: `/corp` 세 모드 렌더와 문서 열기를 브라우저에서 1회 확인.

## 14. 구현 단계

1. **기반**: 마이그레이션 8개 테이블 + 함수·트리거, 버킷, `scripts/lib/corp-records` + `scripts/corp-records.ts`(profile·rules·doc·verify·seed), 정관·상시 서류 시드
2. **의사결정**: 스킬 + 템플릿 + PDF 렌더 + decision·action 서브커맨드 + 서명본 확정 흐름. 첫 실전 건으로 대표이사 연봉 변경 처리
3. **열람·연결**: `/corp` 읽기 페이지 + 읽기 API, MCP 도구, 윌리 입구(디스패처 `source='corp'` + 텔레그램 파일 수신 → 서명본 경로 전달), 현금·세금 기록 링크 표시

## 15. 확인이 필요한 사항 (가정하고 진행, 다르면 알려줄 것)

1. ~~정관 파일 제공~~ 2026-09-03 정관(2021 원시정관, 별첨 3개 포함)·등기부등본(2026-06-04)·사업자등록증(2025-09-08)·통신판매업신고증(2026-07-14)·주주명부(2026-07-17) 수령. 이사 1인·감사 1인 확정. **추가 요청: 2026-05-26 사업목적 변경 당시의 개정 정관과 주주총회 의사록**, 그리고 2026-06-10자 사업자등록증(다운로드 폴더에 있음, 변경 사유 확인용).
2. 서명은 물리 서명·날인 후 스캔 업로드로 가정. 전자서명은 도입하지 않는다.
3. 텐소프트웍스는 스키마만 공유하고 UI는 이후 확장으로 둔다.
4. 주주 중 미성년자가 있어 서면결의서에 법정대리인 서명란을 둔다.
5. 등기 필요 건은 서류 준비까지만 하고 등기 신청은 법무사·CEO가 한다.
