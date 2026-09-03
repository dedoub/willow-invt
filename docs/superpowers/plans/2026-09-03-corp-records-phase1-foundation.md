# 법인 서류함 1단계(기반) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 법인 서류함의 저장 계층(8개 테이블·함수·트리거·private 버킷), 순수 로직 라이브러리, CLI 스크립트(profile/rules/doc/action/verify/seed)를 만들고 윌로우인베스트먼트의 정관 4개 규정과 상시 서류 6종을 시드해 "규정 시행기간 조회"와 "문서 버전 append"가 실제 DB에서 동작하게 한다.

**Architecture:** 순수 로직은 `scripts/lib/corp-records/*.mjs`(node:test로 검증), DB 접근은 같은 폴더의 `db.mjs`(supabase-js service key), 진입점은 `scripts/corp-records.ts`(tsx, `node:util` parseArgs). 불변성은 Postgres 트리거가 강제하고, 감사 로그는 회사별 sha256 해시 체인으로 묶는다. 이 단계에는 의사결정 생성·문서 초안·웹 UI·MCP가 없다(2·3단계).

**Tech Stack:** Node 26, tsx, `@supabase/supabase-js` ^2.90, `pdf-parse` ^2.4 (`PDFParse` 클래스 API), `dotenv`, LibreOffice `soffice`(docx→pdf), `pdftoppm`(이미지 PDF 미리보기), Supabase MCP `apply_migration`/`execute_sql`.

**Spec:** `docs/superpowers/specs/2026-09-03-corp-records-design.md` (5절 데이터 모델, 8절 CLI, 12절 시드)

## Global Constraints

- 대상 DB는 주 프로젝트 `axcfvieqsaphhvbkyzzv`. 마이그레이션 파일은 `supabase/migrations/YYYYMMDDHHMMSS_snake.sql`, 적용은 MCP `apply_migration`(CLI 없음).
- 모든 테이블은 `company text not null default 'willow'`, RLS 활성 + `service_role all` 정책만(ws_* 관례).
- 확정 문서 버전(`final_signed`, `reissue`)과 이벤트 행은 UPDATE·DELETE 불가. 확정 의사결정은 status/supersedes_id 외 수정 불가. 규정은 삭제 불가, `effective_to`·`adopted_by_decision_id`·`document_id`만 수정 가능.
- ref_no 형식: 의사결정 `WI-2026-003`, 문서 `WI-DOC-2026-012` (회사 접두사 willow→`WI`, tensw→`TS`, 연도별 3자리 시퀀스).
- 스토리지 버킷 `corp-records`는 private. 경로 `{company}/{doc_no}/v{n}_{sha256 앞 8자리}.{ext}`. 앱과 스크립트 어디에도 삭제 경로를 만들지 않는다.
- DB 텍스트(`content_text`, `articles`)에 주민등록번호를 넣지 않는다(`\d{6}-\d{7}` → `XXXXXX-*******`). 원문은 PDF 버전에만.
- 원본 파일 보관 폴더는 `scripts/logs/corp-records/`(gitignore 대상). 커밋되는 파일에 파일 내용·개인정보를 넣지 않는다.
- 커밋 메시지는 영어, 본문 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. 커밋 전 `git branch --show-current`가 `main`인지 확인(공유 워킹트리).
- 테스트 실행: `npm run corp:test` (= `node --test scripts/lib/corp-records/`). 타입 체크: `npx tsc --noEmit`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `scripts/lib/corp-records/constants.mjs` | enum 상수, 회사 접두사, 제네시스 해시 |
| `scripts/lib/corp-records/ids.mjs` | ref_no 포맷·파싱 (DB 함수와 동일 형식) |
| `scripts/lib/corp-records/hash-chain.mjs` | 이벤트 해시 계산, 체인 검증 |
| `scripts/lib/corp-records/versions.mjs` | sha256, 스토리지 경로, 다음 버전 번호, 중복 거부 |
| `scripts/lib/corp-records/articles-parser.mjs` | 정관 텍스트 → 본문/별첨 분리, 조 단위 파싱, 주민번호 마스킹, 조문 치환 |
| `scripts/lib/corp-records/text-extract.mjs` | pdf-parse·docx 텍스트 추출, soffice 변환 (I/O, 테스트 없음) |
| `scripts/lib/corp-records/db.mjs` | supabase 클라이언트 + 리포지토리(이벤트 append, 규정·문서·버전·프로필·액션) |
| `scripts/lib/corp-records/seed.mjs` | 매니페스트 기반 idempotent 시드 |
| `scripts/corp-records.ts` | CLI 진입점 (parseArgs, 서브커맨드 라우팅) |
| `scripts/corp-records/seed-willow.json` | 윌로우 시드 매니페스트(메타데이터만) |
| `supabase/migrations/20260903130000_willow_corp_records.sql` | 테이블·시퀀스·함수·트리거·RLS |
| `scripts/lib/corp-records/*.test.mjs` | 순수 로직 테스트 |

---

### Task 1: 상수와 ref_no 포맷

**Files:**
- Create: `scripts/lib/corp-records/constants.mjs`
- Create: `scripts/lib/corp-records/ids.mjs`
- Test: `scripts/lib/corp-records/ids.test.mjs`
- Modify: `package.json` (scripts에 `corp:test` 추가)

**Interfaces:**
- Produces: `COMPANY_PREFIX`, `CATEGORIES`, `DOC_TYPES`, `RULE_TYPES`, `VERSION_KINDS`, `IMMUTABLE_VERSION_KINDS`, `DECISION_STATUSES`, `ACTION_KINDS`, `EVENT_TYPES`, `GENESIS_HASH`
- Produces: `formatRefNo({ company, kind, year, seq }) → string`, `parseRefNo(refNo) → { prefix, kind, year, seq } | null`

- [ ] **Step 1: package.json에 테스트 스크립트 추가**

`package.json`의 `"scripts"`에 두 줄 추가:

```json
    "corp": "npx tsx scripts/corp-records.ts",
    "corp:test": "node --test scripts/lib/corp-records/",
```

- [ ] **Step 2: 실패하는 테스트 작성**

`scripts/lib/corp-records/ids.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { formatRefNo, parseRefNo } from './ids.mjs'

test('formats decision ref_no with company prefix and 3-digit seq', () => {
  assert.equal(formatRefNo({ company: 'willow', kind: 'decision', year: 2026, seq: 3 }), 'WI-2026-003')
  assert.equal(formatRefNo({ company: 'tensw', kind: 'decision', year: 2026, seq: 12 }), 'TS-2026-012')
})

test('formats document doc_no with DOC segment', () => {
  assert.equal(formatRefNo({ company: 'willow', kind: 'document', year: 2026, seq: 12 }), 'WI-DOC-2026-012')
})

test('seq beyond 999 widens instead of truncating', () => {
  assert.equal(formatRefNo({ company: 'willow', kind: 'decision', year: 2026, seq: 1234 }), 'WI-2026-1234')
})

test('rejects unknown company or kind', () => {
  assert.throws(() => formatRefNo({ company: 'nope', kind: 'decision', year: 2026, seq: 1 }), /unknown company/)
  assert.throws(() => formatRefNo({ company: 'willow', kind: 'memo', year: 2026, seq: 1 }), /unknown kind/)
})

test('parses both shapes back', () => {
  assert.deepEqual(parseRefNo('WI-2026-003'), { prefix: 'WI', kind: 'decision', year: 2026, seq: 3 })
  assert.deepEqual(parseRefNo('WI-DOC-2026-012'), { prefix: 'WI', kind: 'document', year: 2026, seq: 12 })
  assert.equal(parseRefNo('garbage'), null)
})
```

- [ ] **Step 3: 실패 확인**

Run: `npm run corp:test`
Expected: FAIL, `Cannot find module './ids.mjs'`

- [ ] **Step 4: 구현**

`scripts/lib/corp-records/constants.mjs`:

```js
export const COMPANY_PREFIX = { willow: 'WI', tensw: 'TS' }

export const CATEGORIES = [
  'shareholders_meeting', 'board', 'exec_compensation', 'articles_rules',
  'registration', 'tax', 'contract', 'other',
]

export const DOC_TYPES = [
  // 결의계
  'minutes_shareholders', 'written_resolution_shareholders', 'waiver_notice',
  'minutes_board', 'resolution_board', 'compensation_notice', 'bonus_payment_resolution',
  'exec_contract', 'audit_notice', 'regulation',
  // 상시계
  'registry_extract', 'business_registration', 'license_permit', 'shareholder_list',
  'contract', 'tax_filing', 'tax_payment_proof', 'other',
]

export const RULE_TYPES = ['articles', 'retirement_regulation', 'bonus_regulation', 'survivor_regulation', 'other']

export const VERSION_KINDS = ['draft', 'final_signed', 'reissue']
export const IMMUTABLE_VERSION_KINDS = ['final_signed', 'reissue']

export const DECISION_STATUSES = ['draft', 'awaiting_signature', 'finalized', 'superseded', 'void']
export const ACTION_KINDS = ['confirm', 'sign', 'provide']

export const EVENT_TYPES = [
  'created', 'plan_recorded', 'draft_generated', 'action_done', 'version_added',
  'finalized', 'superseded', 'void', 'rule_registered', 'profile_snapshot',
]

export const GENESIS_HASH = '0'.repeat(64)
export const BUCKET = 'corp-records'
```

`scripts/lib/corp-records/ids.mjs`:

```js
import { COMPANY_PREFIX } from './constants.mjs'

const KINDS = { decision: '', document: 'DOC' }

export function formatRefNo({ company, kind, year, seq }) {
  const prefix = COMPANY_PREFIX[company]
  if (!prefix) throw new Error(`unknown company: ${company}`)
  if (!(kind in KINDS)) throw new Error(`unknown kind: ${kind}`)
  const seg = KINDS[kind] ? `${KINDS[kind]}-` : ''
  return `${prefix}-${seg}${year}-${String(seq).padStart(3, '0')}`
}

const RE = /^([A-Z]{2})-(?:(DOC)-)?(\d{4})-(\d{3,})$/

export function parseRefNo(refNo) {
  const m = RE.exec(String(refNo ?? ''))
  if (!m) return null
  return { prefix: m[1], kind: m[2] === 'DOC' ? 'document' : 'decision', year: Number(m[3]), seq: Number(m[4]) }
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm run corp:test`
Expected: 5 pass, 0 fail

- [ ] **Step 6: 커밋**

```bash
git branch --show-current   # main
git add package.json scripts/lib/corp-records/constants.mjs scripts/lib/corp-records/ids.mjs scripts/lib/corp-records/ids.test.mjs
git commit -m "feat(corp): add corp-records constants and ref_no formatting"
```

---

### Task 2: 이벤트 해시 체인

**Files:**
- Create: `scripts/lib/corp-records/hash-chain.mjs`
- Test: `scripts/lib/corp-records/hash-chain.test.mjs`

**Interfaces:**
- Consumes: `GENESIS_HASH` (Task 1)
- Produces: `canonicalize(value) → string`, `computeEventHash({ prevHash, entityType, entityId, event, payload, at }) → hex64`, `verifyChain(events) → { ok: boolean, brokenAt: number | null, count: number }`. `events`는 `id` 오름차순 정렬된 `{ id, prev_hash, hash, entity_type, entity_id, event, payload, at }` 배열.

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/lib/corp-records/hash-chain.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalize, computeEventHash, verifyChain } from './hash-chain.mjs'
import { GENESIS_HASH } from './constants.mjs'

const base = { entityType: 'decision', entityId: 'd1', event: 'created', at: '2026-09-03T03:00:00.000Z' }

test('canonicalize sorts keys recursively so hash is order-independent', () => {
  assert.equal(canonicalize({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } }), '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}')
  assert.equal(canonicalize(null), 'null')
})

test('computeEventHash is deterministic and 64 hex chars', () => {
  const h1 = computeEventHash({ ...base, prevHash: GENESIS_HASH, payload: { x: 1, y: 2 } })
  const h2 = computeEventHash({ ...base, prevHash: GENESIS_HASH, payload: { y: 2, x: 1 } })
  assert.equal(h1, h2)
  assert.match(h1, /^[0-9a-f]{64}$/)
  const h3 = computeEventHash({ ...base, prevHash: GENESIS_HASH, payload: { x: 1, y: 3 } })
  assert.notEqual(h1, h3)
})

function chain(n) {
  const out = []
  let prev = GENESIS_HASH
  for (let i = 1; i <= n; i++) {
    const row = { id: i, prev_hash: prev, entity_type: 'decision', entity_id: `d${i}`, event: 'created', payload: { i }, at: `2026-09-03T03:00:0${i}.000Z` }
    row.hash = computeEventHash({ prevHash: prev, entityType: row.entity_type, entityId: row.entity_id, event: row.event, payload: row.payload, at: row.at })
    out.push(row)
    prev = row.hash
  }
  return out
}

test('verifyChain accepts an intact chain and an empty chain', () => {
  assert.deepEqual(verifyChain(chain(3)), { ok: true, brokenAt: null, count: 3 })
  assert.deepEqual(verifyChain([]), { ok: true, brokenAt: null, count: 0 })
})

test('verifyChain reports the first tampered row', () => {
  const rows = chain(4)
  rows[2].payload = { i: 99 }
  assert.deepEqual(verifyChain(rows), { ok: false, brokenAt: 3, count: 4 })
})

test('verifyChain reports a broken link (prev_hash mismatch)', () => {
  const rows = chain(3)
  rows[1].prev_hash = 'f'.repeat(64)
  assert.deepEqual(verifyChain(rows), { ok: false, brokenAt: 2, count: 3 })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm run corp:test`
Expected: FAIL, `Cannot find module './hash-chain.mjs'`

- [ ] **Step 3: 구현**

`scripts/lib/corp-records/hash-chain.mjs`:

```js
import { createHash } from 'node:crypto'
import { GENESIS_HASH } from './constants.mjs'

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`
}

export function computeEventHash({ prevHash, entityType, entityId, event, payload, at }) {
  const material = [prevHash, entityType, entityId, event, canonicalize(payload ?? {}), at].join('|')
  return createHash('sha256').update(material, 'utf8').digest('hex')
}

export function verifyChain(events) {
  let prev = GENESIS_HASH
  for (const row of events) {
    if (row.prev_hash !== prev) return { ok: false, brokenAt: row.id, count: events.length }
    const expected = computeEventHash({
      prevHash: row.prev_hash, entityType: row.entity_type, entityId: row.entity_id,
      event: row.event, payload: row.payload, at: row.at,
    })
    if (expected !== row.hash) return { ok: false, brokenAt: row.id, count: events.length }
    prev = row.hash
  }
  return { ok: true, brokenAt: null, count: events.length }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run corp:test`
Expected: 모든 테스트 pass (ids 5 + hash-chain 5)

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/corp-records/hash-chain.mjs scripts/lib/corp-records/hash-chain.test.mjs
git commit -m "feat(corp): add tamper-evident event hash chain"
```

---

### Task 3: 문서 버전 규칙 (sha256, 경로, 중복)

**Files:**
- Create: `scripts/lib/corp-records/versions.mjs`
- Test: `scripts/lib/corp-records/versions.test.mjs`

**Interfaces:**
- Produces: `sha256Hex(buffer) → hex64`, `extensionForMime(mime) → 'pdf'|'png'|'jpg'|'docx'|'bin'`, `buildStoragePath({ company, docNo, versionNo, sha256, mime }) → string`, `nextVersionNo(existing) → number`, `assertNewVersionAllowed(existing, { sha256, kind }) → void` (throws on duplicate sha256 또는 이미 `final_signed`가 있는 문서에 `draft` 추가 시)

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/lib/corp-records/versions.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { sha256Hex, extensionForMime, buildStoragePath, nextVersionNo, assertNewVersionAllowed } from './versions.mjs'

test('sha256Hex hashes bytes', () => {
  assert.equal(sha256Hex(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('extensionForMime maps known types and falls back to bin', () => {
  assert.equal(extensionForMime('application/pdf'), 'pdf')
  assert.equal(extensionForMime('image/png'), 'png')
  assert.equal(extensionForMime('image/jpeg'), 'jpg')
  assert.equal(extensionForMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx')
  assert.equal(extensionForMime('text/weird'), 'bin')
})

test('buildStoragePath embeds doc_no, version and sha prefix', () => {
  const sha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  assert.equal(
    buildStoragePath({ company: 'willow', docNo: 'WI-DOC-2026-012', versionNo: 2, sha256: sha, mime: 'application/pdf' }),
    'willow/WI-DOC-2026-012/v2_ba7816bf.pdf',
  )
})

test('nextVersionNo continues from the highest existing version', () => {
  assert.equal(nextVersionNo([]), 1)
  assert.equal(nextVersionNo([{ version_no: 1 }, { version_no: 3 }]), 4)
})

test('assertNewVersionAllowed rejects duplicate content', () => {
  const existing = [{ version_no: 1, kind: 'draft', sha256: 'aa' }]
  assert.throws(() => assertNewVersionAllowed(existing, { sha256: 'aa', kind: 'final_signed' }), /identical content already stored as v1/)
})

test('assertNewVersionAllowed rejects a draft after a signed final exists', () => {
  const existing = [{ version_no: 1, kind: 'draft', sha256: 'aa' }, { version_no: 2, kind: 'final_signed', sha256: 'bb' }]
  assert.throws(() => assertNewVersionAllowed(existing, { sha256: 'cc', kind: 'draft' }), /final_signed version exists/)
  assert.doesNotThrow(() => assertNewVersionAllowed(existing, { sha256: 'cc', kind: 'reissue' }))
  assert.doesNotThrow(() => assertNewVersionAllowed(existing, { sha256: 'cc', kind: 'final_signed' }))
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm run corp:test`
Expected: FAIL, `Cannot find module './versions.mjs'`

- [ ] **Step 3: 구현**

`scripts/lib/corp-records/versions.mjs`:

```js
import { createHash } from 'node:crypto'

const EXT = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export function extensionForMime(mime) {
  return EXT[mime] ?? 'bin'
}

export function buildStoragePath({ company, docNo, versionNo, sha256, mime }) {
  return `${company}/${docNo}/v${versionNo}_${sha256.slice(0, 8)}.${extensionForMime(mime)}`
}

export function nextVersionNo(existing) {
  return existing.reduce((max, v) => Math.max(max, Number(v.version_no) || 0), 0) + 1
}

export function assertNewVersionAllowed(existing, { sha256, kind }) {
  const dup = existing.find(v => v.sha256 === sha256)
  if (dup) throw new Error(`identical content already stored as v${dup.version_no}`)
  if (kind === 'draft' && existing.some(v => v.kind === 'final_signed')) {
    throw new Error('final_signed version exists; add a new final_signed or reissue instead of a draft')
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run corp:test`
Expected: 모두 pass

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/corp-records/versions.mjs scripts/lib/corp-records/versions.test.mjs
git commit -m "feat(corp): add document version hashing and path rules"
```

---

### Task 4: 정관 텍스트 파서와 마스킹

**Files:**
- Create: `scripts/lib/corp-records/articles-parser.mjs`
- Test: `scripts/lib/corp-records/articles-parser.test.mjs`

**Interfaces:**
- Produces: `maskResidentNumbers(text) → string`, `splitRegulationSections(text) → { body: string, attachments: Array<{ index: number, title: string, text: string }> }`, `parseArticles(text) → Array<{ no: string, title: string, text: string }>`, `replaceArticleBody(text, articleNo, newBody) → string`

정관 원문의 실제 모양(별첨은 `제 1 조 [목적]`처럼 띄어쓰기와 대괄호를 쓴다):

```
제1조(상호) 이 회사는 “윌로우인베스트먼트 주식회사” 라 한다.
제2조(목적) 회사는 다음의 사업을 영위함을 목적으로 한다.
1. 전문, 과학 및 기술서비스업
...
별첨 1
임원퇴직금지급규정
제 1 조 [목적]
 본 규정은 ...
별첨 2
임원상여금지급규정
제 1 조 (목적)
```

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/lib/corp-records/articles-parser.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { maskResidentNumbers, splitRegulationSections, parseArticles, replaceArticleBody } from './articles-parser.mjs'

const SAMPLE = `정     관
윌로우인베스트먼트 주식회사
제 1 장     총    칙
제1조(상호) 이 회사는 “윌로우인베스트먼트 주식회사” 라 한다.
제2조(목적) 회사는 다음의 사업을 영위함을 목적으로 한다.
1. 전문, 과학 및 기술서비스업
1. 경영컨설팅업
제3조(본점의 소재지) ① 회사의 본점은 서울특별시내에 둔다.
  ② 회사는 이사회의 결의로 지점을 둘 수 있다.
부   칙
이 정관은 2021년 월 일부터 시행한다.
발기인대표 김 동 욱 (900101-1234567) - 80주
별첨 1
임원퇴직금지급규정
제 1 조 [목적]
 본 규정은 당사의 임원퇴직금 지급에 관한 사항을 정함을 목적으로 한다.
제 2 조 [적용범위]
 ① 본 규정은 대표이사, 이사, 감사에 대하여 적용한다.
별첨 2
임원상여금지급규정
제 1 조 (목적)
 본 규정은 상여금에 관한 사항을 정한다.
`

test('maskResidentNumbers hides the 7-digit tail', () => {
  assert.equal(maskResidentNumbers('김동욱 (900101-1234567) 80주'), '김동욱 (XXXXXX-*******) 80주')
  assert.equal(maskResidentNumbers('사업자 205-88-01897'), '사업자 205-88-01897')
})

test('splitRegulationSections separates body from numbered attachments', () => {
  const { body, attachments } = splitRegulationSections(SAMPLE)
  assert.match(body, /^정\s+관/)
  assert.match(body, /부\s+칙/)
  assert.doesNotMatch(body, /별첨/)
  assert.equal(attachments.length, 2)
  assert.deepEqual(attachments.map(a => [a.index, a.title]), [[1, '임원퇴직금지급규정'], [2, '임원상여금지급규정']])
  assert.match(attachments[0].text, /제 1 조 \[목적\]/)
  assert.doesNotMatch(attachments[0].text, /임원상여금/)
})

test('parseArticles handles both 제1조(제목) and 제 1 조 [제목] shapes', () => {
  const body = parseArticles(splitRegulationSections(SAMPLE).body)
  assert.deepEqual(body.map(a => [a.no, a.title]), [['제1조', '상호'], ['제2조', '목적'], ['제3조', '본점의 소재지']])
  assert.match(body[1].text, /1\. 경영컨설팅업/)
  assert.doesNotMatch(body[1].text, /제3조/)
  assert.match(body[2].text, /② 회사는 이사회의 결의로/)

  const att = parseArticles(splitRegulationSections(SAMPLE).attachments[0].text)
  assert.deepEqual(att.map(a => [a.no, a.title]), [['제1조', '목적'], ['제2조', '적용범위']])
})

test('parseArticles stops the last article before 부칙', () => {
  const body = parseArticles(splitRegulationSections(SAMPLE).body)
  assert.doesNotMatch(body[2].text, /부\s+칙/)
})

test('replaceArticleBody swaps one article and keeps the rest intact', () => {
  const { body } = splitRegulationSections(SAMPLE)
  const out = replaceArticleBody(body, '제2조', '회사는 다음의 사업을 영위함을 목적으로 한다.\n1. 정보통신업')
  assert.match(out, /제2조\(목적\) 회사는 다음의 사업을 영위함을 목적으로 한다.\n1\. 정보통신업\n제3조/)
  assert.doesNotMatch(out, /경영컨설팅업/)
  assert.match(out, /제1조\(상호\)/)
  assert.throws(() => replaceArticleBody(body, '제99조', 'x'), /article not found/)
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm run corp:test`
Expected: FAIL, `Cannot find module './articles-parser.mjs'`

- [ ] **Step 3: 구현**

`scripts/lib/corp-records/articles-parser.mjs`:

```js
const RESIDENT_RE = /\b\d{6}-\d{7}\b/g
// 제1조(제목) · 제 1 조 [제목] · 제1조 (제목)
const ARTICLE_HEAD_RE = /^제\s*(\d+)\s*조\s*[\(\[]\s*([^\)\]]+?)\s*[\)\]]\s*/
const ATTACHMENT_HEAD_RE = /^별첨\s*(\d+)\s*$/
const ADDENDUM_RE = /^부\s*칙\s*$/

export function maskResidentNumbers(text) {
  return String(text ?? '').replace(RESIDENT_RE, 'XXXXXX-*******')
}

export function splitRegulationSections(text) {
  const lines = String(text ?? '').split('\n')
  const body = []
  const attachments = []
  let current = null
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const m = ATTACHMENT_HEAD_RE.exec(line.trim())
    if (m) {
      current = { index: Number(m[1]), title: '', lines: [] }
      attachments.push(current)
      continue
    }
    if (!current) { body.push(line); continue }
    if (!current.title && line.trim()) { current.title = line.trim(); continue }
    current.lines.push(line)
  }
  return {
    body: body.join('\n'),
    attachments: attachments.map(a => ({ index: a.index, title: a.title, text: a.lines.join('\n') })),
  }
}

export function parseArticles(text) {
  const lines = String(text ?? '').split('\n')
  const out = []
  let current = null
  for (const raw of lines) {
    const line = raw.trim()
    if (ADDENDUM_RE.test(line)) { current = null; continue }
    const m = ARTICLE_HEAD_RE.exec(line)
    if (m) {
      current = { no: `제${m[1]}조`, title: m[2].trim(), lines: [line.slice(m[0].length)] }
      out.push(current)
      continue
    }
    if (current) current.lines.push(raw)
  }
  return out.map(a => ({ no: a.no, title: a.title, text: a.lines.join('\n').replace(/\s+$/, '').replace(/^\s*\n/, '') }))
}

export function replaceArticleBody(text, articleNo, newBody) {
  const lines = String(text ?? '').split('\n')
  const num = articleNo.replace(/[^0-9]/g, '')
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const m = ARTICLE_HEAD_RE.exec(line)
    if (start === -1) {
      if (m && m[1] === num) start = i
      continue
    }
    if (m || ADDENDUM_RE.test(line)) { end = i; break }
  }
  if (start === -1) throw new Error(`article not found: ${articleNo}`)
  const head = ARTICLE_HEAD_RE.exec(lines[start].trim())
  const headText = `제${head[1]}조(${head[2].trim()}) `
  return [...lines.slice(0, start), headText + newBody, ...lines.slice(end)].join('\n')
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run corp:test`
Expected: 모두 pass. `replaceArticleBody` 테스트의 정규식이 헤더 형식 `제2조(목적) ` + newBody + `\n제3조`를 요구하므로 출력 줄 구조를 그대로 유지한다.

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/corp-records/articles-parser.mjs scripts/lib/corp-records/articles-parser.test.mjs
git commit -m "feat(corp): parse articles of incorporation into numbered clauses"
```

---

### Task 5: 마이그레이션 (테이블·함수·트리거·RLS)

**Files:**
- Create: `supabase/migrations/20260903130000_willow_corp_records.sql`

**Interfaces:**
- Produces: 테이블 `willow_corp_profiles`, `willow_corp_rules`, `willow_corp_decisions`, `willow_corp_documents`, `willow_corp_document_versions`, `willow_corp_actions`, `willow_corp_links`, `willow_corp_events`, `willow_corp_sequences`; 함수 `willow_corp_next_ref_no(p_company text, p_kind text, p_year int) → text`, `willow_corp_rules_effective_at(p_company text, p_at date) → setof willow_corp_rules`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/20260903130000_willow_corp_records.sql`:

```sql
-- 법인 서류함 (Corporate Records, System of Record)
-- spec: docs/superpowers/specs/2026-09-03-corp-records-design.md §5

-- ─── 시퀀스 (ref_no / doc_no) ───
create table if not exists public.willow_corp_sequences (
  company text not null,
  kind    text not null check (kind in ('decision', 'document')),
  year    int  not null,
  last    int  not null default 0,
  primary key (company, kind, year)
);

create or replace function public.willow_corp_next_ref_no(p_company text, p_kind text, p_year int)
returns text
language plpgsql
as $$
declare
  v_seq int;
  v_prefix text;
begin
  v_prefix := case p_company when 'willow' then 'WI' when 'tensw' then 'TS' else null end;
  if v_prefix is null then raise exception 'unknown company: %', p_company; end if;
  if p_kind not in ('decision', 'document') then raise exception 'unknown kind: %', p_kind; end if;
  insert into public.willow_corp_sequences (company, kind, year, last)
  values (p_company, p_kind, p_year, 1)
  on conflict (company, kind, year) do update set last = public.willow_corp_sequences.last + 1
  returning last into v_seq;
  return case p_kind
    when 'document' then format('%s-DOC-%s-%s', v_prefix, p_year, lpad(v_seq::text, 3, '0'))
    else format('%s-%s-%s', v_prefix, p_year, lpad(v_seq::text, 3, '0'))
  end;
end;
$$;

-- ─── 문서 ───
create table if not exists public.willow_corp_documents (
  id                 uuid primary key default gen_random_uuid(),
  company            text not null default 'willow',
  doc_no             text not null unique,
  decision_id        uuid,                       -- fk 추가는 decisions 생성 후
  doc_type           text not null,
  category           text not null default 'other',
  title              text not null,
  status             text not null default 'draft' check (status in ('draft', 'final')),
  current_version_id uuid,
  issued_by          text,
  issued_at          date,
  valid_from         date,
  valid_to           date,
  counterparty       text,
  contract_start     date,
  contract_end       date,
  tags               text[] not null default '{}',
  source_key         text unique,                -- 시드 idempotency
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.willow_corp_document_versions (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.willow_corp_documents(id),
  version_no   int  not null,
  kind         text not null check (kind in ('draft', 'final_signed', 'reissue')),
  storage_path text not null unique,
  mime         text not null,
  size_bytes   bigint not null,
  sha256       text not null,
  content_text text,
  generated_by text not null default 'upload' check (generated_by in ('agent', 'upload')),
  note         text,
  created_by   text,
  created_at   timestamptz not null default now(),
  unique (document_id, version_no),
  unique (document_id, sha256)
);

alter table public.willow_corp_documents
  add constraint willow_corp_documents_current_version_fk
  foreign key (current_version_id) references public.willow_corp_document_versions(id);

-- ─── 규정 ───
create table if not exists public.willow_corp_rules (
  id                     uuid primary key default gen_random_uuid(),
  company                text not null default 'willow',
  rule_type              text not null check (rule_type in ('articles', 'retirement_regulation', 'bonus_regulation', 'survivor_regulation', 'other')),
  title                  text not null,
  version_no             int  not null,
  effective_from         date not null,
  effective_to           date,
  parent_rule_id         uuid references public.willow_corp_rules(id),
  adopted_by_decision_id uuid,
  document_id            uuid references public.willow_corp_documents(id),
  content_text           text not null,
  articles               jsonb not null default '[]',
  note                   text,
  source_key             text unique,
  created_at             timestamptz not null default now(),
  unique (company, rule_type, version_no),
  check (effective_to is null or effective_to >= effective_from)
);

create or replace function public.willow_corp_rules_effective_at(p_company text, p_at date)
returns setof public.willow_corp_rules
language sql
stable
as $$
  select * from public.willow_corp_rules
  where company = p_company
    and effective_from <= p_at
    and (effective_to is null or effective_to >= p_at)
  order by rule_type, version_no desc;
$$;

-- ─── 의사결정 ───
create table if not exists public.willow_corp_decisions (
  id             uuid primary key default gen_random_uuid(),
  company        text not null default 'willow',
  ref_no         text not null unique,
  category       text not null,
  title          text not null,
  request_text   text,
  summary        text,
  decision_date  date,
  effective_from date,
  effective_to   date,
  amount         numeric,
  currency       text not null default 'KRW',
  parties        jsonb not null default '[]',
  basis          jsonb not null default '[]',
  agent_plan     jsonb not null default '{}',
  status         text not null default 'draft' check (status in ('draft', 'awaiting_signature', 'finalized', 'superseded', 'void')),
  supersedes_id  uuid references public.willow_corp_decisions(id),
  finalized_at   timestamptz,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.willow_corp_documents
  add constraint willow_corp_documents_decision_fk
  foreign key (decision_id) references public.willow_corp_decisions(id);
alter table public.willow_corp_rules
  add constraint willow_corp_rules_adopted_by_fk
  foreign key (adopted_by_decision_id) references public.willow_corp_decisions(id);

-- ─── 회사 사실 스냅샷 ───
create table if not exists public.willow_corp_profiles (
  id                 uuid primary key default gen_random_uuid(),
  company            text not null default 'willow',
  as_of              date not null,
  source_document_id uuid references public.willow_corp_documents(id),
  facts              jsonb not null,
  source_key         text unique,
  created_at         timestamptz not null default now()
);

-- ─── 액션 (decision_id null = 상시 서류·프로필 기반 액션) ───
create table if not exists public.willow_corp_actions (
  id          uuid primary key default gen_random_uuid(),
  company     text not null default 'willow',
  decision_id uuid references public.willow_corp_decisions(id),
  document_id uuid references public.willow_corp_documents(id),
  kind        text not null check (kind in ('confirm', 'sign', 'provide')),
  description text not null,
  status      text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  due_at      date,
  done_at     timestamptz,
  result      jsonb,
  source_key  text unique,
  created_at  timestamptz not null default now()
);

-- ─── 링크 ───
create table if not exists public.willow_corp_links (
  id           uuid primary key default gen_random_uuid(),
  company      text not null default 'willow',
  decision_id  uuid references public.willow_corp_decisions(id),
  document_id  uuid references public.willow_corp_documents(id),
  target_table text not null,
  target_id    text not null,
  relation     text not null check (relation in ('basis_for', 'evidence_of')),
  created_at   timestamptz not null default now(),
  check (decision_id is not null or document_id is not null)
);

-- ─── 감사 이벤트 (해시 체인) ───
create table if not exists public.willow_corp_events (
  id          bigserial primary key,
  company     text not null default 'willow',
  entity_type text not null,
  entity_id   text not null,
  event       text not null,
  actor       text not null,
  payload     jsonb not null default '{}',
  prev_hash   text not null,
  hash        text not null unique,
  at          timestamptz not null default now()
);
create index if not exists willow_corp_events_company_idx on public.willow_corp_events (company, id);
create index if not exists willow_corp_events_entity_idx  on public.willow_corp_events (entity_type, entity_id);
create index if not exists willow_corp_documents_type_idx on public.willow_corp_documents (company, doc_type);
create index if not exists willow_corp_rules_effective_idx on public.willow_corp_rules (company, rule_type, effective_from);
create index if not exists willow_corp_actions_pending_idx on public.willow_corp_actions (company, status, due_at);

-- ─── 불변성 트리거 ───
create or replace function public.willow_corp_guard_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'willow_corp_document_versions: delete is not allowed (id=%)', old.id;
  end if;
  if old.kind in ('final_signed', 'reissue') then
    raise exception 'willow_corp_document_versions: version % of document % is immutable', old.version_no, old.document_id;
  end if;
  return new;
end;
$$;
drop trigger if exists willow_corp_document_versions_guard on public.willow_corp_document_versions;
create trigger willow_corp_document_versions_guard
  before update or delete on public.willow_corp_document_versions
  for each row execute function public.willow_corp_guard_version();

create or replace function public.willow_corp_guard_event()
returns trigger
language plpgsql
as $$
begin
  raise exception 'willow_corp_events: rows are append-only (id=%)', old.id;
end;
$$;
drop trigger if exists willow_corp_events_guard on public.willow_corp_events;
create trigger willow_corp_events_guard
  before update or delete on public.willow_corp_events
  for each row execute function public.willow_corp_guard_event();

create or replace function public.willow_corp_guard_decision()
returns trigger
language plpgsql
as $$
declare
  old_j jsonb;
  new_j jsonb;
begin
  if old.status = 'finalized' then
    if new.status not in ('finalized', 'superseded', 'void') then
      raise exception 'willow_corp_decisions %: finalized decision can only move to superseded/void', old.ref_no;
    end if;
    old_j := to_jsonb(old) - 'status' - 'supersedes_id' - 'updated_at';
    new_j := to_jsonb(new) - 'status' - 'supersedes_id' - 'updated_at';
    if old_j <> new_j then
      raise exception 'willow_corp_decisions %: finalized decision is immutable', old.ref_no;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists willow_corp_decisions_guard on public.willow_corp_decisions;
create trigger willow_corp_decisions_guard
  before update on public.willow_corp_decisions
  for each row execute function public.willow_corp_guard_decision();

create or replace function public.willow_corp_guard_rule()
returns trigger
language plpgsql
as $$
declare
  old_j jsonb;
  new_j jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception 'willow_corp_rules: delete is not allowed (%)', old.id;
  end if;
  old_j := to_jsonb(old) - 'effective_to' - 'adopted_by_decision_id' - 'document_id';
  new_j := to_jsonb(new) - 'effective_to' - 'adopted_by_decision_id' - 'document_id';
  if old_j <> new_j then
    raise exception 'willow_corp_rules %: only effective_to/adopted_by_decision_id/document_id may change', old.id;
  end if;
  return new;
end;
$$;
drop trigger if exists willow_corp_rules_guard on public.willow_corp_rules;
create trigger willow_corp_rules_guard
  before update or delete on public.willow_corp_rules
  for each row execute function public.willow_corp_guard_rule();

create or replace function public.willow_corp_touch_document()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists willow_corp_documents_touch on public.willow_corp_documents;
create trigger willow_corp_documents_touch
  before update on public.willow_corp_documents
  for each row execute function public.willow_corp_touch_document();

-- ─── RLS: service_role 전용 ───
alter table public.willow_corp_sequences         enable row level security;
alter table public.willow_corp_documents         enable row level security;
alter table public.willow_corp_document_versions enable row level security;
alter table public.willow_corp_rules             enable row level security;
alter table public.willow_corp_decisions         enable row level security;
alter table public.willow_corp_profiles          enable row level security;
alter table public.willow_corp_actions           enable row level security;
alter table public.willow_corp_links             enable row level security;
alter table public.willow_corp_events            enable row level security;

do $$
declare t text;
begin
  foreach t in array array['willow_corp_sequences','willow_corp_documents','willow_corp_document_versions','willow_corp_rules','willow_corp_decisions','willow_corp_profiles','willow_corp_actions','willow_corp_links','willow_corp_events'] loop
    execute format('drop policy if exists "service_role all" on public.%I', t);
    execute format('create policy "service_role all" on public.%I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;
```

- [ ] **Step 2: MCP로 적용**

MCP `supabase` → `apply_migration`:
- `project_id`: `axcfvieqsaphhvbkyzzv`
- `name`: `willow_corp_records`
- `query`: 위 파일 전체 내용

Expected: 성공 응답. 실패하면 오류 메시지의 줄을 파일에서 고치고 파일과 동일한 내용으로 재적용한다(파일이 진실원).

- [ ] **Step 3: 함수와 트리거 동작 검증**

MCP `execute_sql`(project `axcfvieqsaphhvbkyzzv`)로 순서대로 실행:

```sql
-- ref_no 시퀀스
select public.willow_corp_next_ref_no('willow','decision',2026) as d1,
       public.willow_corp_next_ref_no('willow','decision',2026) as d2,
       public.willow_corp_next_ref_no('willow','document',2026) as doc1;
-- 기대: WI-2026-001, WI-2026-002, WI-DOC-2026-001
```

```sql
-- 규정 시행기간 경계
insert into public.willow_corp_rules (rule_type, title, version_no, effective_from, effective_to, content_text, source_key)
values ('other','경계테스트',1,'2021-04-05','2026-05-25','v1','__test_rule_v1'),
       ('other','경계테스트',2,'2026-05-26',null,'v2','__test_rule_v2');
select version_no from public.willow_corp_rules_effective_at('willow','2026-05-25') where source_key like '__test_rule%';  -- 1
select version_no from public.willow_corp_rules_effective_at('willow','2026-05-26') where source_key like '__test_rule%';  -- 2
select version_no from public.willow_corp_rules_effective_at('willow','2021-04-04') where source_key like '__test_rule%';  -- 0 rows
```

```sql
-- 규정 삭제 차단 (기대: 오류 "delete is not allowed")
delete from public.willow_corp_rules where source_key = '__test_rule_v2';
```

```sql
-- 규정 content 수정 차단 (기대: 오류 "only effective_to/...")
update public.willow_corp_rules set content_text = 'x' where source_key = '__test_rule_v1';
-- effective_to 수정은 허용 (기대: UPDATE 1)
update public.willow_corp_rules set effective_to = '2026-05-24' where source_key = '__test_rule_v1';
```

```sql
-- 이벤트 append-only (기대: 오류)
insert into public.willow_corp_events (entity_type, entity_id, event, actor, prev_hash, hash)
values ('test','t1','created','test', repeat('0',64), repeat('a',64));
update public.willow_corp_events set actor = 'x' where hash = repeat('a',64);
```

```sql
-- 확정 의사결정 불변 (기대: 두 번째 update 오류, 세 번째 성공)
insert into public.willow_corp_decisions (ref_no, category, title, status) values ('WI-9999-001','other','불변테스트','finalized');
update public.willow_corp_decisions set title = '변경' where ref_no = 'WI-9999-001';
update public.willow_corp_decisions set status = 'void' where ref_no = 'WI-9999-001';
```

테스트 행 정리(이벤트·규정은 삭제 불가이므로 테스트 키를 남긴다. 규정 테스트 행 2개와 이벤트 1행은 `source_key like '__test%'`/`entity_type='test'`로 식별되며 verify·목록에서 제외한다):

```sql
delete from public.willow_corp_decisions where ref_no = 'WI-9999-001';
delete from public.willow_corp_sequences where year = 2026;   -- 시드 전이므로 시퀀스 리셋
```

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260903130000_willow_corp_records.sql
git commit -m "feat(corp): add willow_corp_* schema with immutability guards"
```

---

### Task 6: 텍스트 추출·변환 헬퍼

**Files:**
- Create: `scripts/lib/corp-records/text-extract.mjs`

**Interfaces:**
- Produces: `extractPdfText(buffer) → Promise<string>` (텍스트 레이어 없으면 `''`), `extractDocxText(path) → string`, `convertDocxToPdf(path, outDir) → string`(생성된 pdf 경로), `guessMime(path) → string`

I/O 전용이라 단위 테스트는 두지 않고 Task 8 시드에서 실제 파일로 검증한다.

- [ ] **Step 1: 구현**

`scripts/lib/corp-records/text-extract.mjs`:

```js
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const MIME = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function guessMime(path) {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

export async function extractPdfText(buffer) {
  const { PDFParse } = require('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    const text = String(result?.text ?? '').replace(/-- \d+ of \d+ --/g, '').replace(/[ \t]+/g, ' ').trim()
    return text
  } finally {
    await parser.destroy?.()
  }
}

export function extractDocxText(path) {
  const unzip = spawnSync('unzip', ['-p', path, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (unzip.status !== 0) throw new Error(`unzip failed for ${path}: ${unzip.stderr}`)
  return unzip.stdout
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .split('\n').filter(line => line.trim()).join('\n')
}

export function convertDocxToPdf(path, outDir) {
  const out = join(outDir, basename(path).replace(/\.docx$/i, '.pdf'))
  if (existsSync(out)) return out
  const r = spawnSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', outDir, path], { encoding: 'utf8' })
  if (r.status !== 0 || !existsSync(out)) throw new Error(`soffice convert failed for ${path}: ${r.stderr || r.stdout}`)
  return out
}
```

- [ ] **Step 2: 수동 확인**

Run:
```bash
node -e '
import("./scripts/lib/corp-records/text-extract.mjs").then(async m => {
  const fs = await import("node:fs")
  const t = await m.extractPdfText(fs.readFileSync("scripts/logs/corp-records/윌로우인베스트먼트_사업자등록증_20250908.pdf"))
  console.log(t.slice(0, 120))
  console.log(m.extractDocxText("scripts/logs/corp-records/윌로우인베스트먼트_정관_2021.docx").split("\n").slice(0, 4).join(" | "))
})'
```
Expected: 첫 줄에 `2025 년 09 월 08 일 삼 성 세 무 서 장 사 업 자 등 록 증`, 둘째 줄에 `정 관 | 윌로우인베스트먼트 주식회사 | 정 관 | 제 1 장 총 칙`

- [ ] **Step 3: 커밋**

```bash
git add scripts/lib/corp-records/text-extract.mjs
git commit -m "feat(corp): add pdf/docx text extraction and docx conversion helpers"
```

---

### Task 7: DB 리포지토리

**Files:**
- Create: `scripts/lib/corp-records/db.mjs`

**Interfaces:**
- Consumes: Task 1~4 순수 함수, Task 5 스키마
- Produces: `createCorpDb({ url, key, actor }) → CorpDb` with:
  - `ensureBucket()`
  - `nextRefNo(company, kind, year) → Promise<string>`
  - `appendEvent({ company, entityType, entityId, event, payload }) → Promise<row>` (체인 계산 포함)
  - `getDocumentByKey(sourceKey)`, `getDocument(docNo)`, `listDocuments({ company, docType })`
  - `createDocument({ company, docType, category, title, decisionId, issuedBy, issuedAt, validFrom, validTo, counterparty, contractStart, contractEnd, tags, sourceKey }) → row`
  - `listVersions(documentId)`
  - `addVersion({ docNo, kind, buffer, mime, contentText, note, generatedBy }) → { version, document }` (sha256·중복 검사·업로드·insert·current_version·status·이벤트)
  - `signedUrl(docNo, versionNo?, expiresSec=3600) → string`
  - `registerRule({ company, ruleType, title, versionNo, effectiveFrom, effectiveTo, parentRuleId, documentId, contentText, note, sourceKey }) → row` (마스킹·articles 파싱·이전 버전 `effective_to` 닫기·이벤트)
  - `getRuleByKey(sourceKey)`, `rulesEffectiveAt(company, date)`, `listRules(company)`
  - `snapshotProfile({ company, asOf, sourceDocumentId, facts, sourceKey })`, `latestProfile(company)`
  - `addAction({ company, decisionId, documentId, kind, description, dueAt, sourceKey })`, `listActions({ company, status })`, `doneAction(id, result)`
  - `verifyChain(company) → { ok, brokenAt, count }`
  - `verifyStoredVersions(company) → Array<{ docNo, versionNo, ok }>` (다운로드 후 sha256 재계산)

- [ ] **Step 1: 구현**

`scripts/lib/corp-records/db.mjs`:

```js
import { createClient } from '@supabase/supabase-js'
import { BUCKET, GENESIS_HASH, DOC_TYPES, CATEGORIES, RULE_TYPES, VERSION_KINDS, ACTION_KINDS } from './constants.mjs'
import { computeEventHash, verifyChain } from './hash-chain.mjs'
import { sha256Hex, buildStoragePath, nextVersionNo, assertNewVersionAllowed } from './versions.mjs'
import { maskResidentNumbers, parseArticles } from './articles-parser.mjs'

function assertIn(list, value, label) {
  if (!list.includes(value)) throw new Error(`${label} must be one of ${list.join(', ')} (got ${value})`)
}

function unwrap({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

export function createCorpDb({ url, key, actor = 'cli' }) {
  if (!url || !key) throw new Error('supabase url/key required (.env.local NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY)')
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  async function ensureBucket() {
    const { data } = await sb.storage.getBucket(BUCKET)
    if (data) return data
    unwrap(await sb.storage.createBucket(BUCKET, { public: false }), 'createBucket')
    return (await sb.storage.getBucket(BUCKET)).data
  }

  async function nextRefNo(company, kind, year) {
    return unwrap(await sb.rpc('willow_corp_next_ref_no', { p_company: company, p_kind: kind, p_year: year }), 'next_ref_no')
  }

  async function appendEvent({ company = 'willow', entityType, entityId, event, payload = {} }) {
    const last = unwrap(await sb.from('willow_corp_events').select('hash').eq('company', company).order('id', { ascending: false }).limit(1), 'last event')
    const prevHash = last[0]?.hash ?? GENESIS_HASH
    const at = new Date().toISOString()
    const hash = computeEventHash({ prevHash, entityType, entityId, event, payload, at })
    const rows = unwrap(await sb.from('willow_corp_events').insert({
      company, entity_type: entityType, entity_id: entityId, event, actor, payload, prev_hash: prevHash, hash, at,
    }).select(), 'insert event')
    return rows[0]
  }

  async function getDocumentByKey(sourceKey) {
    const rows = unwrap(await sb.from('willow_corp_documents').select('*').eq('source_key', sourceKey).limit(1), 'document by key')
    return rows[0] ?? null
  }

  async function getDocument(docNo) {
    const rows = unwrap(await sb.from('willow_corp_documents').select('*').eq('doc_no', docNo).limit(1), 'document')
    if (!rows[0]) throw new Error(`document not found: ${docNo}`)
    return rows[0]
  }

  async function listDocuments({ company = 'willow', docType } = {}) {
    let q = sb.from('willow_corp_documents').select('*, current:willow_corp_document_versions!willow_corp_documents_current_version_fk(version_no, kind, sha256, created_at)').eq('company', company).order('created_at')
    if (docType) q = q.eq('doc_type', docType)
    return unwrap(await q, 'list documents')
  }

  async function createDocument(input) {
    const { company = 'willow', docType, category = 'other', title, decisionId = null, issuedBy = null, issuedAt = null, validFrom = null, validTo = null, counterparty = null, contractStart = null, contractEnd = null, tags = [], sourceKey = null } = input
    assertIn(DOC_TYPES, docType, 'doc_type')
    assertIn(CATEGORIES, category, 'category')
    if (!title) throw new Error('title required')
    const year = new Date(issuedAt ?? Date.now()).getUTCFullYear()
    const docNo = await nextRefNo(company, 'document', year)
    const rows = unwrap(await sb.from('willow_corp_documents').insert({
      company, doc_no: docNo, doc_type: docType, category, title, decision_id: decisionId, issued_by: issuedBy, issued_at: issuedAt,
      valid_from: validFrom, valid_to: validTo, counterparty, contract_start: contractStart, contract_end: contractEnd, tags, source_key: sourceKey,
    }).select(), 'insert document')
    const doc = rows[0]
    await appendEvent({ company, entityType: 'document', entityId: doc.doc_no, event: 'created', payload: { doc_type: docType, title, source_key: sourceKey } })
    return doc
  }

  async function listVersions(documentId) {
    return unwrap(await sb.from('willow_corp_document_versions').select('*').eq('document_id', documentId).order('version_no'), 'list versions')
  }

  async function addVersion({ docNo, kind, buffer, mime, contentText = null, note = null, generatedBy = 'upload' }) {
    assertIn(VERSION_KINDS, kind, 'kind')
    const doc = await getDocument(docNo)
    const existing = await listVersions(doc.id)
    const sha256 = sha256Hex(buffer)
    assertNewVersionAllowed(existing, { sha256, kind })
    const versionNo = nextVersionNo(existing)
    const storagePath = buildStoragePath({ company: doc.company, docNo, versionNo, sha256, mime })
    await ensureBucket()
    unwrap(await sb.storage.from(BUCKET).upload(storagePath, buffer, { contentType: mime, upsert: false }), 'upload')
    const rows = unwrap(await sb.from('willow_corp_document_versions').insert({
      document_id: doc.id, version_no: versionNo, kind, storage_path: storagePath, mime, size_bytes: buffer.length,
      sha256, content_text: contentText ? maskResidentNumbers(contentText) : null, generated_by: generatedBy, note, created_by: actor,
    }).select(), 'insert version')
    const version = rows[0]
    const status = kind === 'draft' ? doc.status : 'final'
    const updated = unwrap(await sb.from('willow_corp_documents').update({ current_version_id: version.id, status }).eq('id', doc.id).select(), 'update current version')
    await appendEvent({ company: doc.company, entityType: 'document', entityId: docNo, event: 'version_added', payload: { version_no: versionNo, kind, sha256, storage_path: storagePath } })
    return { version, document: updated[0] }
  }

  async function signedUrl(docNo, versionNo, expiresSec = 3600) {
    const doc = await getDocument(docNo)
    const versions = await listVersions(doc.id)
    const v = versionNo ? versions.find(x => x.version_no === Number(versionNo)) : versions.at(-1)
    if (!v) throw new Error(`no version for ${docNo}`)
    const data = unwrap(await sb.storage.from(BUCKET).createSignedUrl(v.storage_path, expiresSec), 'signed url')
    return data.signedUrl
  }

  async function getRuleByKey(sourceKey) {
    const rows = unwrap(await sb.from('willow_corp_rules').select('*').eq('source_key', sourceKey).limit(1), 'rule by key')
    return rows[0] ?? null
  }

  async function listRules(company = 'willow') {
    return unwrap(await sb.from('willow_corp_rules').select('id, rule_type, title, version_no, effective_from, effective_to, parent_rule_id, document_id, source_key, note').eq('company', company).order('rule_type').order('version_no'), 'list rules')
  }

  async function rulesEffectiveAt(company, date) {
    return unwrap(await sb.rpc('willow_corp_rules_effective_at', { p_company: company, p_at: date }), 'rules effective at')
  }

  async function registerRule(input) {
    const { company = 'willow', ruleType, title, versionNo, effectiveFrom, effectiveTo = null, parentRuleId = null, documentId = null, contentText, note = null, sourceKey = null } = input
    assertIn(RULE_TYPES, ruleType, 'rule_type')
    if (!contentText) throw new Error('contentText required')
    const masked = maskResidentNumbers(contentText)
    const articles = parseArticles(masked)
    const prev = unwrap(await sb.from('willow_corp_rules').select('id, version_no, effective_to').eq('company', company).eq('rule_type', ruleType).is('effective_to', null).order('version_no', { ascending: false }).limit(1), 'previous rule')
    const rows = unwrap(await sb.from('willow_corp_rules').insert({
      company, rule_type: ruleType, title, version_no: versionNo, effective_from: effectiveFrom, effective_to: effectiveTo,
      parent_rule_id: parentRuleId, document_id: documentId, content_text: masked, articles, note, source_key: sourceKey,
    }).select(), 'insert rule')
    const rule = rows[0]
    if (prev[0] && prev[0].version_no < versionNo) {
      const closeAt = new Date(effectiveFrom); closeAt.setUTCDate(closeAt.getUTCDate() - 1)
      unwrap(await sb.from('willow_corp_rules').update({ effective_to: closeAt.toISOString().slice(0, 10) }).eq('id', prev[0].id), 'close previous rule')
    }
    await appendEvent({ company, entityType: 'rule', entityId: rule.id, event: 'rule_registered', payload: { rule_type: ruleType, version_no: versionNo, effective_from: effectiveFrom, effective_to: effectiveTo, articles: articles.length } })
    return rule
  }

  async function snapshotProfile({ company = 'willow', asOf, sourceDocumentId = null, facts, sourceKey = null }) {
    if (!facts || typeof facts !== 'object') throw new Error('facts object required')
    const rows = unwrap(await sb.from('willow_corp_profiles').insert({ company, as_of: asOf, source_document_id: sourceDocumentId, facts, source_key: sourceKey }).select(), 'insert profile')
    await appendEvent({ company, entityType: 'profile', entityId: rows[0].id, event: 'profile_snapshot', payload: { as_of: asOf, directors: facts.directors?.length ?? 0, shareholders: facts.shareholders?.length ?? 0 } })
    return rows[0]
  }

  async function latestProfile(company = 'willow') {
    const rows = unwrap(await sb.from('willow_corp_profiles').select('*').eq('company', company).order('as_of', { ascending: false }).limit(1), 'latest profile')
    return rows[0] ?? null
  }

  async function getByKey(table, sourceKey) {
    const rows = unwrap(await sb.from(table).select('id').eq('source_key', sourceKey).limit(1), `${table} by key`)
    return rows[0] ?? null
  }

  async function addAction({ company = 'willow', decisionId = null, documentId = null, kind, description, dueAt = null, sourceKey = null }) {
    assertIn(ACTION_KINDS, kind, 'kind')
    const rows = unwrap(await sb.from('willow_corp_actions').insert({ company, decision_id: decisionId, document_id: documentId, kind, description, due_at: dueAt, source_key: sourceKey }).select(), 'insert action')
    await appendEvent({ company, entityType: 'action', entityId: rows[0].id, event: 'created', payload: { kind, description, due_at: dueAt } })
    return rows[0]
  }

  async function listActions({ company = 'willow', status = 'pending' } = {}) {
    let q = sb.from('willow_corp_actions').select('*').eq('company', company).order('due_at', { ascending: true, nullsFirst: false })
    if (status) q = q.eq('status', status)
    return unwrap(await q, 'list actions')
  }

  async function doneAction(id, result = null) {
    const rows = unwrap(await sb.from('willow_corp_actions').update({ status: 'done', done_at: new Date().toISOString(), result }).eq('id', id).select(), 'done action')
    if (!rows[0]) throw new Error(`action not found: ${id}`)
    await appendEvent({ company: rows[0].company, entityType: 'action', entityId: id, event: 'action_done', payload: { result } })
    return rows[0]
  }

  async function verifyChainFor(company = 'willow') {
    const rows = unwrap(await sb.from('willow_corp_events').select('id, prev_hash, hash, entity_type, entity_id, event, payload, at').eq('company', company).order('id'), 'events')
    return verifyChain(rows)
  }

  async function verifyStoredVersions(company = 'willow') {
    const docs = await listDocuments({ company })
    const out = []
    for (const doc of docs) {
      for (const v of await listVersions(doc.id)) {
        const file = unwrap(await sb.storage.from(BUCKET).download(v.storage_path), `download ${v.storage_path}`)
        const buf = Buffer.from(await file.arrayBuffer())
        out.push({ docNo: doc.doc_no, versionNo: v.version_no, ok: sha256Hex(buf) === v.sha256 })
      }
    }
    return out
  }

  return {
    client: sb, ensureBucket, nextRefNo, appendEvent,
    getDocumentByKey, getDocument, listDocuments, createDocument, listVersions, addVersion, signedUrl,
    getRuleByKey, listRules, rulesEffectiveAt, registerRule,
    snapshotProfile, latestProfile, getByKey,
    addAction, listActions, doneAction,
    verifyChain: verifyChainFor, verifyStoredVersions,
  }
}
```

- [ ] **Step 2: 스모크 확인 (버킷 생성 + 체인 검증)**

Run:
```bash
node -e '
import("dotenv").then(d => d.config({ path: ".env.local", quiet: true }))
  .then(() => import("./scripts/lib/corp-records/db.mjs"))
  .then(async m => {
    const db = m.createCorpDb({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY })
    console.log("bucket", (await db.ensureBucket())?.name)
    console.log("chain", await db.verifyChain("willow"))
  })'
```
Expected: `bucket corp-records`, `chain { ok: true, brokenAt: null, count: 0 }` (Task 5 검증에서 넣은 테스트 이벤트는 `hash = 'aaaa…'`로 체인이 깨져 있으므로 `ok:false, brokenAt:1`이 나온다. 그 경우 이 행을 제외하도록 `verifyChainFor`의 select에 `.neq('entity_type','test')`를 추가한다.)

- [ ] **Step 3: 커밋**

```bash
git add scripts/lib/corp-records/db.mjs
git commit -m "feat(corp): add corp-records repository with chained events and versioned uploads"
```

---

### Task 8: CLI 진입점

**Files:**
- Create: `scripts/corp-records.ts`

**Interfaces:**
- Consumes: `createCorpDb` (Task 7), `text-extract.mjs` (Task 6)
- Produces: `npm run corp -- <command> <sub> [flags]`

명령 표:

| 명령 | 플래그 |
|---|---|
| `profile show` | `--company` |
| `profile snapshot` | `--as-of D --facts <json 파일> [--source <doc_no>] [--key]` |
| `rules list` | `[--at D]` |
| `rules register` | `--type --title --version N --from D [--to D] --text <txt 파일> [--doc <doc_no>] [--parent <rule_id>] [--note] [--key]` |
| `doc list` | `[--type]` |
| `doc new` | `--type --title [--category] [--issued D] [--issued-by] [--valid-from D] [--valid-to D] [--counterparty] [--contract-start D] [--contract-end D] [--tags a,b] [--key]` |
| `doc add-version <doc_no>` | `--kind --file <path> [--text <txt 파일>] [--note] [--convert]` (`--convert`: docx면 soffice로 PDF 변환 후 업로드) |
| `doc url <doc_no>` | `[--version N]` |
| `action list` | `[--status pending\|done\|all]` |
| `action add` | `--kind --desc [--doc <doc_no>] [--due D] [--key]` |
| `action done <id>` | `[--result <json>]` |
| `verify` | 체인 + 저장 파일 sha256 |
| `seed` | `--manifest <json>` (Task 9) |

- [ ] **Step 1: 구현**

`scripts/corp-records.ts`:

```ts
#!/usr/bin/env -S npx tsx
// 법인 서류함 CLI — 모든 쓰기는 이 스크립트를 통해서만 한다.
// spec: docs/superpowers/specs/2026-09-03-corp-records-design.md §8
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'
import { createCorpDb } from './lib/corp-records/db.mjs'
import { extractPdfText, extractDocxText, convertDocxToPdf, guessMime } from './lib/corp-records/text-extract.mjs'
import { runSeed } from './lib/corp-records/seed.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
dotenv.config({ path: join(ROOT, '.env.local'), quiet: true })

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    company: { type: 'string', default: 'willow' },
    'as-of': { type: 'string' }, facts: { type: 'string' }, source: { type: 'string' }, key: { type: 'string' },
    at: { type: 'string' }, type: { type: 'string' }, title: { type: 'string' }, version: { type: 'string' },
    from: { type: 'string' }, to: { type: 'string' }, text: { type: 'string' }, doc: { type: 'string' },
    parent: { type: 'string' }, note: { type: 'string' }, category: { type: 'string' },
    issued: { type: 'string' }, 'issued-by': { type: 'string' }, 'valid-from': { type: 'string' }, 'valid-to': { type: 'string' },
    counterparty: { type: 'string' }, 'contract-start': { type: 'string' }, 'contract-end': { type: 'string' }, tags: { type: 'string' },
    kind: { type: 'string' }, file: { type: 'string' }, convert: { type: 'boolean', default: false },
    status: { type: 'string' }, desc: { type: 'string' }, due: { type: 'string' }, result: { type: 'string' },
    manifest: { type: 'string' },
  },
})

const [cmd, sub, arg] = positionals
const company = flags.company as string
const db = createCorpDb({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY, actor: process.env.CORP_ACTOR ?? 'cli' })

function need(name: string): string {
  const v = (flags as Record<string, unknown>)[name]
  if (v === undefined || v === '') throw new Error(`--${name} required`)
  return String(v)
}
function opt(name: string): string | null {
  const v = (flags as Record<string, unknown>)[name]
  return v === undefined ? null : String(v)
}
function out(v: unknown) { console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2)) }

async function readTextFlag(): Promise<string | null> {
  const p = opt('text')
  return p ? readFileSync(p, 'utf8') : null
}

async function main() {
  switch (`${cmd} ${sub ?? ''}`.trim()) {
    case 'profile show': return out(await db.latestProfile(company))
    case 'profile snapshot': {
      const facts = JSON.parse(readFileSync(need('facts'), 'utf8'))
      const source = opt('source') ? (await db.getDocument(opt('source')!)).id : null
      return out(await db.snapshotProfile({ company, asOf: need('as-of'), sourceDocumentId: source, facts, sourceKey: opt('key') }))
    }
    case 'rules list': {
      const at = opt('at')
      const rows = at ? await db.rulesEffectiveAt(company, at) : await db.listRules(company)
      return out(rows.map((r: any) => ({ id: r.id, rule_type: r.rule_type, title: r.title, v: r.version_no, from: r.effective_from, to: r.effective_to, articles: r.articles?.length, note: r.note })))
    }
    case 'rules register': {
      const documentId = opt('doc') ? (await db.getDocument(opt('doc')!)).id : null
      return out(await db.registerRule({
        company, ruleType: need('type'), title: need('title'), versionNo: Number(need('version')), effectiveFrom: need('from'), effectiveTo: opt('to'),
        parentRuleId: opt('parent'), documentId, contentText: (await readTextFlag()) ?? '', note: opt('note'), sourceKey: opt('key'),
      }))
    }
    case 'doc list': return out((await db.listDocuments({ company, docType: opt('type') ?? undefined })).map((d: any) => ({ doc_no: d.doc_no, type: d.doc_type, title: d.title, status: d.status, issued: d.issued_at, valid_to: d.valid_to, v: d.current?.version_no ?? 0 })))
    case 'doc new': return out(await db.createDocument({
      company, docType: need('type'), category: opt('category') ?? 'other', title: need('title'), issuedBy: opt('issued-by'), issuedAt: opt('issued'),
      validFrom: opt('valid-from'), validTo: opt('valid-to'), counterparty: opt('counterparty'), contractStart: opt('contract-start'), contractEnd: opt('contract-end'),
      tags: opt('tags')?.split(',').map(s => s.trim()).filter(Boolean) ?? [], sourceKey: opt('key'),
    }))
    case 'doc add-version': {
      if (!arg) throw new Error('doc_no required')
      let path = need('file')
      if (flags.convert && /\.docx$/i.test(path)) path = convertDocxToPdf(path, dirname(path))
      const buffer = readFileSync(path)
      const mime = guessMime(path)
      let contentText = await readTextFlag()
      if (!contentText && mime === 'application/pdf') contentText = await extractPdfText(buffer)
      if (!contentText && /\.docx$/i.test(need('file'))) contentText = extractDocxText(need('file'))
      const r = await db.addVersion({ docNo: arg, kind: need('kind'), buffer, mime, contentText, note: opt('note') })
      return out({ doc_no: arg, version_no: r.version.version_no, kind: r.version.kind, sha256: r.version.sha256, storage_path: r.version.storage_path, status: r.document.status })
    }
    case 'doc url': return out(await db.signedUrl(arg!, opt('version') ? Number(opt('version')) : undefined))
    case 'action list': return out(await db.listActions({ company, status: opt('status') === 'all' ? null : (opt('status') ?? 'pending') }))
    case 'action add': {
      const documentId = opt('doc') ? (await db.getDocument(opt('doc')!)).id : null
      return out(await db.addAction({ company, documentId, kind: need('kind'), description: need('desc'), dueAt: opt('due'), sourceKey: opt('key') }))
    }
    case 'action done': return out(await db.doneAction(arg!, opt('result') ? JSON.parse(opt('result')!) : null))
    case 'verify': {
      const chain = await db.verifyChain(company)
      const files = await db.verifyStoredVersions(company)
      const bad = files.filter(f => !f.ok)
      out({ chain, versions: files.length, corrupted: bad })
      if (!chain.ok || bad.length) process.exit(1)
      return
    }
    case 'seed': return out(await runSeed({ db, manifestPath: need('manifest'), root: ROOT, log: console.log }))
    default:
      console.error('usage: corp-records <profile|rules|doc|action|verify|seed> <sub> [flags]')
      process.exit(2)
  }
}

main().catch(e => { console.error(`❌ ${(e as Error).message}`); process.exit(1) })
```

`seed.mjs`는 Task 9에서 만든다. 이 태스크에서는 임시로 `scripts/lib/corp-records/seed.mjs`에 `export async function runSeed() { throw new Error('seed not implemented') }`를 두고 진행한다.

- [ ] **Step 2: 타입 체크와 usage 확인**

Run: `npx tsc --noEmit` → 오류 0 (tsconfig가 scripts를 제외하면 `npx tsx --check scripts/corp-records.ts`로 대체)
Run: `npm run corp -- nope` → usage 출력, exit 2

- [ ] **Step 3: 실제 문서 1건으로 왕복 확인**

```bash
npm run corp -- doc new --type business_registration --category registration --title "사업자등록증 (2025-09-08 발급)" --issued 2025-09-08 --issued-by "삼성세무서" --key biz-reg-20250908
npm run corp -- doc add-version WI-DOC-2025-001 --kind final_signed --file scripts/logs/corp-records/윌로우인베스트먼트_사업자등록증_20250908.pdf --note "원본 PDF"
npm run corp -- doc add-version WI-DOC-2025-001 --kind final_signed --file scripts/logs/corp-records/윌로우인베스트먼트_사업자등록증_20250908.pdf
npm run corp -- doc url WI-DOC-2025-001
npm run corp -- verify
```
Expected: 첫 add-version은 `version_no: 1, status: final`; 둘째는 `❌ identical content already stored as v1`; url은 `https://…/storage/v1/object/sign/corp-records/willow/WI-DOC-2025-001/v1_….pdf?token=…`; verify는 `chain.ok true`, `corrupted []`.

(발급일이 2025년이라 doc_no가 `WI-DOC-2025-001`이 된다. 문서 번호는 발급 연도를 따른다.)

- [ ] **Step 4: 커밋**

```bash
git add scripts/corp-records.ts scripts/lib/corp-records/seed.mjs
git commit -m "feat(corp): add corp-records CLI (profile, rules, doc, action, verify)"
```

---

### Task 9: 시드 — 정관 4개 규정과 상시 서류

**Files:**
- Create: `scripts/lib/corp-records/seed.mjs`(교체)
- Create: `scripts/corp-records/seed-willow.json`
- Create (gitignore 폴더): `scripts/logs/corp-records/윌로우인베스트먼트_법인등기부등본_20260604.txt`, `scripts/logs/corp-records/윌로우인베스트먼트_통신판매업신고증_20260714.txt`, `scripts/logs/corp-records/profile-20260604.json`
- Copy into `scripts/logs/corp-records/`: `~/Downloads/윌로우인베스트먼트(주) 사업자등록증_20260610.pdf` → `윌로우인베스트먼트_사업자등록증_20260610.pdf`, `~/Downloads/윌로우인베스트먼트_주주명부_20260717.pdf` → `윌로우인베스트먼트_주주명부_20260717.pdf`, `~/Downloads/Willow Investments -Dongwook Contract Execution Version.docx` → `ETC_컨설팅계약서_20210624.docx`

**Interfaces:**
- Consumes: `createCorpDb` 전체, `text-extract.mjs`, `articles-parser.mjs`
- Produces: `runSeed({ db, manifestPath, root, log }) → { created: string[], skipped: string[] }`

- [ ] **Step 1: 원본 파일 정리**

```bash
D=scripts/logs/corp-records
cp ~/Downloads/"윌로우인베스트먼트(주) 사업자등록증_20260610.pdf" "$D/윌로우인베스트먼트_사업자등록증_20260610.pdf"
cp ~/Downloads/윌로우인베스트먼트_주주명부_20260717.pdf "$D/윌로우인베스트먼트_주주명부_20260717.pdf"
cp ~/Downloads/"Willow Investments -Dongwook Contract Execution Version.docx" "$D/ETC_컨설팅계약서_20210624.docx"
ls "$D"
```
Expected: 정관 docx·txt, 등기부 20260604 pdf, 사업자등록증 20250908·20260610 pdf, 통신판매업신고증 20260714 pdf, 주주명부 20260717 docx·pdf, ETC 계약서 docx.

- [ ] **Step 2: 이미지 PDF 판독 텍스트 작성**

등기부는 텍스트 레이어가 없다. `pdftoppm -r 110 -png <pdf> <prefix>`로 만든 PNG를 Read 툴로 보고 아래 내용을 확인한 뒤 그대로 저장한다.

`scripts/logs/corp-records/윌로우인베스트먼트_법인등기부등본_20260604.txt`:

```
등기사항전부증명서(말소사항 포함)[제출용]
등기번호 784008
등록번호 110111-7840089
상호 윌로우인베스트먼트 주식회사
본점 서울특별시 강남구 테헤란로70길 12, 402-592에이호(대치동)  2025.08.29 변경 2025.08.29 등기
  (말소) 서울특별시 강남구 테헤란로79길 25-1, 3층(삼성동)
  (말소) 서울특별시 강남구 영동대로118길 3, 3층(삼성동, 사문빌딩)  2021.09.01 변경 2021.09.02 등기
공고방법 서울특별시내에서 발행하는 일간 한국경제신문에 게재한다.
1주의 금액 금 5,000원
발행할 주식의 총수 200,000주
발행주식의 총수 200주 (보통주식 200주)  자본금의 액 금 1,000,000원
목적
1. 전문, 과학 및 기술서비스업
1. 경영컨설팅업
1. 공공관계 서비스업
1. 투자 컨설팅 및 제반업무 대행업
1. 엔젤투자업
1. (말소) 위 각호에 관련된 서비스업 및 컨설팅업  2026.05.26 삭제 2026.05.27 등기
1. (말소) 위 각호에 관련된 부대사업 일체  2026.05.26 삭제 2026.05.27 등기
1. 시스템, 응용 소프트웨어 개발업 및 공급업  2026.05.26 추가 2026.05.27 등기
1. 정보통신업  2026.05.26 추가 2026.05.27 등기
1. 데이터베이스 및 온라인 정보 제공업  2026.05.26 추가 2026.05.27 등기
1. 위 각호에 관련된 개발업  2026.05.26 추가 2026.05.27 등기
1. 위 각호에 관련된 도소매업 및 유통업  2026.05.26 추가 2026.05.27 등기
1. 위 각호에 관련된 서비스업 및 컨설팅업  2026.05.26 변경 2026.05.27 등기
1. 위 각호에 관련된 부대사업 일체  2026.05.26 변경 2026.05.27 등기
임원에 관한 사항
사내이사 김동욱  2022.09.01 주소변경 2022.09.14 등기  2024.04.05 중임 2024.04.09 등기
감사 김철형  2024.03.31 중임 2024.04.09 등기
회사성립연월일 2021년 04월 05일
등기기록의 개설 사유 및 연월일 설립 2021년 04월 05일 등기
관할등기소 서울중앙지방법원 등기국 / 발행등기소 법원행정처 등기정보중앙관리소
발급확인번호 0085-AAIN-HYRZ  발행일 2026/06/04
```

`scripts/logs/corp-records/윌로우인베스트먼트_통신판매업신고증_20260714.txt`:

```
통신판매업신고증
제 2026-서울강남-03934 호
상호 윌로우인베스트먼트 주식회사
소재지 서울특별시 강남구 테헤란로70길 12, 402-592호 H 타워 (대치동)
대표자(성명) 김동욱
「전자상거래 등에서의 소비자보호에 관한 법률」 제12조제1항, 같은 법 시행령 제13조제3항 및 같은 법 시행규칙 제8조제3항에 따라 통신판매업을 신고하였음을 증명합니다.
2026년 07월 14일
강남구청장
변경사항 2026-07-14 [영업중] 변경내용 없음
```

`scripts/logs/corp-records/profile-20260604.json`:

```json
{
  "corp_reg_no": "110111-7840089",
  "biz_reg_no": "205-88-01897",
  "name": "윌로우인베스트먼트 주식회사",
  "incorporated_on": "2021-04-05",
  "address": "서울특별시 강남구 테헤란로70길 12, 402-592에이호(대치동)",
  "capital": 1000000,
  "shares_issued": 200,
  "par_value": 5000,
  "fiscal_year_end": "12-31",
  "public_notice": "한국경제신문",
  "directors": [{ "role": "사내이사", "name": "김동욱", "appointed": "2024-04-05", "term_end": "2027-04-05", "represents": true }],
  "auditors": [{ "role": "감사", "name": "김철형", "appointed": "2024-03-31", "term_end": "2027-03-31" }],
  "board_exists": false,
  "shareholders": [
    { "name": "김동욱", "shares": 80, "relation": "대표이사" },
    { "name": "김지원", "shares": 80, "relation": "가족" },
    { "name": "김류하", "shares": 40, "relation": "가족(미성년)" }
  ],
  "shareholders_as_of": "2026-07-17",
  "business_purposes": [
    "전문, 과학 및 기술서비스업", "경영컨설팅업", "공공관계 서비스업", "투자 컨설팅 및 제반업무 대행업", "엔젤투자업",
    "시스템, 응용 소프트웨어 개발업 및 공급업", "정보통신업", "데이터베이스 및 온라인 정보 제공업",
    "위 각호에 관련된 개발업", "위 각호에 관련된 도소매업 및 유통업", "위 각호에 관련된 서비스업 및 컨설팅업", "위 각호에 관련된 부대사업 일체"
  ],
  "business_purposes_changed_on": "2026-05-26"
}
```

- [ ] **Step 3: 매니페스트 작성**

`scripts/corp-records/seed-willow.json` (파일 경로는 `localDir` 기준 상대경로. 이 파일은 커밋되므로 문서 내용은 넣지 않는다):

```json
{
  "company": "willow",
  "localDir": "scripts/logs/corp-records",
  "documents": [
    { "key": "articles-2021", "type": "regulation", "category": "articles_rules", "title": "정관 (2021년 제정, 별첨 임원퇴직금·상여금·유족보상금 규정 포함)", "issued": "2021-04-05", "issuedBy": "윌로우인베스트먼트 주식회사",
      "versions": [{ "kind": "final_signed", "file": "윌로우인베스트먼트_정관_2021.docx", "convert": true, "textFile": "윌로우인베스트먼트_정관_2021.txt", "note": "원시정관 docx → PDF 변환본" }] },
    { "key": "registry-20260604", "type": "registry_extract", "category": "registration", "title": "법인등기부등본 (등기사항전부증명서, 2026-06-04 발급)", "issued": "2026-06-04", "issuedBy": "법원행정처 등기정보중앙관리소", "validTo": "2026-09-04",
      "versions": [{ "kind": "reissue", "file": "윌로우인베스트먼트_법인등기부등본_20260604.pdf", "textFile": "윌로우인베스트먼트_법인등기부등본_20260604.txt", "note": "이미지 스캔, 텍스트는 판독본" }] },
    { "key": "biz-reg", "type": "business_registration", "category": "registration", "title": "사업자등록증 (205-88-01897)", "issued": "2025-09-08", "issuedBy": "삼성세무서",
      "versions": [
        { "kind": "reissue", "file": "윌로우인베스트먼트_사업자등록증_20250908.pdf", "note": "2025-09-08 발급" },
        { "kind": "reissue", "file": "윌로우인베스트먼트_사업자등록증_20260610.pdf", "note": "2026-06-10 발급 (종목에 응용 소프트웨어 개발 및 공급업 추가)" }
      ] },
    { "key": "mail-order-20260714", "type": "license_permit", "category": "registration", "title": "통신판매업신고증 (제2026-서울강남-03934호)", "issued": "2026-07-14", "issuedBy": "강남구청",
      "versions": [{ "kind": "reissue", "file": "윌로우인베스트먼트_통신판매업신고증_20260714.pdf", "textFile": "윌로우인베스트먼트_통신판매업신고증_20260714.txt" }] },
    { "key": "shareholders-20260717", "type": "shareholder_list", "category": "shareholders_meeting", "title": "주주명부 (2026-07-17)", "issued": "2026-07-17", "issuedBy": "윌로우인베스트먼트 주식회사",
      "versions": [{ "kind": "final_signed", "file": "윌로우인베스트먼트_주주명부_20260717.pdf" }] },
    { "key": "contract-etc-2021", "type": "contract", "category": "contract", "title": "Consulting Agreement — Exchange Traded Concepts, LLC", "issued": "2021-06-24", "counterparty": "Exchange Traded Concepts, LLC", "contractStart": "2021-04-01", "contractEnd": "2021-12-31", "tags": ["renewable", "usd"],
      "versions": [{ "kind": "final_signed", "file": "ETC_컨설팅계약서_20210624.docx", "convert": true, "note": "Execution version docx → PDF" }] },
    { "key": "contract-akros-2026", "type": "contract", "category": "contract", "title": "자문계약서 — (주)아크로스테크놀로지스 (2026-04-01 체결, 월 ₩12,500,000, 1년 자동연장)", "issued": "2026-04-01", "counterparty": "(주)아크로스테크놀로지스", "contractStart": "2026-04-01", "contractEnd": "2027-03-31", "tags": ["auto-renew", "wiki:91ed9629-e931-4ca1-a57f-bd99348227da"],
      "versions": [] },
    { "key": "contract-akros-2023", "type": "contract", "category": "contract", "title": "자문계약서 — (주)아크로스테크놀로지스 (2023-12-29 체결, 2026-03-31 합의 해지)", "issued": "2023-12-29", "counterparty": "(주)아크로스테크놀로지스", "contractStart": "2023-12-29", "contractEnd": "2026-03-31", "tags": ["terminated", "wiki:91ed9629-e931-4ca1-a57f-bd99348227da"],
      "versions": [] },
    { "key": "tax-return-2025", "type": "tax_filing", "category": "tax", "title": "2025 사업연도 법인세 신고서", "issued": "2026-03-17", "issuedBy": "세무대리인", "tags": ["fy2025", "wiki:c1811111-ed95-48dd-a200-767576761d0d"],
      "versions": [{ "kind": "final_signed", "url": "https://axcfvieqsaphhvbkyzzv.supabase.co/storage/v1/object/public/wiki-attachments/uploads/1773712241_willow_2025_tax_return.pdf", "localName": "윌로우인베스트먼트_법인세신고서_2025.pdf" }] },
    { "key": "fs-2025", "type": "tax_filing", "category": "tax", "title": "재무제표 2025 (제5기)", "issued": "2026-03-17", "issuedBy": "세무대리인", "tags": ["fy2025", "wiki:d5713cf7-f377-47dd-b61c-d12fbf75b7f9"],
      "versions": [{ "kind": "final_signed", "url": "https://axcfvieqsaphhvbkyzzv.supabase.co/storage/v1/object/public/wiki-attachments/d5713cf7-f377-47dd-b61c-d12fbf75b7f9/financial-statement-willow-2025.pdf", "localName": "윌로우인베스트먼트_재무제표_2025.pdf" }] }
  ],
  "rules": [
    { "key": "articles-v1", "type": "articles", "title": "정관", "version": 1, "from": "2021-04-05", "to": "2026-05-25", "document": "articles-2021", "textFile": "윌로우인베스트먼트_정관_2021.txt", "section": "body", "note": "부칙 시행일 공란 → 회사 성립일(2021-04-05)로 등록" },
    { "key": "retirement-v1", "type": "retirement_regulation", "title": "임원퇴직금지급규정 (별첨 1)", "version": 1, "from": "2021-04-05", "document": "articles-2021", "parent": "articles-v1", "textFile": "윌로우인베스트먼트_정관_2021.txt", "section": "attachment:1" },
    { "key": "bonus-v1", "type": "bonus_regulation", "title": "임원상여금지급규정 (별첨 2)", "version": 1, "from": "2021-04-05", "document": "articles-2021", "parent": "articles-v1", "textFile": "윌로우인베스트먼트_정관_2021.txt", "section": "attachment:2" },
    { "key": "survivor-v1", "type": "survivor_regulation", "title": "임원유족보상금지급규정 (별첨 3)", "version": 1, "from": "2021-04-05", "document": "articles-2021", "parent": "articles-v1", "textFile": "윌로우인베스트먼트_정관_2021.txt", "section": "attachment:3" },
    { "key": "articles-v2", "type": "articles", "title": "정관 (2026-05-26 제2조 사업목적 개정, 등기부 기준 재구성)", "version": 2, "from": "2026-05-26", "textFile": "윌로우인베스트먼트_정관_2021.txt", "section": "body",
      "replaceArticle": { "no": "제2조", "body": "회사는 다음의 사업을 영위함을 목적으로 한다.\n1. 전문, 과학 및 기술서비스업\n1. 경영컨설팅업\n1. 공공관계 서비스업\n1. 투자 컨설팅 및 제반업무 대행업\n1. 엔젤투자업\n1. 시스템, 응용 소프트웨어 개발업 및 공급업\n1. 정보통신업\n1. 데이터베이스 및 온라인 정보 제공업\n1. 위 각호에 관련된 개발업\n1. 위 각호에 관련된 도소매업 및 유통업\n1. 위 각호에 관련된 서비스업 및 컨설팅업\n1. 위 각호에 관련된 부대사업 일체" },
      "note": "개정 정관 원본 미수령. 등기부등본(2026-06-04) 목적란으로 제2조를 재구성. 원본·주주총회 의사록 수령 시 document_id 연결" }
  ],
  "profile": { "key": "profile-20260604", "asOf": "2026-06-04", "source": "registry-20260604", "factsFile": "profile-20260604.json" },
  "actions": [
    { "key": "act-registry-renew-2026-09", "kind": "provide", "document": "registry-20260604", "due": "2026-09-04", "desc": "등기부등본 재발급 업로드 (2026-06-04 발급본 발급확인 3개월 만료)" },
    { "key": "act-articles-v2-original", "kind": "provide", "document": "articles-2021", "due": "2026-09-30", "desc": "2026-05-26 사업목적 변경 당시의 개정 정관 원본과 주주총회 의사록 제출 (정관 v2 재구성본 대체)" },
    { "key": "act-officer-term-2027", "kind": "confirm", "due": "2027-02-28", "desc": "사내이사 김동욱(임기 2027-04-05)·감사 김철형(2027 정기주총 종결) 중임 결의 준비 — 2027년 3월 정기주주총회 안건, 결의 후 등기" },
    { "key": "act-backfill-ceo-salary", "kind": "provide", "due": "2026-09-30", "desc": "현행 대표이사 기본연봉 8,800만원을 정한 주주총회 결의 문서 제출 (없으면 다음 연봉 변경 건에서 소급 확인 결의)" },
    { "key": "act-akros-2026-original", "kind": "provide", "document": "contract-akros-2026", "due": "2026-09-30", "desc": "아크로스 자문계약서(2026-04-01) 서명본 PDF 제출 — 위키에는 요약만 있음" },
    { "key": "act-akros-2023-original", "kind": "provide", "document": "contract-akros-2023", "due": "2026-09-30", "desc": "아크로스 구 자문계약서(2023-12-29)와 2026-03-31 합의해지 문서 제출" }
  ]
}
```

텐소프트웍스 계약서용 두 번째 매니페스트 `scripts/corp-records/seed-tensw.json` (위키 첨부 URL에서 내려받고, 날인본 PDF는 `/Volumes/PRO-G40/Downloads`에서 복사):

```bash
cp "/Volumes/PRO-G40/Downloads/2-1. 계약서-AI 융합 탐방 퀴즈 콘텐츠 개발 용역_날인본.pdf" scripts/logs/corp-records/텐소_독립잇다_퀴즈콘텐츠_계약서_날인본.pdf
```

```json
{
  "company": "tensw",
  "localDir": "scripts/logs/corp-records",
  "documents": [
    { "key": "tensw-contract-dokrip-platform-2026", "type": "contract", "category": "contract", "title": "용역계약서 — 독립잇다, AI 융합 독립운동 기념관 탐방 플랫폼 개발 (₩18,000,000)", "issued": "2026-05-01", "counterparty": "독립잇다", "contractStart": "2026-05-01", "tags": ["wiki:fa9b4817-e765-4afb-9fe6-f08b09cf4317"],
      "versions": [{ "kind": "draft", "url": "https://axcfvieqsaphhvbkyzzv.supabase.co/storage/v1/object/public/tensw-project-docs/contracts/2026/20260501_dokriptda_AI-memorial-platform_dev-contract.docx", "localName": "텐소_독립잇다_기념관플랫폼_계약서.docx", "convert": true, "note": "위키 첨부 docx (서명 전 본). 날인본 수령 시 final_signed 추가" }] },
    { "key": "tensw-contract-dokrip-quiz-2026", "type": "contract", "category": "contract", "title": "용역계약서 — 독립잇다, AI 융합 탐방 퀴즈 콘텐츠 개발 (날인본)", "issued": "2026-05-01", "counterparty": "독립잇다", "contractStart": "2026-05-01",
      "versions": [{ "kind": "final_signed", "file": "텐소_독립잇다_퀴즈콘텐츠_계약서_날인본.pdf" }] },
    { "key": "tensw-contract-ptu-2026", "type": "contract", "category": "contract", "title": "용역계약서 — 평택대학교 PTU AI 지식융합 생태계 구축 및 인프라 고도화 (₩291,500,000)", "issued": "2026-05-12", "counterparty": "평택대학교", "contractStart": "2026-05-12", "tags": ["wiki:5fc63c8f-7ade-4bb9-8788-4f18b31570c8"],
      "versions": [{ "kind": "final_signed", "url": "https://axcfvieqsaphhvbkyzzv.supabase.co/storage/v1/object/public/wiki-attachments/dw_kim_willowinvt_com/1780213220496_ptu_contract_2026-05-12.pdf", "localName": "텐소_평택대_PTU_계약서_20260512.pdf" }] },
    { "key": "tensw-contract-skku-maint-2026", "type": "contract", "category": "contract", "title": "유지보수 계약서 — 성균관대학교 논문홍보 플랫폼 (2026.07~2027.02)", "issued": "2026-06-25", "counterparty": "성균관대학교", "contractStart": "2026-07-01", "contractEnd": "2027-02-28", "tags": ["wiki:f168a6e3-b080-4d1d-a662-c975fcdda62f"],
      "versions": [{ "kind": "final_signed", "url": "https://axcfvieqsaphhvbkyzzv.supabase.co/storage/v1/object/public/wiki-attachments/dwkim_august_gmail_com/1782360971207_skku_thesis_platform_maintenance.pdf", "localName": "텐소_성균관대_유지보수_계약서_2026.pdf" }] },
    { "key": "tensw-contract-nia-2026", "type": "contract", "category": "contract", "title": "일반용역계약서 — 한국독립운동 관계 자료 통합개방 데이터 구축 (NIA, 컨소시엄 지분 12%, ₩142,777,800)", "issued": "2026-07-16", "counterparty": "한국지능정보사회진흥원(NIA) 컨소시엄", "contractStart": "2026-07-16", "tags": ["consortium", "wiki:3ef88df1-98aa-4bfc-8ec9-1592a82c7165"],
      "versions": [{ "kind": "final_signed", "url": "https://axcfvieqsaphhvbkyzzv.supabase.co/storage/v1/object/public/wiki-attachments/dw_kim_willowinvt_com/1785935607075_20260716_NIA_independence-movement-data_contract.pdf", "localName": "텐소_NIA_독립운동데이터_계약서_20260716.pdf" }] }
  ],
  "rules": [],
  "actions": [
    { "key": "tensw-act-dokrip-platform-signed", "kind": "provide", "document": "tensw-contract-dokrip-platform-2026", "due": "2026-09-30", "desc": "독립잇다 기념관 탐방 플랫폼 개발 용역계약서 날인본 PDF 제출 (현재 서명 전 docx만 보관)" },
    { "key": "tensw-act-contract-terms", "kind": "provide", "due": "2026-09-30", "desc": "평택대·NIA 계약의 종료일과 계약금액을 계약서 본문에서 확인해 문서 메타(contract_end, amount)에 반영" }
  ]
}
```

앞으로 체결되는 모든 계약은 위키 첨부가 아니라 이 서류함이 원본이다. 스킬(2단계)은 "계약 체결" 입력에 `doc new --type contract` + `doc add-version --kind final_signed`를 수행하고, 위키 노트에는 `doc_no`만 적는다.

- [ ] **Step 4: 시드 러너 구현**

`scripts/lib/corp-records/seed.mjs`:

```js
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { extractPdfText, extractDocxText, convertDocxToPdf, guessMime } from './text-extract.mjs'
import { splitRegulationSections, replaceArticleBody } from './articles-parser.mjs'
import { sha256Hex } from './versions.mjs'

// url 항목은 로컬 폴더에 한 번 내려받아 재사용한다(재실행 시 네트워크 불필요).
async function materialize(dir, v) {
  if (v.file) return join(dir, v.file)
  if (!v.url) throw new Error('version needs file or url')
  const local = join(dir, v.localName ?? basename(new URL(v.url).pathname))
  if (!existsSync(local)) {
    const res = await fetch(v.url)
    if (!res.ok) throw new Error(`download failed ${res.status}: ${v.url}`)
    writeFileSync(local, Buffer.from(await res.arrayBuffer()))
  }
  return local
}

function pickSection(text, section) {
  const { body, attachments } = splitRegulationSections(text)
  if (!section || section === 'body') return body
  const m = /^attachment:(\d+)$/.exec(section)
  if (!m) throw new Error(`unknown section: ${section}`)
  const att = attachments.find(a => a.index === Number(m[1]))
  if (!att) throw new Error(`attachment ${m[1]} not found`)
  return `${att.title}\n${att.text}`
}

export async function runSeed({ db, manifestPath, root, log = () => {} }) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const company = manifest.company ?? 'willow'
  const dir = join(root, manifest.localDir)
  const created = []
  const skipped = []
  const docIdByKey = {}
  const docNoByKey = {}

  await db.ensureBucket()

  for (const d of manifest.documents ?? []) {
    let doc = await db.getDocumentByKey(d.key)
    if (doc) { skipped.push(`document ${d.key}`) } else {
      doc = await db.createDocument({
        company, docType: d.type, category: d.category ?? 'other', title: d.title, issuedBy: d.issuedBy ?? null, issuedAt: d.issued ?? null,
        validFrom: d.validFrom ?? null, validTo: d.validTo ?? null, counterparty: d.counterparty ?? null,
        contractStart: d.contractStart ?? null, contractEnd: d.contractEnd ?? null, tags: d.tags ?? [], sourceKey: d.key,
      })
      created.push(`document ${d.key} → ${doc.doc_no}`)
    }
    docIdByKey[d.key] = doc.id
    docNoByKey[d.key] = doc.doc_no
    const existing = await db.listVersions(doc.id)
    for (const v of d.versions ?? []) {
      const srcPath = await materialize(dir, v)
      let path = srcPath
      if (v.convert && /\.docx$/i.test(path)) path = convertDocxToPdf(path, dirname(path))
      const buffer = readFileSync(path)
      const mime = guessMime(path)
      if (existing.some(x => x.sha256 === sha256Hex(buffer))) { skipped.push(`version ${d.key}/${basename(srcPath)}`); continue }
      let contentText = v.textFile ? readFileSync(join(dir, v.textFile), 'utf8') : null
      if (!contentText && mime === 'application/pdf') contentText = await extractPdfText(buffer)
      if (!contentText && /\.docx$/i.test(srcPath)) contentText = extractDocxText(srcPath)
      const r = await db.addVersion({ docNo: doc.doc_no, kind: v.kind, buffer, mime, contentText, note: v.note ?? null })
      existing.push(r.version)
      created.push(`version ${doc.doc_no} v${r.version.version_no} (${v.kind})`)
      log(`  + ${doc.doc_no} v${r.version.version_no} ${basename(srcPath)}`)
    }
  }

  const ruleIdByKey = {}
  for (const r of manifest.rules ?? []) {
    const found = await db.getRuleByKey(r.key)
    if (found) { ruleIdByKey[r.key] = found.id; skipped.push(`rule ${r.key}`); continue }
    let text = pickSection(readFileSync(join(dir, r.textFile), 'utf8'), r.section)
    if (r.replaceArticle) text = replaceArticleBody(text, r.replaceArticle.no, r.replaceArticle.body)
    const rule = await db.registerRule({
      company, ruleType: r.type, title: r.title, versionNo: r.version, effectiveFrom: r.from, effectiveTo: r.to ?? null,
      parentRuleId: r.parent ? ruleIdByKey[r.parent] ?? null : null, documentId: r.document ? docIdByKey[r.document] ?? null : null,
      contentText: text, note: r.note ?? null, sourceKey: r.key,
    })
    ruleIdByKey[r.key] = rule.id
    created.push(`rule ${r.key} v${r.version} (${rule.articles.length} articles)`)
    log(`  + rule ${r.type} v${r.version}: ${rule.articles.length}조`)
  }

  if (manifest.profile) {
    const p = manifest.profile
    if (await db.getByKey('willow_corp_profiles', p.key)) skipped.push(`profile ${p.key}`)
    else {
      const facts = JSON.parse(readFileSync(join(dir, p.factsFile), 'utf8'))
      await db.snapshotProfile({ company, asOf: p.asOf, sourceDocumentId: p.source ? docIdByKey[p.source] ?? null : null, facts, sourceKey: p.key })
      created.push(`profile ${p.key}`)
    }
  }

  for (const a of manifest.actions ?? []) {
    if (await db.getByKey('willow_corp_actions', a.key)) { skipped.push(`action ${a.key}`); continue }
    await db.addAction({ company, documentId: a.document ? docIdByKey[a.document] ?? null : null, kind: a.kind, description: a.desc, dueAt: a.due ?? null, sourceKey: a.key })
    created.push(`action ${a.key}`)
  }

  return { created, skipped, docNos: docNoByKey }
}
```

- [ ] **Step 5: 시드 실행 (Task 8 Step 3에서 만든 테스트 문서는 먼저 정리)**

Task 8 Step 3의 `biz-reg-20250908` 문서는 매니페스트의 `biz-reg`와 겹친다. 그 문서의 버전은 `final_signed`라 삭제할 수 없으므로 매니페스트 `biz-reg`의 첫 버전 `file`이 같은 파일이면 시드가 sha256 중복으로 실패한다. 처리: Task 8 Step 3을 수행했다면 매니페스트에서 `biz-reg`의 `key`를 `biz-reg-20250908`으로 바꾸고 첫 버전 항목을 지운다(이미 v1로 들어가 있음). 그러면 시드가 그 문서를 재사용해 20260610본을 v2로 붙인다.

```bash
npm run corp -- seed --manifest scripts/corp-records/seed-willow.json
npm run corp -- --company tensw seed --manifest scripts/corp-records/seed-tensw.json
```
Expected(요지, willow): 문서 10건 생성(또는 1건 재사용; 아크로스 2건은 버전 0개), 버전 9개, 규정 5개(articles v1: 51조, retirement v1: 6조, bonus v1: 8조, survivor v1: 4조, articles v2: 51조), 프로필 1, 액션 6. `registerRule`이 articles v2를 넣을 때 v1의 `effective_to`는 매니페스트 값(2026-05-25) 그대로 유지된다(이미 닫혀 있어 prev 조회에 걸리지 않음).
Expected(tensw): 문서 5건(`TS-DOC-2026-001`~`005`), 버전 5개(독립잇다 플랫폼은 `draft`, 나머지 `final_signed`), 액션 2. 위키 URL 파일은 `scripts/logs/corp-records/`에 내려받아 남는다.

- [ ] **Step 6: 시드 재실행 idempotency와 검증**

```bash
npm run corp -- seed --manifest scripts/corp-records/seed-willow.json   # 전부 skipped
npm run corp -- rules list --at 2026-05-25    # articles v1 + 별첨 3개
npm run corp -- rules list --at 2026-09-03    # articles v2 + 별첨 3개
npm run corp -- rules list --at 2021-01-01    # 0건
npm run corp -- doc list
npm run corp -- action list
npm run corp -- profile show
npm run corp -- verify
```
Expected: 두 번째 seed는 `created: []`. `rules list --at 2026-09-03`에 `articles v2`가 있고 v1은 없다. `doc list`에 10개 문서, 사업자등록증은 `v: 2`, 아크로스 계약 2건은 `v: 0, status: draft`. `verify`는 `chain.ok: true`, `corrupted: []`. `npm run corp -- --company tensw doc list`에 계약 5건, `--company tensw verify`도 ok.

MCP `execute_sql`로 마스킹 확인:
```sql
select rule_type, version_no, (content_text ~ '\d{6}-\d{7}')::int as pii from public.willow_corp_rules where company='willow';
-- 기대: pii 전부 0
select count(*) filter (where content_text ~ '\d{6}-\d{7}') as pii_versions from public.willow_corp_document_versions;
-- 기대: 0
```

- [ ] **Step 7: 커밋**

```bash
git status --short scripts/logs   # 아무것도 안 나와야 함 (gitignore)
git add scripts/lib/corp-records/seed.mjs scripts/corp-records/seed-willow.json scripts/corp-records/seed-tensw.json
git commit -m "feat(corp): seed articles, regulations, standing documents, and contracts"
```

---

### Task 10: 문서 반영

**Files:**
- Modify: `CLAUDE.md` (Storage Buckets 표), `AGENTS.md` (같은 표)
- Modify: `docs/superpowers/specs/2026-09-03-corp-records-design.md` (상태 줄)

- [ ] **Step 1: 버킷 표에 행 추가**

`CLAUDE.md`와 `AGENTS.md`의 Storage Buckets 표 마지막에:

```
| `corp-records` | No | 법인 서류함 (정관·등기·결의 문서 원본, 삭제 금지, 서명 URL로만 열람) |
```

- [ ] **Step 2: 스펙 상태 갱신**

스펙 상단 `**상태**: 검토 대기 (CEO 승인 후 구현 계획 작성)` → `**상태**: 승인됨 (2026-09-03). 1단계 기반 구현 완료, 2단계 의사결정 파이프라인 계획 대기`

- [ ] **Step 3: 커밋**

```bash
git add CLAUDE.md AGENTS.md docs/superpowers/specs/2026-09-03-corp-records-design.md
git commit -m "docs(corp): register corp-records bucket and mark phase 1 done"
```

---

## Self-Review

**Spec coverage (1단계 범위)**
- 5.1~5.8 테이블: Task 5 ✔ (`willow_corp_sequences` 추가는 ref_no 발급용)
- 규정 시행기간 조회 함수: Task 5 ✔, 경계 검증 Step 3 ✔
- 불변성(버전·이벤트·확정 건·규정): Task 5 트리거 ✔ + Task 3 애플리케이션 규칙 ✔
- 해시 체인: Task 2 + Task 7 `appendEvent`/`verifyChain` ✔
- private 버킷·경로·sha256·중복 거부: Task 3, 7 ✔
- 주민번호 마스킹: Task 4 + Task 7(`registerRule`, `addVersion`) ✔, Task 9 Step 6 SQL 확인 ✔
- CLI 8절 중 1단계 서브커맨드(profile/rules/doc/action/verify/seed): Task 8 ✔. `decision`, `link`, `doc render`는 2단계
- 12절 시드 1~5: Task 9 ✔ (정관 v1·v2, 별첨 3, 등기부, 사업자등록증 2버전, 통신판매업, 주주명부, ETC 계약, 프로필, 액션 4)
- 13절 테스트 중 1단계 항목(ref_no, 체인, 중복, 조문 파서, 마스킹, 트리거, 경계): Task 1~5 ✔. 상여 상한 계산은 2단계

**Type consistency**: `createCorpDb` 메서드 이름이 Task 7·8·9에서 동일(`getDocumentByKey`, `getRuleByKey`, `getByKey`, `listVersions`, `addVersion`, `registerRule`, `snapshotProfile`, `addAction`, `verifyChain`, `verifyStoredVersions`). `runSeed({ db, manifestPath, root, log })` 시그니처 Task 8·9 일치. `splitRegulationSections`/`replaceArticleBody` Task 4·9 일치.

**Known trade-offs**
- Task 5 검증에서 넣는 테스트 이벤트 1행은 삭제 불가라 남는다. `verifyChain`은 `entity_type='test'`를 제외한다(Task 7 Step 2에 명시).
- 정관 v2는 등기부 목적란으로 재구성한 텍스트다. 원본 수령 시 `document_id`만 갱신 가능(규정 트리거 허용 범위)하고 텍스트가 다르면 v3로 등록한다.
