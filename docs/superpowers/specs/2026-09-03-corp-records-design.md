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
- 웹 UI(linear 대시보드) + 텔레그램 윌리 두 입구, MCP 도구

제외(YAGNI):
- 전자서명·공인인증 연동. 서명은 출력 → 자필서명·날인 → 스캔 업로드로 처리
- 등기소·홈택스에 대한 자동 신청·제출. 등기 필요 여부 판단과 서류 준비까지만
- 텐소프트웍스 전용 UI(스키마의 `company` 컬럼으로 준비만)
- 회계 분개, 급여 계산. 기존 현금관리·세금관리가 담당하고 서류함은 근거 문서만 제공

## 3. 핵심 원칙

1. **규정 우선**: 모든 의사결정은 그 의사결정일에 시행 중이던 정관·사규 버전을 근거로 판단하고, 근거 조항을 건에 기록한다.
2. **추가 전용(append-only)**: 확정된 문서 버전과 감사 이벤트는 수정·삭제하지 않는다. 변경은 새 버전 또는 새 건(대체)으로만.
3. **절차는 회사 사실에서 도출**: 주주 수, 이사 수, 자본금 같은 회사 기본정보를 등기부·주주명부에서 추출해 저장하고, 에이전트는 이를 근거로 소집 생략·서면결의·이사회 부존재 여부를 판단한다.
4. **사용자 행동 최소화**: 시스템이 요청하는 것은 확인(confirm), 서명·날인 후 업로드(sign), 정보 제공(provide) 세 가지뿐.
5. **기존 시스템 재사용**: 실행은 로컬 Codex 디스패처, 저장은 Supabase(주 프로젝트), UI는 linear 컴포넌트, 도구는 MCP 모듈 관례를 따른다.

## 4. 아키텍처

```
[입구] 웹 /corp 입력창  ──┐
       텔레그램 윌리      ──┤→ willow_corp_decisions(status=intake) + ws_commands(source='corp')
                              ↓ (30초 주기, scripts/ws-dispatcher.ts)
[두뇌] codex exec (cwd=willow-invt, 스킬 .claude/skills/corp-records)
       1. 회사 사실(profile) + 의사결정일 기준 시행 규정(rules) 로드
       2. 절차 판단 → agent_plan 기록 (근거 조항 인용)
       3. 템플릿으로 문서 초안(md) 생성 → Playwright HTML→PDF → corp-records 버킷 업로드(v1 draft)
       4. actions(sign/confirm/provide) 생성, 텔레그램 보고
                              ↓
[사용자] 웹/텔레그램에서 확인 → 출력·서명·날인 → 스캔 PDF 업로드
                              ↓
[확정] API가 sha256·텍스트 추출 → final_signed 버전 append → decision.finalized
       → events 해시체인 기록 → 급여/현금 기록에서 참조 가능
```

에이전트 실행을 Vercel(`/api/chat`)이 아니라 로컬 Codex로 두는 이유:
- CEO 정책(AI 기능은 Codex CLI) 준수
- 한국어 법률 문서 초안 품질과 긴 컨텍스트(정관 전문 + 템플릿) 필요
- PDF 렌더링에 한글 폰트가 필요한데 Vercel 런타임에는 없고, 로컬 macOS + Playwright에는 있음
- 디스패처가 이미 30초 주기로 돌고 있어 체감 지연이 1분 내외

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
| status | `intake` → `planning` → `draft` → `awaiting_signature` → `finalized`; 종료계 `superseded` \| `void` |
| supersedes_id | 이 건이 대체하는 이전 건 |
| finalized_at, created_at, created_by | |

확정(`finalized`) 이후에는 `status`(→superseded/void), `supersedes_id` 외 컬럼 UPDATE를 트리거로 차단한다.

### 5.4 `willow_corp_documents` — 문서(논리 단위)
| 컬럼 | 설명 |
|---|---|
| id, company | |
| doc_no | `WI-DOC-2026-012` |
| decision_id | 소속 의사결정 건. 상시 서류는 null |
| doc_type | 결의계: `minutes_shareholders`(주주총회 의사록) \| `written_resolution_shareholders`(서면결의서) \| `waiver_notice`(소집절차 생략 동의서) \| `minutes_board` \| `resolution_board` \| `compensation_notice` \| `bonus_payment_resolution` \| `exec_contract` \| `regulation`(정관·사규 원본); 상시계: `registry_extract`(등기부등본) \| `business_registration`(사업자등록증) \| `shareholder_list`(주주명부) \| `contract` \| `tax_filing` \| `tax_payment_proof` \| `other` |
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
- 현재 이사 수·감사 유무는 등기부등본 OCR로 확정해 profile에 기록한다. **이사 수가 절차 분기의 핵심 변수**다.

### 6.2 결의 기관 판정 (모든 건에 공통)
| 조건 | 판정 |
|---|---|
| 정관이 "주주총회 결의"를 요구 | 주주총회. 주주 3인·자본금 10억 미만 → 상법 363조④⑤에 따라 주주 전원 동의로 소집절차 생략 + 서면결의. 문서: `waiver_notice`(소집절차 생략 동의서) + `written_resolution_shareholders`(서면결의서) + `minutes_shareholders`(의사록, 제27조: 의장과 출석 이사 기명날인) |
| 정관·규정이 "이사회 결의"를 요구하고 이사가 3인 이상 | 이사회. 제34조②: 이사·감사 전원 동의로 소집절차 생략 가능. 제35조 이사 과반 출석·출석 과반. 문서: `resolution_board` + `minutes_board`(제36조) |
| "이사회 결의"를 요구하는데 이사가 1~2인 | 이사회 부존재(상법 383조①). 상법 383조④에 따라 주주총회 결의로 갈음하고, 이해관계 있는 이사 본인의 보수·상여 건은 특별이해관계자로서 의결권 제한을 검토(정관 제35조③ 취지). basis에 상법 383조④ + 해당 정관 조항을 함께 인용 |
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

## 8. UI (`/corp`, linear 대시보드, 윌로우 그룹 사이드바에 "법인 서류함")

디자인은 `docs/design-system/*` 공식 컴포넌트만 사용한다. 새 카드·버튼 체계 금지.

- **상단 입력**: "하려는 일을 입력" 한 줄 입력 + `LBtn` 접수. 접수 즉시 decision(intake) 생성, 목록에 "판단 중" 상태로 표시.
- **`LStat` 4개**: 진행 중 건, 서명 대기 action, 확정 문서 수, 현행 정관 시행일.
- **`LSegmented`** 3모드:
  1. **의사결정** — `LFilterChip`(카테고리) + `DataTable`(ref_no, 안건, 의사결정일, 금액, 상태 `LBadge`). 행 클릭 → 상세 다이얼로그(기존 `invoice-detail-dialog` 패턴): 결정 내용, 적용기간, 관련자, 근거 조항(인용문), 문서 목록(버전 접기), 요청된 행동(서명 업로드 버튼 = `provide/sign` 완료 처리), 감사 이벤트 타임라인.
  2. **문서** — 상시 서류 우선 필터(등기부등본·사업자등록증·주주명부·계약서·세무). 각 문서는 최신 버전과 발급일·유효기간, 만료 임박 `LBadge`. 업로드 버튼으로 재발급본 추가(새 버전). 계약서는 상대방·기간·금액 표시.
  3. **규정** — 정관·사규를 시행기간 타임라인으로. "이 날짜 기준 규정 보기" 날짜 입력 → 해당 버전 조문 목록.
- 문서 열람은 서명 URL(1시간)로 새 탭.
- 페이지는 `useAgentRefresh(['willow_corp'])`로 에이전트 진행에 따라 자동 갱신.

## 9. API

`src/app/api/willow-corp/`
- `POST decisions` (접수: request_text → decision + ws_commands enqueue), `GET decisions`, `GET decisions/[id]`
- `GET documents`, `POST documents` (상시 서류 등록: 메타 + 파일), `POST documents/[id]/versions` (재발급·서명본 업로드: sha256, pdf-parse 텍스트, 이벤트 기록, sign action 완료, 모든 sign 완료 시 decision finalize)
- `GET documents/[id]/url` (서명 URL)
- `GET rules?at=YYYY-MM-DD`, `POST rules` (규정 등록·개정 버전)
- `POST actions/[id]/done`
- `GET events?entity=`

공통 로직은 `src/lib/willow-corp/` (ID 발급, 해시체인, 버전 append, 확정 규칙)에 두고 API·MCP·스크립트가 공유한다.

## 10. MCP 도구 `src/lib/mcp/tools/willow-corp.ts` (접두사 `willow_corp_`)

`list_decisions`, `get_decision`, `record_plan`, `add_document_version`, `list_rules_effective_at`, `get_profile`, `list_pending_actions`, `finalize_decision`, `link_record`. 디스패처의 Codex는 willow-dashboard MCP를 쓸 수 있으므로 스킬은 이 도구로 DB에 읽고 쓴다. 텔레그램 윌리는 `dispatch_command`로 같은 큐에 넣는다.

## 11. 기존 기록과의 연결

- 현금관리 상세 다이얼로그에 "근거 문서" 필드(`willow_corp_links` 조회)를 표시하고, 급여·상여 지급 행에서 결의 문서를 고를 수 있게 한다.
- 세금관리의 신고·납부 증빙 업로드는 `tax_filing`/`tax_payment_proof` 문서로 서류함에 저장하고 링크한다.
- 정관 개정으로 등기가 필요해지면 상시 서류의 등기부등본에 `provide`(재발급 업로드) action이 자동 생성된다.

## 12. 초기 등록 (시드)

1. **정관(2021년 제정, 별첨 1~3 포함)** — CEO가 docx로 제공(로컬 보관: `scripts/logs/corp-records/`, gitignore). docx → PDF 변환본을 `regulation` 문서 v1로, 본문 51조와 별첨 3개 규정을 rules 4행(v1)으로 등록한다. 조 단위 파싱은 docx 텍스트에서 `제N조(제목)` 패턴으로 자른다. 부칙 시행일이 공란이므로 `effective_from`은 등기부의 회사 성립연월일.
2. 등기부등본(2026-06-04 발급, 이미지 PDF → OCR. 로컬 tesseract에 kor 데이터가 없어 `brew install tesseract-lang` 또는 macOS Vision 스크립트 필요), 사업자등록증(2025-09-08, 2026-06-10 두 버전), 주주명부(2026-07-17), 대표이사 계약서(docx → PDF 변환)를 상시 서류로 등록하고 profile 스냅샷(이사·감사 명단, 자본금, 성립일, 사업목적)을 만든다.
3. 기존에 결의가 있었던 사항(현행 대표이사 연봉 8,800만원 등)은 문서가 있으면 등록하고, 없으면 `void`가 아닌 "기록 없음" 상태로 첫 건에서 참조만 한다.

## 13. 테스트

- `src/lib/willow-corp/*.test.mjs`(node:test): ID 시퀀스, 해시체인 생성·검증, 동일 sha256 중복 거부, 확정 후 수정 차단, `rules_effective_at` 경계(개정일 당일).
- 마이그레이션 적용 후 `execute_sql`로 트리거 동작 확인(확정 버전 UPDATE 시 에러).
- 에이전트 스킬: 예시 3건(연봉 변경, 상여 5천만원, 사업목적 추가)에 대해 agent_plan이 기대 문서 세트를 내는지 스크립트로 검증.
- UI: 페이지 렌더·접수·업로드 흐름을 브라우저에서 1회 확인.

## 14. 구현 단계

1. **기반**: 마이그레이션 8개 테이블 + 함수·트리거, 버킷, `src/lib/willow-corp`, API, `/corp` UI(문서·규정 모드), 상시 서류 시드
2. **에이전트**: 스킬 + 템플릿 + PDF 렌더 + 디스패처 source 분기 + 의사결정 모드 UI + 서명본 확정 흐름
3. **연결**: MCP 도구, 텔레그램 입구, 현금·세금 기록 링크 표시

## 15. 확인이 필요한 사항 (가정하고 진행, 다르면 알려줄 것)

1. ~~정관 파일 제공~~ 2026-09-03 수령 완료(별첨 임원퇴직금·상여금·유족보상금 규정 포함). 등기부등본 OCR로 현재 이사 수와 성립연월일을 확정해야 절차 분기가 닫힌다.
2. 서명은 물리 서명·날인 후 스캔 업로드로 가정. 전자서명은 도입하지 않는다.
3. 텐소프트웍스는 스키마만 공유하고 UI는 이후 확장으로 둔다.
4. 주주 중 미성년자가 있어 서면결의서에 법정대리인 서명란을 둔다.
5. 등기 필요 건은 서류 준비까지만 하고 등기 신청은 법무사·CEO가 한다.
