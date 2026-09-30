# 경영관리 에이전트 1단계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 텐소·윌로우 경영 일정을 한 원장에서 관리한다. 반복 규칙으로 일정을 미리 깔고, 메일·스페이스·재무 기록으로 일정을 만들고·고치고·닫고, 결정이 필요한 것만 윌리로 묻는다(발송 없음).

**Architecture:** 기존 `tensw_mgmt_schedules`·`willow_mgmt_schedules` 를 원장으로 쓰고 `source_key` 로 멱등 upsert 한다. 순수 함수 모듈(`scripts/lib/mgmt/*.mjs`, node:test)이 규칙 전개·완료 판정·가림·추론을 하고, 한 번 돌고 끝나는 실행기 `scripts/mgmt-agent.mjs` 를 launchd 가 부른다. 메시지 해석은 `codex exec --ephemeral --output-schema` 한 번 호출로 한다.

**Tech Stack:** Node 26 ESM(.mjs), `node --test`, `@supabase/supabase-js`, `googleapis`(Gmail·Chat), Codex CLI, launchd, Python `scripts/lib/kr_workdays.py`(달력).

**Spec:** `docs/superpowers/specs/2026-09-30-mgmt-agent-design.md`

## Global Constraints

- 자율 범위는 초안까지. 이 단계 코드는 **메일·메시지를 보내지 않는다**(Gmail send·drafts 호출 금지, Chat 쓰기 금지). 윌리로 가는 알림만 보낸다.
- 메일은 `gmail_tokens` 의 `context='tensoftworks'`(텐소)와 `context='default'`(윌로우) 두 개만 읽는다. 스페이스는 텐소 토큰으로만 읽는다.
- 원장 키 규약: 정기 `mgmt:<company>:<task>:<YYYY-MM>:<step>`, 대화발 `mgmt-chat:<spaces/…/messages/…>`, 메일발 `mgmt-mail:<company>:<gmailId>`.
- `category='personal'` 행은 읽지도 쓰지도 않는다.
- 비밀값(비밀번호·API 키·토큰·계좌번호·주민번호·백업코드)은 DB·로그·윌리 메시지에 값으로 남기지 않는다. 저장 전 `redact()` 를 반드시 거친다.
- Codex 호출은 `codex exec --ephemeral` (메모리 `feedback_codex_cli_only`). Claude/Anthropic SDK 금지.
- 스케줄러는 launchd(crontab 금지). 윌리 코드 수정 뒤 `launchctl kickstart -k gui/$(id -u)/com.willow.telegram-bot`.
- 커밋 메시지는 영어, 끝에 세션 attribution 두 줄. 커밋 전 `git branch --show-current` 와 `git diff --cached --stat` 확인(공유 워킹트리, 남의 변경 섞지 않기).
- Google Chat 메시지는 `orderBy: 'createTime desc'` 로 커서까지 읽는다. `createTime` 필터는 쓰지 않는다(0건을 잘못 돌려줌).

## Review Focus

1. **이미 닫힌 일을 다시 여는 것** — 사람이 완료로 체크한 행을 에이전트 upsert 가 `is_completed=false` 로 되돌리면 안 된다. (Task 5 테스트)
2. **회사 혼동** — 윌로우 메일에서 나온 할 일이 텐소 테이블로 가면 안 된다. 입력 경로가 1차 판정이다. (Task 9 테스트)
3. **휴일·말일 규칙** — 25일이 토요일이면 24일(직전 영업일), 10일이 공휴일이면 다음 영업일, 말일 규칙은 30/31/28일을 맞춘다. (Task 4 테스트)
4. **비밀값이 판단 입력·저장값에 남는 것** — Codex 에 넘기기 전과 DB 에 쓰기 전 모두 가린다. 여러 줄 백업코드도. (Task 3·9 테스트)
5. **같은 메시지를 두 번 처리** — 실행기가 겹쳐 돌거나 커서 저장 전에 죽어도 항목이 중복되지 않는다(source_key·message 이름 유니크). (Task 8·9 테스트)

---

## File Structure

| 파일 | 책임 |
|---|---|
| `supabase/migrations/20260930120000_mgmt_agent.sql` | 원장 칸 추가, 새 테이블 5개 |
| `scripts/lib/mgmt/redact.mjs` | 비밀값 가림 |
| `scripts/lib/mgmt/calendar.mjs` | 한국 영업일 달력(kr_workdays 결과 캐시) |
| `scripts/lib/mgmt/rules.mjs` | 반복 규칙 → 회차 날짜 전개 |
| `scripts/lib/mgmt/seed-rules.mjs` | 씨앗 규칙(스킬·SOP에 적힌 정기 업무) |
| `scripts/lib/mgmt/ledger.mjs` | 원장 행 계획(upsert/adopt/close/missed) — 순수 함수 + DB 적용 |
| `scripts/lib/mgmt/closers.mjs` | 완료 근거 판정(세금 고지·보낸 메일·현금) |
| `scripts/lib/mgmt/sources.mjs` | Gmail·Chat 읽기, 커서 |
| `scripts/lib/mgmt/judge.mjs` | Codex 해석 호출과 스키마 |
| `scripts/lib/mgmt/apply-judgement.mjs` | 해석 결과 → 건·항목·일정·완료 |
| `scripts/lib/mgmt/infer.mjs` | 지난 기록에서 반복 규칙 추론 |
| `scripts/lib/mgmt/decisions.mjs` | 결정함·저녁 요약 문구 |
| `scripts/lib/mgmt/*.test.mjs` | 각 모듈 시험 |
| `scripts/mgmt-agent.mjs` | 실행기(`--dry`, `--only`) |
| `scripts/mgmt-cleanup-ledger.mjs` | 1회성 원장 정리 |
| `scripts/mgmt-replay.mjs` | 6~9월 재현 시험 |
| `scripts/com.willow.mgmt-agent.plist` | launchd |
| `src/lib/mcp/tools/tensw-mgmt.ts` | 테이블 버그 수정 |
| `scripts/telegram-bot.ts` | `mgmt:` 버튼 처리만 |

---

### Task 1: MCP 텐소 일정 도구가 텐소 테이블을 쓰게

**Files:**
- Modify: `src/lib/mcp/tools/tensw-mgmt.ts:401,485,512,539,560` (`willow_mgmt_schedules` + `.eq('category','tensw-mgmt')`)
- Test: `src/lib/mcp/tools/tensw-mgmt-schedules.test.mjs`

**Interfaces:**
- Produces: `tensw_list_schedules`/`tensw_update_schedule`/`tensw_delete_schedule`/`tensw_toggle_schedule_date` 가 `tensw_mgmt_schedules` 를 읽고 쓴다. `tensw-mgmt` 카테고리 필터는 뺀다(그 테이블 전체가 텐소다).

- [ ] **Step 1: 실패하는 시험**

```js
// src/lib/mcp/tools/tensw-mgmt-schedules.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./tensw-mgmt.ts', import.meta.url), 'utf8')

function toolBody(name) {
  const start = src.indexOf(`'${name}'`)
  assert.ok(start > 0, `${name} 도구가 없다`)
  const next = src.indexOf('server.tool(', start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

for (const name of ['tensw_create_schedule', 'tensw_list_schedules', 'tensw_update_schedule', 'tensw_delete_schedule', 'tensw_toggle_schedule_date']) {
  test(`${name} 은 텐소 일정 테이블만 쓴다`, () => {
    const body = toolBody(name)
    assert.match(body, /from\('tensw_mgmt_schedules'\)/)
    assert.doesNotMatch(body, /willow_mgmt_schedules/)
  })
}
```

- [ ] **Step 2: 실패 확인** — `node --test src/lib/mcp/tools/tensw-mgmt-schedules.test.mjs` → list/update/delete/toggle 4개 FAIL.
  `server.tool(` 이 아니라 다른 등록 함수를 쓰면 `toolBody` 의 구분자를 그 이름으로 맞춘다(파일에서 `grep -n "registerTool\|server.tool(" ` 로 확인).
- [ ] **Step 3: 구현** — 네 곳의 `.from('willow_mgmt_schedules')` 를 `.from('tensw_mgmt_schedules')` 로 바꾸고, 각 쿼리의 `.eq('category', 'tensw-mgmt')` 줄을 지운다.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS. `npx tsc --noEmit -p . 2>&1 | grep tensw-mgmt.ts` 가 비어 있어야 한다.
- [ ] **Step 5: 커밋**

```bash
git add src/lib/mcp/tools/tensw-mgmt.ts src/lib/mcp/tools/tensw-mgmt-schedules.test.mjs
git commit -m "fix(mcp): tensw schedule tools read and write the tensw table"
```

---

### Task 2: 원장 칸과 새 테이블

**Files:**
- Create: `supabase/migrations/20260930120000_mgmt_agent.sql`

**Interfaces:**
- Produces (두 일정 테이블 공통 칸): `origin text`, `recipe text`, `agent_state text`, `evidence jsonb default '[]'`, `rule_id uuid`.
- Produces 테이블: `mgmt_rules`, `mgmt_cases`, `mgmt_entries`, `mgmt_decisions`, `mgmt_cursors` (아래 SQL 그대로).

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 경영관리 에이전트: 일정 원장 칸 + 규칙·기록부·결정함·커서
do $$ declare t text; begin
  foreach t in array array['tensw_mgmt_schedules','willow_mgmt_schedules'] loop
    execute format('alter table %I add column if not exists origin text', t);
    execute format('alter table %I add column if not exists recipe text', t);
    execute format('alter table %I add column if not exists agent_state text', t);
    execute format($f$alter table %I add column if not exists evidence jsonb not null default '[]'::jsonb$f$, t);
    execute format('alter table %I add column if not exists rule_id uuid', t);
    execute format('create unique index if not exists %I on %I (source_key) where source_key is not null', t || '_source_key_uq', t);
  end loop;
end $$;

create table if not exists mgmt_rules (
  id uuid primary key default gen_random_uuid(),
  company text not null check (company in ('tensw','willow')),
  task_key text not null,
  title text not null,
  rule jsonb not null,            -- {kind:'monthly_day'|'month_end'|'quarterly_day'|'yearly_date', day, months, shift:'prev'|'next'}
  lead_days int not null default 0,
  step text not null default 'do',
  recipe text,
  completion jsonb,               -- {kind:'tax', types:[...]} | {kind:'sent_mail', to, subject} | {kind:'cash', counterparty, direction}
  adopt_prefix text,              -- 같은 날 이 접두사 source_key 행이 있으면 새로 만들지 않고 그 행을 쓴다
  origin text not null default 'seed' check (origin in ('seed','inferred','manual')),
  confidence numeric,
  evidence jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company, task_key, step)
);

create table if not exists mgmt_cases (
  id uuid primary key default gen_random_uuid(),
  company text not null check (company in ('tensw','willow')),
  name text not null,
  counterparty text,
  stage text,
  status text not null default 'open' check (status in ('open','closed')),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company, name)
);

create table if not exists mgmt_entries (
  id uuid primary key default gen_random_uuid(),
  company text not null check (company in ('tensw','willow')),
  case_id uuid references mgmt_cases(id),
  kind text not null check (kind in ('decision','todo','material','daily','security')),
  body text not null,
  actor text,
  assignee text,
  due_date date,
  done_at timestamptz,
  schedule_key text,
  source text not null,           -- 'chat' | 'mail'
  source_ref text not null,       -- spaces/…/messages/… 또는 gmail id
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (kind, source_ref, body)
);

create table if not exists mgmt_decisions (
  id uuid primary key default gen_random_uuid(),
  company text not null check (company in ('tensw','willow')),
  kind text not null,             -- send_approval | money | scope | attendee | classify | missed | security | rule_review
  subject_key text not null,      -- 같은 판단을 다시 묻지 않기 위한 키(거래처·성격·레시피)
  question text not null,
  options jsonb not null,         -- [{id,label}]
  recommended text,
  schedule_key text,
  refs jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open','sent','answered','expired')),
  answer text,
  answered_at timestamptz,
  telegram_message_id bigint,
  created_at timestamptz not null default now()
);
create unique index if not exists mgmt_decisions_open_uq on mgmt_decisions (subject_key) where status in ('open','sent');

create table if not exists mgmt_cursors (
  source text primary key,        -- 'mail:tensw' | 'mail:willow' | 'chat:spaces/AAA'
  last_seen_at timestamptz not null,
  last_ref text,
  updated_at timestamptz not null default now()
);

alter table mgmt_rules enable row level security;
alter table mgmt_cases enable row level security;
alter table mgmt_entries enable row level security;
alter table mgmt_decisions enable row level security;
alter table mgmt_cursors enable row level security;
```

- [ ] **Step 2: 적용 전 중복 확인** — 유니크 인덱스가 실패하지 않게 기존 중복 `source_key` 를 본다:
  `select source_key, count(*) from tensw_mgmt_schedules where source_key is not null group by 1 having count(*)>1;` (willow 도 같게). 결과가 있으면 멈추고 보고한다.
- [ ] **Step 3: 적용** — Supabase MCP `apply_migration`(project `axcfvieqsaphhvbkyzzv`, name `mgmt_agent`, 위 SQL).
- [ ] **Step 4: 확인** — `select column_name from information_schema.columns where table_name='tensw_mgmt_schedules' and column_name in ('origin','recipe','agent_state','evidence','rule_id');` → 5행. `select to_regclass('mgmt_decisions');` → not null.
- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/20260930120000_mgmt_agent.sql
git commit -m "feat(mgmt): ledger columns and tables for the management agent"
```

---

### Task 3: 비밀값 가림

**Files:**
- Create: `scripts/lib/mgmt/redact.mjs`
- Test: `scripts/lib/mgmt/redact.test.mjs`

**Interfaces:**
- Produces: `redact(text: string): { text: string, found: string[] }` — `found` 는 가린 종류 이름('password','api_key','jwt','rrn','account','backup_codes','pg_url').

- [ ] **Step 1: 실패하는 시험**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { redact } from './redact.mjs'

test('비밀번호 문장', () => {
  const r = redact('관리자 ID admin / PW: Abc!2345xy 입니다')
  assert.doesNotMatch(r.text, /Abc!2345xy/)
  assert.ok(r.found.includes('password'))
})
test('API 키와 JWT', () => {
  const r = redact('키 sk-proj-AbCdEf1234567890XYZ 와 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_part-1234567890')
  assert.doesNotMatch(r.text, /sk-proj-AbCdEf/)
  assert.doesNotMatch(r.text, /eyJhbGci/)
  assert.deepEqual([...new Set(r.found)].sort(), ['api_key', 'jwt'])
})
test('주민번호와 계좌번호', () => {
  const r = redact('주민번호 800101-1234567, 우리 1005-123-456789')
  assert.doesNotMatch(r.text, /1234567/)
  assert.doesNotMatch(r.text, /456789/)
  assert.ok(r.found.includes('rrn') && r.found.includes('account'))
})
test('여러 줄 백업코드', () => {
  const codes = ['a1b2c3d4-e5f6a7b8', 'c9d0e1f2-a3b4c5d6', 'e7f8a9b0-c1d2e3f4', '1a2b3c4d-5e6f7a8b'].join('\n')
  const r = redact(`${codes}\n위키에 저장해줘`)
  assert.doesNotMatch(r.text, /a1b2c3d4/)
  assert.ok(r.found.includes('backup_codes'))
  assert.match(r.text, /위키에 저장해줘/)
})
test('DB 접속 문자열', () => {
  const r = redact("PGPASSWORD='s3cretVal' psql postgresql://postgres:s3cretVal@db.x.supabase.co:5432/postgres")
  assert.doesNotMatch(r.text, /s3cretVal/)
})
test('평범한 업무 문장은 그대로', () => {
  const s = '9월분 세금계산서 발행 부탁드립니다. 금액 5,500,000원, 10/2까지'
  assert.equal(redact(s).text, s)
  assert.deepEqual(redact(s).found, [])
})
```

- [ ] **Step 2: 실패 확인** — `node --test scripts/lib/mgmt/redact.test.mjs` → 모듈 없음 FAIL.
- [ ] **Step 3: 구현**

```js
// 저장·전송 전에 비밀값을 가린다. 값은 남기지 않고 종류만 돌려준다.
const MASK = '[가림]'
const RULES = [
  ['pg_url', /(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1' + MASK + '@'],
  ['password', /(PGPASSWORD\s*=\s*)['"]?[^'"\s]+['"]?/g, '$1' + MASK],
  ['password', /((?:비밀번호|비번|패스워드|암호|password|passwd|\bpw)\s*(?:는|은|:|=|->|→)?\s*)[`"']?[^\s`"',]{4,}[`"']?/gi, '$1' + MASK],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}/g, MASK],
  ['api_key', /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, MASK],
  ['api_key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, MASK],
  ['api_key', /\b(?:ghp|gho|github_pat|xox[bap])_[A-Za-z0-9_]{16,}\b/g, MASK],
  ['rrn', /\b\d{6}-[1-4]\d{6}\b/g, MASK],
  ['account', /\b\d{3,6}-\d{2,6}-\d{4,8}(?:-\d{1,3})?\b/g, MASK],
]
// 한 줄에 코드 하나씩, 연속 3줄 이상이면 백업·복구 코드로 본다.
const CODE_LINE = /^\s*[A-Za-z0-9]{4,10}(?:[- ][A-Za-z0-9]{4,10}){0,3}\s*$/

export function redact(input) {
  let text = String(input ?? '')
  const found = []
  const lines = text.split('\n')
  let run = []
  const flush = () => {
    if (run.length >= 3 && run.some(i => /\d/.test(lines[i]))) {
      for (const i of run) lines[i] = MASK
      found.push('backup_codes')
    }
    run = []
  }
  lines.forEach((line, i) => { if (CODE_LINE.test(line)) run.push(i); else flush() })
  flush()
  text = lines.join('\n')
  for (const [kind, re, rep] of RULES) {
    const next = text.replace(re, rep)
    if (next !== text) { found.push(kind); text = next }
  }
  return { text, found }
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령 PASS(6개). 실패하면 정규식만 고친다(시험을 바꾸지 않는다).
- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/mgmt/redact.mjs scripts/lib/mgmt/redact.test.mjs
git commit -m "feat(mgmt): redact secrets before storing or judging messages"
```

---

### Task 4: 영업일 달력과 규칙 전개

**Files:**
- Create: `scripts/lib/mgmt/calendar.mjs`, `scripts/lib/mgmt/rules.mjs`
- Test: `scripts/lib/mgmt/rules.test.mjs`

**Interfaces:**
- Produces: `makeCalendar(loadMonth: (y,m)=>{year,month,lastDay,workdays:number[]}) → { isWorkday(dateKey): boolean, shift(dateKey, 'prev'|'next'): dateKey, lastDay(y,m): number }`
- Produces: `defaultLoadMonth(y, m)` — `python3 scripts/lib/kr_workdays.py y m` 를 실행해 JSON 을 돌려준다(달마다 캐시).
- Produces: `expandRule(rule, fromKey, toKey, cal) → Array<{ date: 'YYYY-MM-DD', period: 'YYYY-MM' }>`
  - `rule.kind`: `monthly_day{day, shift}`, `month_end{shift}`, `quarterly_day{day, months:[1,4,7,10], shift}`, `yearly_date{month, day, shift}`, `business_days_before{anchor:{kind:'monthly_day',day}, n}`.
  - `period` 는 회차가 가리키는 달(업무 대상 월). `rule.period_offset`(기본 0)만큼 날짜 달에서 뺀다(예: 지원금 15일 신청은 전월분 → `period_offset: 1`).

- [ ] **Step 1: 실패하는 시험**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { makeCalendar } from './calendar.mjs'
import { expandRule } from './rules.mjs'

// 2026-10: 3(토) 개천절, 5(월) 대체공휴일, 9(금) 한글날 / 2026-11·12 는 주말만
const fixture = {
  '2026-10': [1, 2, 6, 7, 8, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30],
  '2026-11': [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27, 30],
  '2026-12': [1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 21, 22, 23, 24, 28, 29, 30, 31],
}
const last = { '2026-10': 31, '2026-11': 30, '2026-12': 31 }
const cal = makeCalendar((y, m) => {
  const k = `${y}-${String(m).padStart(2, '0')}`
  return { year: y, month: m, lastDay: last[k], workdays: fixture[k] }
})

test('급여일 25일, 쉬는 날이면 직전 영업일', () => {
  const r = expandRule({ kind: 'monthly_day', day: 25, shift: 'prev' }, '2026-10-01', '2026-12-31', cal)
  assert.deepEqual(r.map(x => x.date), ['2026-10-23', '2026-11-25', '2026-12-24'])
})
test('납부 10일, 쉬는 날이면 다음 영업일', () => {
  const r = expandRule({ kind: 'monthly_day', day: 10, shift: 'next' }, '2026-10-01', '2026-10-31', cal)
  assert.deepEqual(r.map(x => x.date), ['2026-10-12'])
})
test('말일(마지막 영업일)', () => {
  const r = expandRule({ kind: 'month_end', shift: 'prev' }, '2026-10-01', '2026-12-31', cal)
  assert.deepEqual(r.map(x => x.date), ['2026-10-30', '2026-11-30', '2026-12-31'])
})
test('분기 25일은 해당 달만', () => {
  const r = expandRule({ kind: 'quarterly_day', day: 25, months: [1, 4, 7, 10], shift: 'next' }, '2026-10-01', '2026-12-31', cal)
  assert.deepEqual(r.map(x => x.date), ['2026-10-26'])
})
test('전월분 업무는 period 가 한 달 앞', () => {
  const r = expandRule({ kind: 'monthly_day', day: 15, shift: 'prev', period_offset: 1 }, '2026-10-01', '2026-10-31', cal)
  assert.deepEqual(r, [{ date: '2026-10-15', period: '2026-09' }])
})
test('앵커 n영업일 전', () => {
  const r = expandRule({ kind: 'business_days_before', anchor: { kind: 'monthly_day', day: 25, shift: 'prev' }, n: 3 }, '2026-10-01', '2026-10-31', cal)
  assert.deepEqual(r.map(x => x.date), ['2026-10-20'])
})
test('범위 밖 회차는 없다', () => {
  assert.deepEqual(expandRule({ kind: 'monthly_day', day: 25, shift: 'prev' }, '2026-10-24', '2026-10-31', cal), [])
})
```

- [ ] **Step 2: 실패 확인** — `node --test scripts/lib/mgmt/rules.test.mjs` → FAIL.
- [ ] **Step 3: 구현**

```js
// calendar.mjs — 한국 영업일. 계산은 kr_workdays.py 하나에 맡긴다(출근부·발송과 같은 달력).
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const pad = n => String(n).padStart(2, '0')
export const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
export const parseKey = k => k.split('-').map(Number)

export function defaultLoadMonth(y, m) {
  const out = execFileSync('python3', [path.join(ROOT, 'scripts/lib/kr_workdays.py'), String(y), String(m)], { encoding: 'utf8' })
  return JSON.parse(out)
}

export function makeCalendar(loadMonth = defaultLoadMonth) {
  const cache = new Map()
  const month = (y, m) => {
    const k = `${y}-${m}`
    if (!cache.has(k)) cache.set(k, loadMonth(y, m))
    return cache.get(k)
  }
  const isWorkday = key => {
    const [y, m, d] = parseKey(key)
    return month(y, m).workdays.includes(d)
  }
  const step = (key, dir) => {
    const t = new Date(`${key}T00:00:00Z`)
    t.setUTCDate(t.getUTCDate() + dir)
    return t.toISOString().slice(0, 10)
  }
  const shift = (key, how) => {
    if (!how) return key
    let k = key
    while (!isWorkday(k)) k = step(k, how === 'prev' ? -1 : 1)
    return k
  }
  const backBusinessDays = (key, n) => {
    let k = key
    for (let i = 0; i < n; i++) { k = step(k, -1); while (!isWorkday(k)) k = step(k, -1) }
    return k
  }
  return { isWorkday, shift, backBusinessDays, lastDay: (y, m) => month(y, m).lastDay }
}
```

```js
// rules.mjs — 반복 규칙을 날짜 회차로 편다.
import { dateKey, parseKey } from './calendar.mjs'

function months(fromKey, toKey) {
  const [fy, fm] = parseKey(fromKey), [ty, tm] = parseKey(toKey)
  const out = []
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, m = 1) : m++) out.push([y, m])
  return out
}

function baseDate(rule, y, m, cal) {
  switch (rule.kind) {
    case 'monthly_day': return cal.shift(dateKey(y, m, Math.min(rule.day, cal.lastDay(y, m))), rule.shift)
    case 'month_end': return cal.shift(dateKey(y, m, cal.lastDay(y, m)), rule.shift ?? 'prev')
    case 'quarterly_day': return rule.months.includes(m) ? cal.shift(dateKey(y, m, rule.day), rule.shift) : null
    case 'yearly_date': return rule.month === m ? cal.shift(dateKey(y, m, rule.day), rule.shift) : null
    case 'business_days_before': {
      const a = baseDate(rule.anchor, y, m, cal)
      return a ? cal.backBusinessDays(a, rule.n) : null
    }
    default: throw new Error(`알 수 없는 규칙: ${rule.kind}`)
  }
}

function periodOf(y, m, offset = 0) {
  const t = new Date(Date.UTC(y, m - 1 - offset, 1))
  return t.toISOString().slice(0, 7)
}

export function expandRule(rule, fromKey, toKey, cal) {
  const out = []
  for (const [y, m] of months(fromKey, toKey)) {
    const d = baseDate(rule, y, m, cal)
    if (d && d >= fromKey && d <= toKey) out.push({ date: d, period: periodOf(y, m, rule.period_offset ?? 0) })
  }
  return out
}
```

- [ ] **Step 4: 통과 확인** — PASS(7개). 실제 달력과 대조: `node -e "import('./scripts/lib/mgmt/calendar.mjs').then(c=>{const k=c.makeCalendar();console.log(k.shift('2026-10-25','prev'), k.shift('2026-10-10','next'))})"` → `2026-10-23 2026-10-12`.
- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/mgmt/calendar.mjs scripts/lib/mgmt/rules.mjs scripts/lib/mgmt/rules.test.mjs
git commit -m "feat(mgmt): expand recurring rules on the Korean business calendar"
```

---

### Task 5: 씨앗 규칙과 원장 계획

**Files:**
- Create: `scripts/lib/mgmt/seed-rules.mjs`, `scripts/lib/mgmt/ledger.mjs`
- Test: `scripts/lib/mgmt/ledger.test.mjs`

**Interfaces:**
- Consumes: `expandRule`, `makeCalendar` (Task 4).
- Produces: `SEED_RULES: Array<Rule>` — Rule = `{ company, task_key, title, rule, lead_days, step, recipe, completion, adopt_prefix? }`.
- Produces: `scheduleKey(company, task_key, period, step) → 'mgmt:<company>:<task_key>:<period>:<step>'`.
- Produces: `planOccurrences(rules, existingRows, { from, to, cal }) → { insert: Row[], update: Array<{id, patch}> }`
  - Row = `{ title, schedule_date, type:'deadline', category:'other', source_key, origin:'seed'|'inferred', recipe, agent_state:'planned', evidence:[], is_completed:false, rule_id }`.
  - 이미 같은 `source_key` 가 있으면: 날짜·제목이 다를 때만 update. **`is_completed`·`agent_state` 는 절대 되돌리지 않는다.**
  - `adopt_prefix` 가 있고 같은 날짜에 그 접두사 키 행이 있으면 새로 만들지 않는다(텐소 재무 동기화가 이미 만든 세금 행).
- Produces: `planMissed(openRows, todayKey) → Array<{id, patch:{agent_state:'missed'}}>` — `agent_state in ('planned','preparing')`, `is_completed=false`, `schedule_date < today`.
- Produces: `applyPlan(sb, table, plan, { dryRun, log })`.

- [ ] **Step 1: 실패하는 시험**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { makeCalendar } from './calendar.mjs'
import { planOccurrences, planMissed, scheduleKey } from './ledger.mjs'
import { SEED_RULES } from './seed-rules.mjs'

const allWeekdays = (y, m) => {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const workdays = []
  for (let d = 1; d <= last; d++) { const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); if (w && w !== 6) workdays.push(d) }
  return { year: y, month: m, lastDay: last, workdays }
}
const cal = makeCalendar(allWeekdays)
const payroll = { id: 'r1', company: 'tensw', task_key: 'payroll', step: 'request', title: '{period} 급여대장 요청', rule: { kind: 'monthly_day', day: 22, shift: 'prev' }, lead_days: 1, recipe: 'payroll-request', completion: null }

test('새 회차는 planned 로 들어간다', () => {
  const p = planOccurrences([payroll], [], { from: '2026-10-01', to: '2026-10-31', cal })
  assert.equal(p.insert.length, 1)
  assert.equal(p.insert[0].source_key, 'mgmt:tensw:payroll:2026-10:request')
  assert.equal(p.insert[0].title, '2026-10 급여대장 요청')
  assert.equal(p.insert[0].agent_state, 'planned')
})
test('사람이 닫은 행은 다시 열지 않는다', () => {
  const existing = [{ id: 's1', source_key: scheduleKey('tensw', 'payroll', '2026-10', 'request'), schedule_date: '2026-10-21', title: '옛 제목', is_completed: true, agent_state: 'done' }]
  const p = planOccurrences([payroll], existing, { from: '2026-10-01', to: '2026-10-31', cal })
  assert.equal(p.insert.length, 0)
  assert.equal(p.update.length, 1)
  assert.equal('is_completed' in p.update[0].patch, false)
  assert.equal('agent_state' in p.update[0].patch, false)
  assert.equal(p.update[0].patch.schedule_date, '2026-10-22')
})
test('같으면 아무것도 안 한다', () => {
  const existing = [{ id: 's1', source_key: 'mgmt:tensw:payroll:2026-10:request', schedule_date: '2026-10-22', title: '2026-10 급여대장 요청', is_completed: false }]
  const p = planOccurrences([payroll], existing, { from: '2026-10-01', to: '2026-10-31', cal })
  assert.deepEqual(p, { insert: [], update: [] })
})
test('재무 동기화가 만든 세금 행은 받아 쓴다', () => {
  const social = { id: 'r2', company: 'tensw', task_key: 'social-insurance', step: 'pay', title: '4대보험 납부', rule: { kind: 'monthly_day', day: 10, shift: 'next' }, lead_days: 0, recipe: null, completion: { kind: 'tax', types: ['health_insurance'] }, adopt_prefix: 'tensw-finance:tax-obligation:social:' }
  const existing = [{ id: 'f1', source_key: 'tensw-finance:tax-obligation:social:2026-10-12:due', schedule_date: '2026-10-12', title: '[재무] 4대보험 납부', is_completed: false }]
  const p = planOccurrences([social], existing, { from: '2026-10-01', to: '2026-10-31', cal })
  assert.equal(p.insert.length, 0)
})
test('기한 지난 열린 행은 빠짐', () => {
  const rows = [
    { id: 'a', schedule_date: '2026-09-25', is_completed: false, agent_state: 'planned' },
    { id: 'b', schedule_date: '2026-09-25', is_completed: true, agent_state: 'done' },
    { id: 'c', schedule_date: '2026-10-05', is_completed: false, agent_state: 'planned' },
    { id: 'd', schedule_date: '2026-09-01', is_completed: false, agent_state: null },
  ]
  assert.deepEqual(planMissed(rows, '2026-09-30'), [{ id: 'a', patch: { agent_state: 'missed' } }])
})
test('씨앗 규칙은 두 회사를 모두 덮고 키가 겹치지 않는다', () => {
  const companies = new Set(SEED_RULES.map(r => r.company))
  assert.deepEqual([...companies].sort(), ['tensw', 'willow'])
  const keys = SEED_RULES.map(r => `${r.company}:${r.task_key}:${r.step}`)
  assert.equal(new Set(keys).size, keys.length)
})
```

- [ ] **Step 2: 실패 확인** — `node --test scripts/lib/mgmt/ledger.test.mjs` → FAIL.
- [ ] **Step 3: 구현 — 씨앗 규칙**

```js
// seed-rules.mjs — 스킬·SOP·세무 달력에 이미 적힌 정기 업무. 제목의 {period} 는 대상 월(YYYY-MM).
const M10 = { kind: 'monthly_day', day: 10, shift: 'next' }
export const SEED_RULES = [
  // 텐소
  { company: 'tensw', task_key: 'payroll', step: 'request', title: '{period} 급여대장 요청(세무법인형운)', rule: { kind: 'business_days_before', anchor: { kind: 'monthly_day', day: 25, shift: 'prev' }, n: 3 }, lead_days: 2, recipe: 'payroll-request', completion: { kind: 'sent_mail', context: 'tensoftworks', to: 'jjtaxro@daum.net', subject: '급여' } },
  { company: 'tensw', task_key: 'payroll', step: 'payday', title: '{period} 급여 이체·명세서 발송', rule: { kind: 'monthly_day', day: 25, shift: 'prev' }, lead_days: 1, recipe: 'payroll-payday', completion: { kind: 'cash', table: 'tensw_mgmt_cash', category: 'salary' } },
  { company: 'tensw', task_key: 'attendance', step: 'send', title: '{period} 강남구 인턴십 출근부 발송', rule: { kind: 'month_end', shift: 'prev' }, lead_days: 1, recipe: 'attendance-send', completion: { kind: 'sent_mail', context: 'tensoftworks', subject: '출근부' }, adopt_prefix: 'gangnam-attendance:send:' },
  { company: 'tensw', task_key: 'attendance', step: 'collect', title: '{period} 출근부 서명본 회신 받기', rule: { kind: 'monthly_day', day: 5, shift: 'next', period_offset: 1 }, lead_days: 0, recipe: 'subsidy-collect', completion: null },
  { company: 'tensw', task_key: 'subsidy', step: 'submit', title: '{period}분 강남구 인턴십 지원금 신청', rule: { kind: 'monthly_day', day: 15, shift: 'prev', period_offset: 1 }, lead_days: 5, recipe: 'subsidy-submit', completion: { kind: 'sent_mail', context: 'tensoftworks', to: 'gnk@gngucci.or.kr' } },
  { company: 'tensw', task_key: 'withholding', step: 'pay', title: '{period} 원천세·지방소득세 납부', rule: { ...M10, period_offset: 1 }, lead_days: 3, recipe: null, completion: { kind: 'tax', types: ['national_tax', 'local_tax'] } },
  { company: 'tensw', task_key: 'social-insurance', step: 'pay', title: '{period} 4대보험 납부', rule: { ...M10, period_offset: 1 }, lead_days: 3, recipe: null, completion: { kind: 'tax', types: ['health_insurance', 'pension', 'employment_insurance', 'industrial_accident'] }, adopt_prefix: 'tensw-finance:tax-obligation:social:' },
  { company: 'tensw', task_key: 'vat', step: 'pay', title: '부가세 신고·납부', rule: { kind: 'quarterly_day', day: 25, months: [1, 4, 7, 10], shift: 'next' }, lead_days: 10, recipe: null, completion: { kind: 'tax', types: ['vat'] } },
  // 윌로우
  { company: 'willow', task_key: 'etc-invoice', step: 'issue', title: '{period} ETC 월 컨설팅 인보이스', rule: { kind: 'business_days_before', anchor: { kind: 'month_end', shift: 'prev' }, n: 3 }, lead_days: 2, recipe: 'etc-invoice', completion: { kind: 'sent_mail', context: 'default', subject: 'Invoice' } },
  { company: 'willow', task_key: 'etc-referral', step: 'receive', title: '{period} ETC 레퍼럴 피 통보 확인', rule: { kind: 'monthly_day', day: 9, shift: 'next', period_offset: 2 }, lead_days: 0, recipe: null, completion: { kind: 'received_mail', context: 'default', subject: 'Referral Fees' } },
  { company: 'willow', task_key: 'akros-fee', step: 'issue', title: '{period} 아크로스 자문료 계산서·입금 확인', rule: { kind: 'monthly_day', day: 25, shift: 'prev' }, lead_days: 3, recipe: null, completion: { kind: 'cash', table: 'willow_mgmt_cash', counterparty: '아크로스' } },
  { company: 'willow', task_key: 'withholding', step: 'pay', title: '{period} 원천세·지방소득세 납부', rule: { ...M10, period_offset: 1 }, lead_days: 3, recipe: null, completion: { kind: 'tax', types: ['national_tax', 'local_tax'] } },
  { company: 'willow', task_key: 'social-insurance', step: 'pay', title: '{period} 4대보험 납부', rule: { ...M10, period_offset: 1 }, lead_days: 3, recipe: null, completion: { kind: 'tax', types: ['health_insurance', 'pension'] } },
  { company: 'willow', task_key: 'vat', step: 'pay', title: '부가세 신고·납부', rule: { kind: 'quarterly_day', day: 25, months: [1, 4, 7, 10], shift: 'next' }, lead_days: 10, recipe: null, completion: { kind: 'tax', types: ['vat'] } },
  // 연간(양사)
  ...['tensw', 'willow'].flatMap(company => [
    { company, task_key: 'corp-tax', step: 'file', title: '법인세 신고·납부', rule: { kind: 'yearly_date', month: 3, day: 31, shift: 'next' }, lead_days: 20, recipe: null, completion: { kind: 'tax', types: ['corporate_tax'] } },
    { company, task_key: 'corp-local-tax', step: 'file', title: '지방소득세(법인분) 신고·납부', rule: { kind: 'yearly_date', month: 4, day: 30, shift: 'next' }, lead_days: 10, recipe: null, completion: { kind: 'tax', types: ['local_tax'] } },
    { company, task_key: 'year-end-settlement', step: 'file', title: '연말정산·지급명세서 제출', rule: { kind: 'yearly_date', month: 3, day: 10, shift: 'next' }, lead_days: 30, recipe: null, completion: null },
  ]),
]
```

- [ ] **Step 4: 구현 — 원장 계획**

```js
// ledger.mjs — 원장(*_mgmt_schedules) 행 계획. 닫힌 행은 되돌리지 않는다.
import { expandRule } from './rules.mjs'

export const tableFor = company => company === 'willow' ? 'willow_mgmt_schedules' : 'tensw_mgmt_schedules'
export const scheduleKey = (company, task, period, step) => `mgmt:${company}:${task}:${period}:${step}`
const fill = (title, period) => title.replaceAll('{period}', period)

export function planOccurrences(rules, existingRows, { from, to, cal }) {
  const byKey = new Map(existingRows.filter(r => r.source_key).map(r => [r.source_key, r]))
  const insert = [], update = []
  for (const rule of rules) {
    for (const { date, period } of expandRule(rule.rule, from, to, cal)) {
      const key = scheduleKey(rule.company, rule.task_key, period, rule.step)
      const title = fill(rule.title, period)
      const found = byKey.get(key)
      if (found) {
        const patch = {}
        if (found.schedule_date !== date) patch.schedule_date = date
        if (found.title !== title) patch.title = title
        if (Object.keys(patch).length) update.push({ id: found.id, patch })
        continue
      }
      if (rule.adopt_prefix && existingRows.some(r => r.schedule_date === date && r.source_key?.startsWith(rule.adopt_prefix))) continue
      insert.push({
        title, schedule_date: date, type: 'deadline', category: 'other', source_key: key,
        origin: rule.origin ?? 'seed', recipe: rule.recipe ?? null, agent_state: 'planned',
        evidence: [], is_completed: false, rule_id: rule.id ?? null,
      })
    }
  }
  return { insert, update }
}

export function planMissed(rows, todayKey) {
  return rows
    .filter(r => !r.is_completed && ['planned', 'preparing'].includes(r.agent_state) && r.schedule_date < todayKey)
    .map(r => ({ id: r.id, patch: { agent_state: 'missed' } }))
}

export async function applyPlan(sb, table, plan, { dryRun = false, log = () => {} } = {}) {
  for (const row of plan.insert ?? []) {
    log(`추가 ${table} ${row.schedule_date} ${row.title}`)
    if (!dryRun) { const { error } = await sb.from(table).insert(row); if (error && error.code !== '23505') throw error }
  }
  for (const { id, patch } of plan.update ?? []) {
    log(`갱신 ${table} ${id} ${JSON.stringify(patch)}`)
    if (!dryRun) { const { error } = await sb.from(table).update(patch).eq('id', id); if (error) throw error }
  }
}
```

- [ ] **Step 5: 통과 확인** — `node --test scripts/lib/mgmt/ledger.test.mjs scripts/lib/mgmt/rules.test.mjs` PASS.
- [ ] **Step 6: 커밋**

```bash
git add scripts/lib/mgmt/seed-rules.mjs scripts/lib/mgmt/ledger.mjs scripts/lib/mgmt/ledger.test.mjs
git commit -m "feat(mgmt): seed recurring rules for both companies and plan ledger rows"
```

---

### Task 6: 완료 근거 판정

**Files:**
- Create: `scripts/lib/mgmt/closers.mjs`
- Test: `scripts/lib/mgmt/closers.test.mjs`

**Interfaces:**
- Produces: `findEvidence(row, rule, facts) → null | { kind, ref, at, note }`
  - `facts = { taxObligations: [{id, company, obligation_type, due_date, status, paid_at}], sentMail: [{id, context, to, subject, at}], receivedMail: [...같은 모양, from], cash: [{id, table, date, category, counterparty, amount}] }`
  - `tax`: 같은 회사, `types` 에 드는 `obligation_type`, `due_date` 가 행 날짜 ±5일, **해당 고지 전부 paid** 일 때만.
  - `sent_mail`/`received_mail`: 같은 context, `to`(있으면) 포함, `subject`(있으면) 포함, 보낸 시각이 행 날짜 −10일 ~ +5일.
  - `cash`: 같은 table, category 또는 counterparty 일치, 날짜 ±3일.
- Produces: `closePatch(row, ev) → { is_completed: true, agent_state: 'done', evidence: [...row.evidence, ev] }`.

- [ ] **Step 1: 실패하는 시험**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { findEvidence, closePatch } from './closers.mjs'

const row = { id: 's', schedule_date: '2026-10-12', evidence: [] }
const taxRule = { company: 'willow', completion: { kind: 'tax', types: ['health_insurance', 'pension'] } }

test('고지가 전부 납부되어야 닫는다', () => {
  const facts = { taxObligations: [
    { id: 't1', company: 'willow', obligation_type: 'health_insurance', due_date: '2026-10-12', status: 'paid', paid_at: '2026-10-12T01:00:00Z' },
    { id: 't2', company: 'willow', obligation_type: 'pension', due_date: '2026-10-12', status: 'unpaid' },
  ] }
  assert.equal(findEvidence(row, taxRule, facts), null)
  facts.taxObligations[1].status = 'paid'
  assert.equal(findEvidence(row, taxRule, facts).kind, 'tax')
})
test('다른 회사 고지로는 닫지 않는다', () => {
  const facts = { taxObligations: [{ id: 't1', company: 'tensw', obligation_type: 'pension', due_date: '2026-10-12', status: 'paid' }] }
  assert.equal(findEvidence(row, taxRule, facts), null)
})
test('보낸 메일로 닫기(수신자·제목·기간)', () => {
  const r = { id: 'p', schedule_date: '2026-10-20', evidence: [] }
  const rule = { company: 'tensw', completion: { kind: 'sent_mail', context: 'tensoftworks', to: 'jjtaxro@daum.net', subject: '급여' } }
  const facts = { sentMail: [
    { id: 'm0', context: 'tensoftworks', to: 'jjtaxro@daum.net', subject: '9월 급여대장 요청', at: '2026-09-22T01:00:00Z' },
    { id: 'm1', context: 'tensoftworks', to: 'jjtaxro@daum.net', subject: '10월 급여대장 요청', at: '2026-10-19T01:00:00Z' },
  ] }
  assert.equal(findEvidence(r, rule, facts).ref, 'm1')
})
test('닫는 patch 는 근거를 덧붙인다', () => {
  const p = closePatch({ evidence: [{ kind: 'x' }] }, { kind: 'tax', ref: 't1' })
  assert.deepEqual(p, { is_completed: true, agent_state: 'done', evidence: [{ kind: 'x' }, { kind: 'tax', ref: 't1' }] })
})
```

- [ ] **Step 2: 실패 확인** — `node --test scripts/lib/mgmt/closers.test.mjs` → FAIL.
- [ ] **Step 3: 구현**

```js
// closers.mjs — "했다"는 말이 아니라 기록으로만 닫는다.
const days = (a, b) => (new Date(a) - new Date(`${b}T00:00:00Z`)) / 86_400_000

export function findEvidence(row, rule, facts) {
  const c = rule.completion
  if (!c) return null
  if (c.kind === 'tax') {
    const hits = (facts.taxObligations ?? []).filter(t => t.company === rule.company && c.types.includes(t.obligation_type) && Math.abs(days(`${t.due_date}T00:00:00Z`, row.schedule_date)) <= 5)
    if (!hits.length || hits.some(t => t.status !== 'paid')) return null
    return { kind: 'tax', ref: hits.map(t => t.id).join(','), at: hits.map(t => t.paid_at).filter(Boolean).sort().at(-1) ?? null, note: `고지 ${hits.length}건 납부` }
  }
  if (c.kind === 'sent_mail' || c.kind === 'received_mail') {
    const list = c.kind === 'sent_mail' ? facts.sentMail : facts.receivedMail
    const hit = (list ?? []).filter(m => m.context === c.context
      && (!c.to || (m.to ?? '').includes(c.to))
      && (!c.subject || (m.subject ?? '').includes(c.subject))
      && days(m.at, row.schedule_date) >= -10 && days(m.at, row.schedule_date) <= 5)
      .sort((a, b) => b.at.localeCompare(a.at))[0]
    return hit ? { kind: c.kind, ref: hit.id, at: hit.at, note: hit.subject } : null
  }
  if (c.kind === 'cash') {
    const hit = (facts.cash ?? []).find(x => x.table === c.table
      && ((c.category && x.category === c.category) || (c.counterparty && (x.counterparty ?? '').includes(c.counterparty)))
      && Math.abs(days(`${x.date}T00:00:00Z`, row.schedule_date)) <= 3)
    return hit ? { kind: 'cash', ref: hit.id, at: hit.date, note: hit.counterparty ?? hit.category } : null
  }
  return null
}

export const closePatch = (row, ev) => ({ is_completed: true, agent_state: 'done', evidence: [...(row.evidence ?? []), ev] })
```

- [ ] **Step 4: 통과 확인** — PASS.
  실데이터 모양 확인: `select column_name from information_schema.columns where table_name='tensw_mgmt_cash'` 로 날짜·분류·상대 칸 이름을 보고, 실행기(Task 12)의 `loadFacts` 에서 이 모양(`date, category, counterparty`)으로 맞춰 넘긴다.
- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/mgmt/closers.mjs scripts/lib/mgmt/closers.test.mjs
git commit -m "feat(mgmt): close ledger rows only on recorded evidence"
```

---

### Task 7: 원장 1회 정리

**Files:**
- Create: `scripts/mgmt-cleanup-ledger.mjs`

**Interfaces:**
- Consumes: `scheduleKey` (Task 5).
- 동작(모두 `--apply` 가 없으면 계획만 출력):
  1. 윌로우 테이블 `category='tensw-mgmt'` 행 → 텐소 테이블로 복사 후 윌로우 행 삭제(복사 성공 확인 뒤). 이동 목록을 `logs/mgmt-cleanup-<날짜>.json` 에 남긴다.
  2. 윌로우 테이블에서 개인 일정 → `category='personal'`. 판정: 제목에 `류하|가족|여행|진료|병원|생일|테슬라|수리|학원|개인` 이 있거나 `category` 가 비어 있고 source_key 가 없는 행 중 위 단어가 든 것. 목록을 출력해 **사람이 보고 `--apply`**.
  3. 2월 설 연휴 열린 행(양사) → `is_completed=true, agent_state='done', evidence=[{kind:'cleanup',note:'지난 공휴일 표시'}]`.
  4. 9/18 선등록 행을 규칙 키로 입양: 제목 정규식 → 키.
     - `/(\d+)월분 강남구 인턴십 지원금 신청/` → `mgmt:tensw:subsidy:2026-MM:submit`
     - `/(\d+)월 급여대장 요청/` → `mgmt:tensw:payroll:2026-MM:request`
     - `/(\d+)월 급여이체 및 급여명세서/` → `mgmt:tensw:payroll:2026-MM:payday`
     설정 칸: `source_key`, `origin='seed'`, `agent_state='planned'`, `recipe`.
- 윌로우 현금 7/27 텐소 상환 행 정리는 이 스크립트에서 하지 않는다. 금액 부호 변경은 결정함 첫 항목(`kind='classify'`)으로 올린다(Task 11 이후 실행기가 만든다). 여기서는 대상 행 id 만 출력한다.

- [ ] **Step 1: 스크립트 작성**

```js
#!/usr/bin/env node
// 경영관리 에이전트를 켜기 전에 원장을 한 번 정리한다. --apply 가 없으면 계획만 보여준다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { scheduleKey } from './lib/mgmt/ledger.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const apply = process.argv.includes('--apply')
const log = [], say = m => { console.log(m); log.push(m) }
const PERSONAL = /류하|가족|여행|진료|병원|생일|테슬라|틴팅|수리|학원|개인/
const ADOPT = [
  [/(\d+)월분 강남구 인턴십 지원금 신청/, (mm) => ['subsidy', 'submit', 'subsidy-submit']],
  [/(\d+)월 급여대장 요청/, () => ['payroll', 'request', 'payroll-request']],
  [/(\d+)월 급여이체 및 급여명세서/, () => ['payroll', 'payday', 'payroll-payday']],
]

const { data: willow } = await sb.from('willow_mgmt_schedules').select('*')
const { data: tensw } = await sb.from('tensw_mgmt_schedules').select('*')

// 1. 윌로우 테이블의 텐소 행 이동
for (const r of willow.filter(r => r.category === 'tensw-mgmt')) {
  say(`이동 → 텐소: ${r.schedule_date} ${r.title}`)
  if (apply) {
    const { id, ...rest } = r
    const { error } = await sb.from('tensw_mgmt_schedules').insert({ ...rest, category: 'other' })
    if (error) throw error
    const { error: e2 } = await sb.from('willow_mgmt_schedules').delete().eq('id', id)
    if (e2) throw e2
  }
}
// 2. 개인 일정
for (const r of willow.filter(r => r.category !== 'personal' && r.category !== 'tensw-mgmt' && !r.source_key && PERSONAL.test(r.title ?? ''))) {
  say(`개인으로: ${r.schedule_date} ${r.title}`)
  if (apply) await sb.from('willow_mgmt_schedules').update({ category: 'personal' }).eq('id', r.id)
}
// 3. 지난 공휴일 표시
for (const [table, rows] of [['tensw_mgmt_schedules', tensw], ['willow_mgmt_schedules', willow]]) {
  for (const r of rows.filter(r => !r.is_completed && /설 연휴|추석 연휴/.test(r.title ?? '') && r.schedule_date < '2026-09-30')) {
    say(`닫기(${table}): ${r.schedule_date} ${r.title}`)
    if (apply) await sb.from(table).update({ is_completed: true, agent_state: 'done', evidence: [{ kind: 'cleanup', note: '지난 공휴일 표시' }] }).eq('id', r.id)
  }
}
// 4. 선등록 행 입양
for (const r of tensw.filter(r => !r.source_key && !r.is_completed)) {
  for (const [re, pick] of ADOPT) {
    const m = (r.title ?? '').match(re)
    if (!m) continue
    const [task, step, recipe] = pick(m[1])
    const period = `2026-${String(m[1]).padStart(2, '0')}`
    const key = scheduleKey('tensw', task, period, step)
    say(`입양: ${r.title} → ${key}`)
    if (apply) await sb.from('tensw_mgmt_schedules').update({ source_key: key, origin: 'seed', agent_state: 'planned', recipe }).eq('id', r.id)
  }
}
// 5. 7/27 상환 행은 결정함으로(여기서는 id 만)
const { data: cash } = await sb.from('willow_mgmt_cash').select('id, transaction_date, amount, type, description').gte('transaction_date', '2026-07-26').lte('transaction_date', '2026-07-28')
for (const c of cash ?? []) say(`확인 대상 현금 행: ${c.id} ${c.transaction_date} ${c.type} ${c.amount} ${c.description ?? ''}`)

fs.mkdirSync(path.join(ROOT, 'logs'), { recursive: true })
fs.writeFileSync(path.join(ROOT, `logs/mgmt-cleanup-${new Date().toISOString().slice(0, 10)}${apply ? '' : '-plan'}.json`), JSON.stringify(log, null, 2))
console.log(apply ? '반영 완료' : '계획만 봤어요. --apply 로 반영')
```

- [ ] **Step 2: 계획 실행** — `node scripts/mgmt-cleanup-ledger.mjs`. `willow_mgmt_cash` 칸 이름이 다르면(`date` 등) 5번 쿼리만 실제 칸 이름으로 고친다. 출력의 "개인으로" 목록을 사람이 훑어 업무 일정이 섞였으면 `PERSONAL` 정규식을 좁힌다.
  **"지원금 신청" 입양 period 확인**: 제목의 "9월분"은 대상 월이므로 period `2026-09` 가 맞다(규칙의 `period_offset:1` 과 일치).
- [ ] **Step 3: 반영** — `node scripts/mgmt-cleanup-ledger.mjs --apply`. 다시 계획 실행 → 1~4번 출력이 0줄이어야 한다.
- [ ] **Step 4: 커밋**

```bash
git add scripts/mgmt-cleanup-ledger.mjs
git commit -m "chore(mgmt): one-off ledger cleanup before the agent starts"
```

---

### Task 8: 메일·스페이스 읽기와 커서

**Files:**
- Create: `scripts/lib/mgmt/sources.mjs`
- Test: `scripts/lib/mgmt/sources.test.mjs`

**Interfaces:**
- Produces: `normalizeGmail(msg, context) → { source:'mail', company, ref, thread, from, to, subject, text, at, direction:'in'|'out' }` — `company = context==='default' ? 'willow' : 'tensw'`, `direction='out'` 이면 `labelIds` 에 `SENT`.
- Produces: `normalizeChat(msg, space) → { source:'chat', company:'tensw', ref: msg.name, thread: msg.thread?.name, space: space.displayName, from: msg.sender?.displayName ?? msg.sender?.name, text, at: msg.createTime, direction: 'in' }`
- Produces: `SKIP_SPACES = /^(VS Code|Todo - )/`, `isRecordedSpace(space, lastMessageAt, now)` — 봇 방 제외, 마지막 메시지가 60일 넘으면 제외.
- Produces: `newerThan(items, cursor) → items` — `at > cursor.last_seen_at`, 같은 시각이면 `ref !== cursor.last_ref` 인 것만.
- Produces (I/O): `readMail(sb, context, cursor, { limit }) → Item[]`, `readChat(sb, cursor, { perSpace }) → Map<spaceName, Item[]>`, `saveCursor(sb, source, items)`.
  - Gmail: `gmail_tokens` 최신 행으로 OAuth2(텐소 `GOOGLE_CLIENT_ID_TENSW`/`_SECRET_TENSW`, 윌로우 `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, redirect `GOOGLE_REDIRECT_URI`). `q: after:<epoch초> -in:chats`, 본문은 `format:'full'` 의 text/plain 첫 부분 4,000자.
  - Chat: `spaces.list` → 각 space `messages.list({ parent, pageSize: 100, orderBy: 'createTime desc' })` 를 커서 시각보다 오래된 메시지가 나올 때까지 페이지 이동.
  - 커서가 없으면 지금부터 24시간 전을 시작점으로 둔다(첫 실행이 4개월치를 한꺼번에 해석하지 않게. 과거분은 Task 13 재현이 맡는다).

- [ ] **Step 1: 실패하는 시험**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeGmail, normalizeChat, isRecordedSpace, newerThan } from './sources.mjs'

const b64 = s => Buffer.from(s).toString('base64url')
test('윌로우 메일은 willow, 보낸 메일은 out', () => {
  const m = { id: 'g1', threadId: 't1', internalDate: String(Date.parse('2026-10-01T00:00:00Z')), labelIds: ['SENT'],
    payload: { headers: [{ name: 'From', value: 'dw.kim@willowinvt.com' }, { name: 'To', value: 'kyle@etc.com' }, { name: 'Subject', value: 'Invoice #26-ETC-20' }],
      mimeType: 'text/plain', body: { data: b64('Please find attached') } } }
  const x = normalizeGmail(m, 'default')
  assert.equal(x.company, 'willow'); assert.equal(x.direction, 'out'); assert.equal(x.text, 'Please find attached'); assert.equal(x.ref, 'g1')
})
test('챗 메시지 모양', () => {
  const x = normalizeChat({ name: 'spaces/A/messages/B', createTime: '2026-10-01T01:00:00Z', text: '세금계산서 발행 부탁드립니다', sender: { displayName: '김의향' }, thread: { name: 'spaces/A/threads/T' } }, { name: 'spaces/A', displayName: 'Tensw 운영자방' })
  assert.deepEqual([x.company, x.ref, x.space, x.from], ['tensw', 'spaces/A/messages/B', 'Tensw 운영자방', '김의향'])
})
test('봇 방·휴면 방 제외', () => {
  const now = new Date('2026-10-01T00:00:00Z')
  assert.equal(isRecordedSpace({ displayName: 'VS Code' }, '2026-09-30T00:00:00Z', now), false)
  assert.equal(isRecordedSpace({ displayName: 'Todo - 장비고' }, '2026-09-30T00:00:00Z', now), false)
  assert.equal(isRecordedSpace({ displayName: 'Tensw 업무보고' }, '2026-06-01T00:00:00Z', now), false)
  assert.equal(isRecordedSpace({ displayName: 'Tensw 업무보고' }, '2026-09-29T00:00:00Z', now), true)
})
test('커서 이후만, 같은 시각 같은 ref 는 제외', () => {
  const items = [{ ref: 'a', at: '2026-10-01T00:00:00Z' }, { ref: 'b', at: '2026-10-01T00:00:00Z' }, { ref: 'c', at: '2026-09-30T00:00:00Z' }]
  assert.deepEqual(newerThan(items, { last_seen_at: '2026-10-01T00:00:00Z', last_ref: 'a' }).map(x => x.ref), ['b'])
})
```

- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현(순수 부분)**

```js
// sources.mjs — 텐소·윌로우 메일과 텐소 스페이스를 커서 이후만 읽는다.
import { google } from 'googleapis'

export const SKIP_SPACES = /^(VS Code|Todo - )/
const header = (m, n) => m.payload?.headers?.find(h => h.name.toLowerCase() === n.toLowerCase())?.value ?? ''
function plainText(part) {
  if (!part) return ''
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8')
  for (const p of part.parts ?? []) { const t = plainText(p); if (t) return t }
  return ''
}

export function normalizeGmail(m, context) {
  return {
    source: 'mail', company: context === 'default' ? 'willow' : 'tensw', context,
    ref: m.id, thread: m.threadId, from: header(m, 'From'), to: header(m, 'To'), subject: header(m, 'Subject'),
    text: plainText(m.payload).slice(0, 4000), at: new Date(Number(m.internalDate)).toISOString(),
    direction: (m.labelIds ?? []).includes('SENT') ? 'out' : 'in',
  }
}

export function normalizeChat(m, space) {
  return {
    source: 'chat', company: 'tensw', ref: m.name, thread: m.thread?.name ?? null, space: space.displayName ?? '(DM)',
    from: m.sender?.displayName ?? m.sender?.name ?? '', text: (m.text ?? m.formattedText ?? '').slice(0, 4000),
    attachments: (m.attachment ?? []).map(a => a.contentName).filter(Boolean), at: m.createTime, direction: 'in',
  }
}

export function isRecordedSpace(space, lastMessageAt, now = new Date()) {
  if (SKIP_SPACES.test(space.displayName ?? '')) return false
  if (!lastMessageAt) return false
  return (now - new Date(lastMessageAt)) / 86_400_000 <= 60
}

export function newerThan(items, cursor) {
  if (!cursor) return items
  return items.filter(x => x.at > cursor.last_seen_at || (x.at === cursor.last_seen_at && x.ref !== cursor.last_ref))
}
```

- [ ] **Step 4: 구현(I/O 부분)** — 같은 파일에 덧붙인다.

```js
async function oauthFor(sb, context) {
  const { data } = await sb.from('gmail_tokens').select('*').eq('context', context).order('updated_at', { ascending: false }).limit(1)
  const t = data?.[0]
  if (!t) throw new Error(`${context} 토큰 없음`)
  const id = context === 'tensoftworks' ? process.env.GOOGLE_CLIENT_ID_TENSW : process.env.GOOGLE_CLIENT_ID
  const secret = context === 'tensoftworks' ? process.env.GOOGLE_CLIENT_SECRET_TENSW : process.env.GOOGLE_CLIENT_SECRET
  const o = new google.auth.OAuth2(id, secret, process.env.GOOGLE_REDIRECT_URI)
  o.setCredentials({ access_token: t.access_token, refresh_token: t.refresh_token, expiry_date: t.token_expiry ? new Date(t.token_expiry).getTime() : undefined })
  return o
}

const defaultSince = () => new Date(Date.now() - 86_400_000).toISOString()

export async function getCursor(sb, source) {
  const { data } = await sb.from('mgmt_cursors').select('*').eq('source', source).maybeSingle()
  return data ?? { source, last_seen_at: defaultSince(), last_ref: null }
}

export async function saveCursor(sb, source, items, { dryRun = false } = {}) {
  if (!items.length || dryRun) return
  const last = [...items].sort((a, b) => a.at.localeCompare(b.at)).at(-1)
  const { error } = await sb.from('mgmt_cursors').upsert({ source, last_seen_at: last.at, last_ref: last.ref, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function readMail(sb, context, cursor, { limit = 100 } = {}) {
  const gmail = google.gmail({ version: 'v1', auth: await oauthFor(sb, context) })
  const after = Math.floor(new Date(cursor.last_seen_at).getTime() / 1000)
  const list = await gmail.users.messages.list({ userId: 'me', q: `after:${after} -in:chats`, maxResults: limit })
  const out = []
  for (const { id } of list.data.messages ?? []) {
    const { data } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
    out.push(normalizeGmail(data, context))
  }
  return newerThan(out, cursor).sort((a, b) => a.at.localeCompare(b.at))
}

export async function readChat(sb, cursorFor, { now = new Date(), maxPages = 10 } = {}) {
  const chat = google.chat({ version: 'v1', auth: await oauthFor(sb, 'tensoftworks') })
  const spaces = []
  let pageToken
  do { const r = await chat.spaces.list({ pageSize: 100, pageToken }); spaces.push(...(r.data.spaces ?? [])); pageToken = r.data.nextPageToken } while (pageToken)
  const result = new Map()
  for (const space of spaces) {
    const cursor = await cursorFor(`chat:${space.name}`)
    const items = []
    let token, pages = 0, done = false
    while (!done && pages++ < maxPages) {
      const r = await chat.spaces.messages.list({ parent: space.name, pageSize: 100, orderBy: 'createTime desc', pageToken: token })
      for (const m of r.data.messages ?? []) {
        if (m.createTime < cursor.last_seen_at) { done = true; break }
        items.push(normalizeChat(m, space))
      }
      token = r.data.nextPageToken
      if (!token) done = true
    }
    const latest = items[0]?.at ?? null
    if (!isRecordedSpace(space, latest ?? cursor.last_seen_at, now)) continue
    const fresh = newerThan(items, cursor).sort((a, b) => a.at.localeCompare(b.at))
    if (fresh.length) result.set(space.name, fresh)
  }
  return result
}
```

- [ ] **Step 5: 통과 확인** — `node --test scripts/lib/mgmt/sources.test.mjs` PASS. 실연결 한 번(읽기만):
  `node -e "import('dotenv').then(d=>d.default.config({path:'.env.local',quiet:true})).then(()=>Promise.all([import('@supabase/supabase-js'),import('./scripts/lib/mgmt/sources.mjs')])).then(async([{createClient},s])=>{const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY);const c={last_seen_at:new Date(Date.now()-864e5).toISOString()};console.log((await s.readMail(sb,'default',c)).length,(await s.readMail(sb,'tensoftworks',c)).length,[...(await s.readChat(sb,async()=>c)).keys()].length)})"`
  → 세 숫자가 나온다(0이어도 오류만 없으면 된다).
- [ ] **Step 6: 커밋**

```bash
git add scripts/lib/mgmt/sources.mjs scripts/lib/mgmt/sources.test.mjs
git commit -m "feat(mgmt): read both mailboxes and Tensw spaces past a cursor"
```

---

### Task 9: 해석(Codex)과 반영

**Files:**
- Create: `scripts/lib/mgmt/judge.mjs`, `scripts/lib/mgmt/judge-schema.json`, `scripts/lib/mgmt/apply-judgement.mjs`
- Test: `scripts/lib/mgmt/apply-judgement.test.mjs`

**Interfaces:**
- Consumes: `redact` (Task 3), Item (Task 8), `tableFor`, `closePatch` (Task 5·6).
- Produces: `buildPrompt({ company, items, openCases, openSchedules }) → string` — items 는 `redact` 를 거친 text 만 담는다.
- Produces: `judge(prompt, { runner }) → Judgement` — 기본 runner 는 `codex exec --ephemeral --skip-git-repo-check --output-schema judge-schema.json -o <tmp> -`(프롬프트는 stdin).
- Judgement:
  ```
  { cases:   [{ name, counterparty, stage, summary }],
    entries: [{ kind:'decision'|'todo'|'material'|'daily'|'security', case, body, actor, assignee, due_date, source_ref }],
    schedules: [{ op:'create'|'update'|'complete', title, date, source_ref, match_key, reason }],
    decisions: [{ kind, subject_key, question, options:[{id,label}], recommended, source_ref }] }
  ```
- Produces: `planJudgement(company, judgement, { items, openSchedules }) → { cases, entries, scheduleInserts, scheduleUpdates, decisions }` (순수).
  - 회사는 **입력 경로(company 인자)** 로 고정한다. Judgement 안에 회사 필드는 없다.
  - `source_ref` 가 이번 items 에 없는 항목은 버린다(모델이 지어낸 참조 차단).
  - `create` → `source_key = mgmt-chat:<ref>` 또는 `mgmt-mail:<company>:<ref>`, `origin` = 'chat'|'email', `agent_state='planned'`.
  - `update`/`complete` 는 `match_key` 가 openSchedules 의 source_key 와 같을 때만. `complete` 는 `closePatch(row, {kind:'message', ref:source_ref, note:reason})`.
  - `body`·`question`·`summary` 는 한 번 더 `redact`.
- Produces: `applyJudgement(sb, plan, { dryRun, log })` — `mgmt_cases` upsert(company,name), `mgmt_entries` insert(유니크 충돌 무시), 일정 insert/update, `mgmt_decisions` insert(열린 같은 subject_key 가 있으면 건너뜀).

- [ ] **Step 1: 스키마 파일**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["cases", "entries", "schedules", "decisions"],
  "properties": {
    "cases": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["name", "counterparty", "stage", "summary"],
      "properties": { "name": { "type": "string" }, "counterparty": { "type": ["string", "null"] }, "stage": { "type": ["string", "null"] }, "summary": { "type": "string" } } } },
    "entries": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["kind", "case", "body", "actor", "assignee", "due_date", "source_ref"],
      "properties": { "kind": { "enum": ["decision", "todo", "material", "daily", "security"] }, "case": { "type": ["string", "null"] }, "body": { "type": "string" },
        "actor": { "type": ["string", "null"] }, "assignee": { "type": ["string", "null"] }, "due_date": { "type": ["string", "null"] }, "source_ref": { "type": "string" } } } },
    "schedules": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["op", "title", "date", "source_ref", "match_key", "reason"],
      "properties": { "op": { "enum": ["create", "update", "complete"] }, "title": { "type": "string" }, "date": { "type": ["string", "null"] },
        "source_ref": { "type": "string" }, "match_key": { "type": ["string", "null"] }, "reason": { "type": "string" } } } },
    "decisions": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["kind", "subject_key", "question", "options", "recommended", "source_ref"],
      "properties": { "kind": { "enum": ["send_approval", "money", "scope", "attendee", "classify", "security"] }, "subject_key": { "type": "string" }, "question": { "type": "string" },
        "options": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["id", "label"], "properties": { "id": { "type": "string" }, "label": { "type": "string" } } } },
        "recommended": { "type": ["string", "null"] }, "source_ref": { "type": "string" } } } }
  }
}
```

- [ ] **Step 2: 실패하는 시험**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { planJudgement } from './apply-judgement.mjs'
import { buildPrompt } from './judge.mjs'

const items = [
  { source: 'chat', company: 'tensw', ref: 'spaces/A/messages/1', text: '@김동욱 이사님 NIA 9월 월간보고 10/2까지 부탁드립니다', at: '2026-09-30T01:00:00Z' },
  { source: 'chat', company: 'tensw', ref: 'spaces/A/messages/2', text: '송금했습니다', at: '2026-09-30T02:00:00Z' },
]
const open = [{ id: 's9', source_key: 'mgmt-chat:spaces/A/messages/0', title: '부스 참가비 입금', schedule_date: '2026-09-30', evidence: [] }]
const j = {
  cases: [{ name: 'NIA 독립운동 데이터 구축', counterparty: 'NIA', stage: '수행', summary: '월간보고 준비' }],
  entries: [{ kind: 'todo', case: 'NIA 독립운동 데이터 구축', body: '9월 월간보고 제출', actor: '김의향', assignee: '김동욱', due_date: '2026-10-02', source_ref: 'spaces/A/messages/1' },
            { kind: 'todo', case: null, body: '지어낸 항목', actor: null, assignee: null, due_date: null, source_ref: 'spaces/Z/messages/404' }],
  schedules: [{ op: 'create', title: 'NIA 9월 월간보고', date: '2026-10-02', source_ref: 'spaces/A/messages/1', match_key: null, reason: '기한 있는 요청' },
              { op: 'complete', title: '부스 참가비 입금', date: null, source_ref: 'spaces/A/messages/2', match_key: 'mgmt-chat:spaces/A/messages/0', reason: '송금했습니다' },
              { op: 'complete', title: '없는 일정', date: null, source_ref: 'spaces/A/messages/2', match_key: 'mgmt:tensw:nope', reason: 'x' }],
  decisions: [],
}

test('입력 경로의 회사로 고정되고 지어낸 참조는 버린다', () => {
  const p = planJudgement('tensw', j, { items, openSchedules: open })
  assert.equal(p.entries.length, 1)
  assert.ok(p.entries.every(e => e.company === 'tensw'))
  assert.equal(p.cases[0].company, 'tensw')
})
test('기한 있는 요청은 일정으로, 완료 신호는 열린 일정을 닫는다', () => {
  const p = planJudgement('tensw', j, { items, openSchedules: open })
  assert.equal(p.scheduleInserts.length, 1)
  assert.equal(p.scheduleInserts[0].source_key, 'mgmt-chat:spaces/A/messages/1')
  assert.equal(p.scheduleInserts[0].origin, 'chat')
  assert.equal(p.scheduleUpdates.length, 1)
  assert.equal(p.scheduleUpdates[0].id, 's9')
  assert.equal(p.scheduleUpdates[0].patch.is_completed, true)
  assert.equal(p.scheduleUpdates[0].patch.evidence.at(-1).ref, 'spaces/A/messages/2')
})
test('윌로우 메일에서 온 것은 윌로우로', () => {
  const wItems = [{ source: 'mail', company: 'willow', ref: 'g1', text: 'Referral fees for 08/26', at: '2026-10-07T00:00:00Z' }]
  const p = planJudgement('willow', { cases: [], entries: [{ kind: 'todo', case: null, body: '레퍼럴 피 검산', actor: 'ETC', assignee: null, due_date: null, source_ref: 'g1' }],
    schedules: [{ op: 'create', title: '레퍼럴 피 검산', date: '2026-10-08', source_ref: 'g1', match_key: null, reason: '' }], decisions: [] }, { items: wItems, openSchedules: [] })
  assert.equal(p.entries[0].company, 'willow')
  assert.equal(p.scheduleInserts[0].source_key, 'mgmt-mail:willow:g1')
  assert.equal(p.scheduleInserts[0].table, 'willow_mgmt_schedules')
})
test('프롬프트에 비밀값이 들어가지 않는다', () => {
  const prompt = buildPrompt({ company: 'tensw', items: [{ ref: 'r', at: '2026-10-01T00:00:00Z', from: 'x', text: '관리자 PW: Abc!2345xy' }], openCases: [], openSchedules: [] })
  assert.doesNotMatch(prompt, /Abc!2345xy/)
})
test('저장할 본문도 가린다', () => {
  const p = planJudgement('tensw', { cases: [], entries: [{ kind: 'security', case: null, body: '비밀번호 Abc!2345xy 공유됨', actor: null, assignee: null, due_date: null, source_ref: 'spaces/A/messages/1' }], schedules: [], decisions: [] }, { items, openSchedules: [] })
  assert.doesNotMatch(p.entries[0].body, /Abc!2345xy/)
})
```

- [ ] **Step 3: 실패 확인** — `node --test scripts/lib/mgmt/apply-judgement.test.mjs` → FAIL.
- [ ] **Step 4: 구현 — judge.mjs**

```js
// judge.mjs — 새 메시지 묶음을 건·결정·할일·자료·일지·일정 변경으로 해석한다(Codex 한 번).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { redact } from './redact.mjs'

const SCHEMA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'judge-schema.json')

export function buildPrompt({ company, items, openCases, openSchedules }) {
  const name = company === 'willow' ? '윌로우인베스트먼트' : '텐소프트웍스'
  const lines = items.map(x => `- ref=${x.ref} | ${x.at} | ${x.space ?? x.subject ?? ''} | ${x.from ?? ''}${x.direction === 'out' ? ' (우리가 보냄)' : ''}: ${redact(x.text).text.replace(/\n+/g, ' / ')}`)
  return [
    `너는 ${name} 경영관리 기록 담당이다. 아래 새 메시지를 읽고 JSON 스키마대로만 답한다.`,
    '규칙:',
    '- 모든 항목의 source_ref 는 아래 메시지의 ref 중 하나여야 한다. 없는 ref 를 만들지 않는다.',
    '- 건(cases)은 사람들이 "그 건"이라 부르는 사안. 아래 열린 건과 같은 사안이면 같은 name 을 쓴다.',
    '- 할 일(todo)은 요청 말투(부탁드립니다·해주세요·올리세요)에서 만든다. 기한이 있으면 due_date(YYYY-MM-DD).',
    '- 기한·날짜가 있는 할 일, 미팅, 입금·제출 마감은 schedules op=create 로도 낸다.',
    '- 처리했습니다·송금했습니다·발급했습니다·반영되었습니다·제출했습니다 같은 완료 말이 열린 일정과 짝이면 op=complete, match_key 는 그 일정의 key.',
    '- 날짜가 바뀌었다는 말이면 op=update.',
    '- 비밀번호·키·계좌가 평문으로 보이면 kind=security 항목으로 "무엇이 누구에게 공유됐는지"만 적고 값은 적지 않는다.',
    '- 결정(decisions)은 대표 판단이 필요한 것만: 예산 밖 지출, 가격·계약 조건, 대외 제출 범위, 참석자, 처음 보는 거래 성격.',
    '- 개발 세부·잡담은 kind=daily 한 줄로 끝낸다(스페이스별 하루 한 단락).',
    '',
    `열린 건: ${JSON.stringify(openCases.map(c => c.name))}`,
    `열린 일정: ${JSON.stringify(openSchedules.map(s => ({ key: s.source_key, title: s.title, date: s.schedule_date })))}`,
    '',
    '새 메시지:',
    ...lines,
  ].join('\n')
}

export function codexRunner(prompt) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mgmt-judge-')), 'out.json')
  execFileSync('codex', ['exec', '--ephemeral', '--skip-git-repo-check', '--output-schema', SCHEMA, '-o', out, '-'],
    { input: prompt, encoding: 'utf8', timeout: 600_000, stdio: ['pipe', 'ignore', 'pipe'] })
  return JSON.parse(fs.readFileSync(out, 'utf8'))
}

export async function judge(prompt, { runner = codexRunner } = {}) {
  return runner(prompt)
}
```

- [ ] **Step 5: 구현 — apply-judgement.mjs**

```js
// apply-judgement.mjs — 해석 결과를 원장·기록부·결정함에 반영한다. 회사는 입력 경로로 고정.
import { redact } from './redact.mjs'
import { tableFor } from './ledger.mjs'
import { closePatch } from './closers.mjs'

const clean = s => redact(s ?? '').text
const keyFor = (company, item) => item.source === 'chat' ? `mgmt-chat:${item.ref}` : `mgmt-mail:${company}:${item.ref}`

export function planJudgement(company, j, { items, openSchedules }) {
  const byRef = new Map(items.map(x => [x.ref, x]))
  const known = x => byRef.has(x.source_ref)
  const table = tableFor(company)
  const cases = j.cases.map(c => ({ company, name: c.name, counterparty: c.counterparty, stage: c.stage, summary: clean(c.summary), status: 'open' }))
  const entries = j.entries.filter(known).map(e => {
    const item = byRef.get(e.source_ref)
    return { company, case_name: e.case, kind: e.kind, body: clean(e.body), actor: e.actor, assignee: e.assignee, due_date: e.due_date,
      source: item.source, source_ref: item.ref, occurred_at: item.at }
  })
  const scheduleInserts = [], scheduleUpdates = []
  for (const s of j.schedules.filter(known)) {
    const item = byRef.get(s.source_ref)
    if (s.op === 'create' && s.date) {
      scheduleInserts.push({ table, title: clean(s.title), schedule_date: s.date, type: 'deadline', category: 'other', source_key: keyFor(company, item),
        origin: item.source === 'chat' ? 'chat' : 'email', recipe: null, agent_state: 'planned', is_completed: false,
        evidence: [{ kind: 'message', ref: item.ref, note: clean(s.reason) }] })
      continue
    }
    const row = openSchedules.find(r => r.source_key && r.source_key === s.match_key)
    if (!row) continue
    if (s.op === 'complete') scheduleUpdates.push({ table, id: row.id, patch: closePatch(row, { kind: 'message', ref: item.ref, at: item.at, note: clean(s.reason) }) })
    if (s.op === 'update' && s.date && s.date !== row.schedule_date) scheduleUpdates.push({ table, id: row.id, patch: { schedule_date: s.date, evidence: [...(row.evidence ?? []), { kind: 'message', ref: item.ref, note: clean(s.reason) }] } })
  }
  const decisions = j.decisions.filter(known).map(d => ({ company, kind: d.kind, subject_key: `${company}:${d.subject_key}`, question: clean(d.question),
    options: d.options, recommended: d.recommended, refs: [d.source_ref], status: 'open' }))
  return { cases, entries, scheduleInserts, scheduleUpdates, decisions }
}

export async function applyJudgement(sb, plan, { dryRun = false, log = () => {} } = {}) {
  const caseIds = new Map()
  for (const c of plan.cases) {
    log(`건 ${c.company} ${c.name}`)
    if (dryRun) continue
    const { data, error } = await sb.from('mgmt_cases').upsert({ ...c, updated_at: new Date().toISOString() }, { onConflict: 'company,name' }).select('id,name').single()
    if (error) throw error
    caseIds.set(c.name, data.id)
  }
  for (const e of plan.entries) {
    log(`기록 ${e.kind} ${e.body.slice(0, 60)}`)
    if (dryRun) continue
    const { case_name, ...row } = e
    const { error } = await sb.from('mgmt_entries').insert({ ...row, case_id: case_name ? caseIds.get(case_name) ?? null : null })
    if (error && error.code !== '23505') throw error
  }
  for (const { table, ...row } of plan.scheduleInserts) {
    log(`일정 추가 ${row.schedule_date} ${row.title}`)
    if (dryRun) continue
    const { error } = await sb.from(table).insert(row)
    if (error && error.code !== '23505') throw error
  }
  for (const { table, id, patch } of plan.scheduleUpdates) {
    log(`일정 ${patch.is_completed ? '완료' : '변경'} ${id}`)
    if (!dryRun) { const { error } = await sb.from(table).update(patch).eq('id', id); if (error) throw error }
  }
  for (const d of plan.decisions) {
    log(`결정함 ${d.kind} ${d.question.slice(0, 60)}`)
    if (dryRun) continue
    const { error } = await sb.from('mgmt_decisions').insert(d)
    if (error && error.code !== '23505') throw error
  }
}
```

- [ ] **Step 6: 통과 확인** — `node --test scripts/lib/mgmt/apply-judgement.test.mjs` PASS.
  Codex 실호출 한 번: 위 시험의 `items` 로 `node -e "import('./scripts/lib/mgmt/judge.mjs').then(async j=>console.log(JSON.stringify(await j.judge(j.buildPrompt({company:'tensw',items:[{ref:'spaces/A/messages/1',at:'2026-09-30T01:00:00Z',from:'김의향',text:'@김동욱 이사님 NIA 9월 월간보고 10/2까지 부탁드립니다'}],openCases:[],openSchedules:[]})),null,1)))"`
  → 스키마에 맞는 JSON, schedules 에 `2026-10-02` create 가 있어야 한다. `--output-schema` 가 거부되면(모델이 strict 스키마 미지원) 스키마의 `"type": ["string","null"]` 을 `anyOf` 로 바꾼다.
- [ ] **Step 7: 커밋**

```bash
git add scripts/lib/mgmt/judge.mjs scripts/lib/mgmt/judge-schema.json scripts/lib/mgmt/apply-judgement.mjs scripts/lib/mgmt/apply-judgement.test.mjs
git commit -m "feat(mgmt): interpret new messages into cases, entries and schedule changes"
```

---

### Task 10: 반복 규칙 추론

**Files:**
- Create: `scripts/lib/mgmt/infer.mjs`
- Test: `scripts/lib/mgmt/infer.test.mjs`

**Interfaces:**
- Produces: `inferRules(events, { existingRules, minMonths = 2, spread = 4 }) → Array<Rule & { origin:'inferred', confidence, evidence }>`
  - events = `[{ company, kind:'sent_mail'|'received_mail'|'cash'|'done_schedule', key, label, date: 'YYYY-MM-DD', ref }]`
    - `key` 는 같은 일을 묶는 정규화 문자열: 메일은 `${kind}:${상대 주소}:${제목에서 숫자·날짜·월 이름을 뺀 것}`, 현금은 `cash:${table}:${상대}:${방향}`, 완료 일정은 `done:${제목에서 숫자 뺀 것}`.
  - 같은 key 가 **서로 다른 달 minMonths 번 이상**, 그 날(day-of-month) 의 최댓값−최솟값 ≤ spread 이면 규칙 후보.
  - 규칙은 `{ kind:'monthly_day', day: 중앙값, shift:'next' }`, `lead_days: 1`, `step:'do'`, `task_key: 'inferred-' + 짧은 해시(key)`, `title: label`.
  - completion: 메일 → `{ kind: event.kind, context, to|subject }`, 현금 → `{ kind:'cash', table, counterparty }`, 완료 일정 → null.
  - `confidence = min(1, months/4) * (1 - spread_actual/10)`.
  - `existingRules` 와 task_key 가 같거나, 씨앗 규칙의 completion 과 같은 상대·제목이면 제외.
- Produces: `normalizeSubject(s)` — `Re:/Fwd:` 제거, 숫자·`월`·`분`·영문 월 이름 제거, 공백 정리.

- [ ] **Step 1: 실패하는 시험**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { inferRules, normalizeSubject } from './infer.mjs'

test('제목 정규화', () => {
  assert.equal(normalizeSubject('Re: [GS네오텍:사용내역서] 26년 7월 AWS, GWS'), '[GS네오텍:사용내역서] 년 AWS, GWS')
  assert.equal(normalizeSubject('[텐소프트웍스] 8월 월말 보고서 송부'), '[텐소프트웍스] 월말 보고서 송부')
})
test('매달 비슷한 날 반복되면 규칙', () => {
  const ev = ['2026-06-02', '2026-07-01', '2026-08-03', '2026-09-02'].map((d, i) => ({ company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'office@seoulsports.or.kr', key: 'sent_mail:office@seoulsports.or.kr:[텐소프트웍스] 월말 보고서 송부', label: '서울시체육회 월말 보고서 송부', date: d, ref: `m${i}` }))
  const r = inferRules(ev, { existingRules: [] })
  assert.equal(r.length, 1)
  assert.equal(r[0].rule.day, 2)
  assert.equal(r[0].origin, 'inferred')
  assert.equal(r[0].completion.kind, 'sent_mail')
  assert.ok(r[0].confidence > 0.5)
  assert.equal(r[0].evidence.length, 4)
})
test('날이 들쭉날쭉하면 규칙 아님', () => {
  const ev = ['2026-06-02', '2026-07-20', '2026-08-11'].map((d, i) => ({ company: 'tensw', kind: 'cash', table: 'tensw_mgmt_cash', counterparty: 'X', key: 'cash:tensw_mgmt_cash:X:out', label: 'X 출금', date: d, ref: `c${i}` }))
  assert.equal(inferRules(ev, { existingRules: [] }).length, 0)
})
test('한 달에 여러 번은 한 번으로 센다', () => {
  const ev = ['2026-09-02', '2026-09-03', '2026-09-04'].map((d, i) => ({ company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'a@b.c', key: 'k', label: 'L', date: d, ref: `m${i}` }))
  assert.equal(inferRules(ev, { existingRules: [] }).length, 0)
})
test('씨앗 규칙과 같은 일은 제외', () => {
  const ev = ['2026-07-22', '2026-08-21', '2026-09-22'].map((d, i) => ({ company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'jjtaxro@daum.net', key: 'sent_mail:jjtaxro@daum.net:급여대장 요청', label: '급여대장 요청', date: d, ref: `m${i}` }))
  const seed = [{ company: 'tensw', task_key: 'payroll', step: 'request', completion: { kind: 'sent_mail', context: 'tensoftworks', to: 'jjtaxro@daum.net', subject: '급여' } }]
  assert.equal(inferRules(ev, { existingRules: seed }).length, 0)
})
```

- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현**

```js
// infer.mjs — 메일·현금·완료 일정에서 "매달 비슷한 날" 반복을 찾아 규칙 후보로 만든다.
import { createHash } from 'node:crypto'

const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi
export function normalizeSubject(s) {
  return String(s ?? '').replace(/^\s*((re|fwd?|회신|전달)\s*:\s*)+/i, '').replace(MONTHS, '')
    .replace(/\d+\s*(월분|월|분)/g, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim()
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)] }
const coveredBySeed = (ev, rules) => rules.some(r => r.company === ev.company && r.completion && (
  (r.completion.to && ev.to && ev.to.includes(r.completion.to)) ||
  (r.completion.counterparty && ev.counterparty && ev.counterparty.includes(r.completion.counterparty))))

export function inferRules(events, { existingRules = [], minMonths = 2, spread = 4 } = {}) {
  const groups = new Map()
  for (const e of events) {
    if (!groups.has(e.key)) groups.set(e.key, [])
    groups.get(e.key).push(e)
  }
  const out = []
  for (const [key, evs] of groups) {
    const byMonth = new Map()
    for (const e of evs.sort((a, b) => a.date.localeCompare(b.date))) if (!byMonth.has(e.date.slice(0, 7))) byMonth.set(e.date.slice(0, 7), e)
    const firsts = [...byMonth.values()]
    if (firsts.length < minMonths) continue
    const daysOf = firsts.map(e => Number(e.date.slice(8, 10)))
    const actual = Math.max(...daysOf) - Math.min(...daysOf)
    if (actual > spread) continue
    const e0 = firsts[0]
    if (coveredBySeed(e0, existingRules)) continue
    const task_key = `inferred-${createHash('sha1').update(key).digest('hex').slice(0, 8)}`
    if (existingRules.some(r => r.company === e0.company && r.task_key === task_key)) continue
    const completion = e0.kind === 'cash' ? { kind: 'cash', table: e0.table, counterparty: e0.counterparty }
      : e0.kind === 'done_schedule' ? null
      : { kind: e0.kind, context: e0.context, ...(e0.to ? { to: e0.to } : {}), ...(e0.subject ? { subject: e0.subject } : {}) }
    out.push({ company: e0.company, task_key, step: 'do', title: e0.label, rule: { kind: 'monthly_day', day: median(daysOf), shift: 'next' },
      lead_days: 1, recipe: null, completion, origin: 'inferred',
      confidence: Math.round(Math.min(1, firsts.length / 4) * (1 - actual / 10) * 100) / 100,
      evidence: firsts.map(e => ({ ref: e.ref, date: e.date })) })
  }
  return out
}
```

- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/mgmt/infer.mjs scripts/lib/mgmt/infer.test.mjs
git commit -m "feat(mgmt): infer monthly recurring work from past mail, cash and schedules"
```

---

### Task 11: 결정함 문구와 윌리 버튼

**Files:**
- Create: `scripts/lib/mgmt/decisions.mjs`
- Test: `scripts/lib/mgmt/decisions.test.mjs`
- Modify: `scripts/telegram-bot.ts` (콜백 처리부 7292행 근처)

**Interfaces:**
- Produces: `decisionMessage(d) → { text, buttons }` — text 첫 줄 `[텐소]`/`[윌로우]` + 질문, 추천이 있으면 `추천: <label>`, buttons 는 `[[{ text: label, callback_data: 'mgmt:<decisionId>:<optionId>' }], [{ text:'보류', callback_data:'mgmt:<id>:hold' }]]`. `callback_data` 는 64바이트 이하(텔레그램 제한) — `decisionId` 는 uuid 36자, optionId 는 12자 이하로 자른다.
- Produces: `parseDecisionCallback(data) → null | { id, option }`.
- Produces: `digestMessage({ date, done, created, inferred, missed, openDecisions, failures }) → string` — 비어 있는 부문은 빼고, 전부 비면 `null`.
- Produces: `reuseAnswer(decision, pastAnswered) → null | answer` — 같은 `subject_key` 의 과거 답이 있고 `decision.kind !== 'send_approval'` 이면 그 답.
- 윌리: `mgmt:` 로 시작하는 callback 은 `handleMessage` 로 넘기지 않고, `mgmt_decisions` 를 `answered`(답=option, `hold` 면 status 유지·answer='hold')로 바꾼 뒤 원 메시지를 `✅ <label>` 으로 고친다.

- [ ] **Step 1: 실패하는 시험**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { decisionMessage, parseDecisionCallback, digestMessage, reuseAnswer } from './decisions.mjs'

const d = { id: '11111111-2222-3333-4444-555555555555', company: 'tensw', kind: 'money', question: '전국도서관대회 부스 250만원, 예산 밖입니다. 진행할까요?', options: [{ id: 'yes', label: '진행' }, { id: 'no', label: '보류' }], recommended: 'yes' }

test('버튼 데이터는 64바이트 이하이고 되읽힌다', () => {
  const m = decisionMessage(d)
  assert.match(m.text, /^\[텐소\]/)
  assert.match(m.text, /추천: 진행/)
  for (const row of m.buttons) for (const b of row) assert.ok(Buffer.byteLength(b.callback_data) <= 64)
  assert.deepEqual(parseDecisionCallback(m.buttons[0][0].callback_data), { id: d.id, option: 'yes' })
  assert.equal(parseDecisionCallback('다른버튼'), null)
})
test('요약은 빈 부문을 뺀다', () => {
  assert.equal(digestMessage({ date: '2026-10-01', done: [], created: [], inferred: [], missed: [], openDecisions: [], failures: [] }), null)
  const s = digestMessage({ date: '2026-10-01', done: ['원천세 납부'], created: [], inferred: ['체육회 월말 보고서(매월 2일)'], missed: [], openDecisions: [], failures: [] })
  assert.match(s, /완료 1/); assert.match(s, /새 반복 규칙/); assert.doesNotMatch(s, /빠짐/)
})
test('같은 판단은 다시 묻지 않되 발송 승인은 예외', () => {
  const past = [{ subject_key: 'tensw:classify:GS네오텍', answer: 'expense', status: 'answered' }]
  assert.equal(reuseAnswer({ kind: 'classify', subject_key: 'tensw:classify:GS네오텍' }, past), 'expense')
  assert.equal(reuseAnswer({ kind: 'send_approval', subject_key: 'tensw:classify:GS네오텍' }, past), null)
})
```

- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 구현**

```js
// decisions.mjs — 결정함 메시지·버튼과 저녁 요약.
const CO = { tensw: '텐소', willow: '윌로우' }

export function decisionMessage(d) {
  const rec = d.options.find(o => o.id === d.recommended)
  const text = [`[${CO[d.company]}] ${d.question}`, rec ? `추천: ${rec.label}` : null].filter(Boolean).join('\n')
  const buttons = [d.options.map(o => ({ text: o.label, callback_data: `mgmt:${d.id}:${String(o.id).slice(0, 12)}` })), [{ text: '보류', callback_data: `mgmt:${d.id}:hold` }]]
  return { text, buttons }
}

export function parseDecisionCallback(data) {
  const m = /^mgmt:([0-9a-f-]{36}):([^:]{1,12})$/.exec(String(data))
  return m ? { id: m[1], option: m[2] } : null
}

export function reuseAnswer(decision, past) {
  if (decision.kind === 'send_approval') return null
  return past.find(p => p.status === 'answered' && p.subject_key === decision.subject_key && p.answer && p.answer !== 'hold')?.answer ?? null
}

export function digestMessage({ date, done, created, inferred, missed, openDecisions, failures }) {
  const parts = []
  if (done.length) parts.push(`완료 ${done.length}: ${done.join(', ')}`)
  if (created.length) parts.push(`새 일정 ${created.length}: ${created.join(', ')}`)
  if (inferred.length) parts.push(`새 반복 규칙(추정) ${inferred.length}: ${inferred.join(', ')} — 빼려면 "규칙 빼 <이름>"`)
  if (missed.length) parts.push(`빠짐 ${missed.length}: ${missed.join(', ')}`)
  if (openDecisions.length) parts.push(`대기 중인 결정 ${openDecisions.length}건`)
  if (failures.length) parts.push(`실패·재시도 예정: ${failures.join(', ')}`)
  return parts.length ? [`경영관리 ${date}`, ...parts].join('\n') : null
}
```

- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: 윌리 수정** — `scripts/telegram-bot.ts` 상단 import 에 `import { parseDecisionCallback } from './lib/mgmt/decisions.mjs'` 추가. 콜백 처리부에서 `if (!isAllowedUser(cbChatId)) continue` 바로 다음에:

```ts
          const mgmt = parseDecisionCallback(cbData)
          if (mgmt) {
            const { data: dec } = await supabase.from('mgmt_decisions').select('id, options, status').eq('id', mgmt.id).maybeSingle()
            if (dec && dec.status !== 'answered') {
              const label = mgmt.option === 'hold' ? '보류' : (dec.options as { id: string; label: string }[]).find(o => o.id.slice(0, 12) === mgmt.option)?.label ?? mgmt.option
              await supabase.from('mgmt_decisions').update(mgmt.option === 'hold'
                ? { answer: 'hold' }
                : { status: 'answered', answer: mgmt.option, answered_at: new Date().toISOString() }).eq('id', mgmt.id)
              if (cb.message?.message_id) await editMessage(cbChatId, cb.message.message_id, `${cb.message.text ?? ''}\n\n✅ ${label}`)
            }
            continue
          }
```

  `npx tsc --noEmit -p . 2>&1 | grep telegram-bot.ts` 가 비어야 한다(타입 오류가 있으면 `.mjs` import 에 `// @ts-ignore` 대신 `scripts/lib/mgmt/decisions.d.mts` 에 선언 한 줄을 둔다).
- [ ] **Step 6: 윌리 재시작** — `launchctl kickstart -k gui/$(id -u)/com.willow.telegram-bot`, `tail -5 ~/Library/Logs/willow-telegram-bot.log` 에 시작 로그 확인.
- [ ] **Step 7: 커밋**

```bash
git add scripts/lib/mgmt/decisions.mjs scripts/lib/mgmt/decisions.test.mjs scripts/telegram-bot.ts
git diff --cached --stat   # telegram-bot.ts 에 다른 세션 변경이 섞였으면 git add -p 로 내 hunk 만
git commit -m "feat(mgmt): decision buttons and evening digest via Willy"
```

---

### Task 12: 실행기와 launchd

**Files:**
- Create: `scripts/mgmt-agent.mjs`, `scripts/com.willow.mgmt-agent.plist`, `scripts/run-mgmt-agent.sh`
- Modify: `package.json` (scripts: `"mgmt": "node scripts/mgmt-agent.mjs"`, `"mgmt:test": "node --test scripts/lib/mgmt/*.test.mjs src/lib/mcp/tools/tensw-mgmt-schedules.test.mjs"`)

**Interfaces:**
- Consumes: 모든 앞 Task.
- 명령: `node scripts/mgmt-agent.mjs [--dry] [--only rules|collect|close|decide|digest|infer]`
  - `rules`: DB `mgmt_rules`(active) 를 읽는다. 비어 있으면 `SEED_RULES` 를 insert(`--dry` 면 안 함). 오늘 ~ +60일 전개 → `planOccurrences` → `applyPlan`(회사별 테이블). `planMissed` 도.
  - `collect`: 메일 두 개·스페이스 → 회사·소스별로 묶어 `buildPrompt`(묶음당 최대 60건) → `judge` → `planJudgement` → `applyJudgement` → 커서 저장(반영 성공 뒤에만).
  - `close`: 열린 `mgmt:` 행마다 규칙의 completion 으로 `findEvidence`(facts: `finance_tax_obligations` 최근 90일, 보낸·받은 메일은 두 메일함 `after:` 45일 제목·수신자만, 현금 두 테이블 최근 45일) → `closePatch`.
  - `decide`: `mgmt_decisions` open → `reuseAnswer` 로 자동 답 가능한 것은 answered(요약에 기록) → 나머지는 `decisionMessage` 로 윌리 전송, status `sent`, `telegram_message_id` 저장. `missed` 행마다 결정 `kind='missed'`(subject_key=`<company>:missed:<source_key>`) 생성.
  - `digest`: 오늘 바뀐 원장 행(evidence at 이 오늘), 새 추론 규칙, missed, 열린 결정 수 → `digestMessage` → 윌리.
  - `infer`: 지난 180일 이벤트 → `inferRules` → `mgmt_rules` insert(origin inferred) — 전개는 다음 `rules` 가 한다.
  - 옵션 없음(주기 실행) = `rules → collect → close → decide`. 시간대에 따라 추가: 07:00~07:29 이면 `infer` 먼저, 18:30~18:59 이면 마지막에 `digest`.
  - 락: `~/.willow/mgmt-agent.lock`(pid). 살아 있는 pid 면 바로 종료.
  - 전체 시간 상한 20분(`setTimeout(() => process.exit(3), 20*60e3).unref()`), Codex 호출 10분.
  - `--dry` 는 DB 쓰기·윌리 전송 없이 무엇을 할지 로그만. 첫 2주는 plist 에 `--dry` 를 넣고 요약만 보낸다(`MGMT_DRY_DIGEST=1` 이면 dry 요약도 윌리로).
  - 텔레그램 전송: `.env.local` `TELEGRAM_BOT_TOKEN`, 대상 chat id 는 `scripts/logs/telegram-allowed-users.json` 이 아니라 **CEO chat id**(윌리가 `ceoChatId` 로 쓰는 값; `grep -n "ceoChatId =" scripts/telegram-bot.ts` 로 출처를 찾아 같은 값을 읽는다).

- [ ] **Step 1: 실행기 작성** — 위 순서를 그대로 옮긴다. 각 단계는 `try { … } catch (e) { failures.push(단계명) ; log(e) }` 로 감싸 한 단계 실패가 다음 단계를 막지 않게 한다. 단, `collect` 가 실패하면 커서를 저장하지 않는다.

```js
#!/usr/bin/env node
// 경영관리 에이전트 — 한 번 돌고 끝난다. launchd 가 30분마다 부른다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { makeCalendar } from './lib/mgmt/calendar.mjs'
import { SEED_RULES } from './lib/mgmt/seed-rules.mjs'
import { planOccurrences, planMissed, applyPlan, tableFor } from './lib/mgmt/ledger.mjs'
import { findEvidence, closePatch } from './lib/mgmt/closers.mjs'
import { getCursor, saveCursor, readMail, readChat } from './lib/mgmt/sources.mjs'
import { buildPrompt, judge } from './lib/mgmt/judge.mjs'
import { planJudgement, applyJudgement } from './lib/mgmt/apply-judgement.mjs'
import { inferRules, normalizeSubject } from './lib/mgmt/infer.mjs'
import { decisionMessage, digestMessage, reuseAnswer } from './lib/mgmt/decisions.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })
const args = process.argv.slice(2)
const dryRun = args.includes('--dry')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const log = m => console.log(`${new Date().toISOString()} [mgmt] ${m}`)
const failures = []
const COMPANIES = ['tensw', 'willow']
const kst = () => new Date(Date.now() + 9 * 3600e3)
const todayKey = () => kst().toISOString().slice(0, 10)
const addDays = (k, n) => { const t = new Date(`${k}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

// 락
const LOCK = path.join(os.homedir(), '.willow/mgmt-agent.lock')
fs.mkdirSync(path.dirname(LOCK), { recursive: true })
try { const pid = Number(fs.readFileSync(LOCK, 'utf8')); if (pid && pid !== process.pid) { process.kill(pid, 0); log(`이미 실행 중(${pid})`); process.exit(0) } } catch {}
fs.writeFileSync(LOCK, String(process.pid))
process.on('exit', () => { try { fs.unlinkSync(LOCK) } catch {} })
setTimeout(() => { log('시간 상한 20분 초과'); process.exit(3) }, 20 * 60e3).unref()

async function telegram(text, buttons) {
  if (dryRun && !process.env.MGMT_DRY_DIGEST) { log(`(dry) 윌리: ${text.split('\n')[0]}`); return null }
  const body = { chat_id: process.env.CEO_CHAT_ID, text: dryRun ? `(시험 운행) ${text}` : text, ...(buttons && !dryRun ? { reply_markup: { inline_keyboard: buttons } } : {}) }
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return (await r.json()).result?.message_id ?? null
}

async function loadRules() {
  const { data } = await sb.from('mgmt_rules').select('*').eq('active', true)
  if (data?.length) return data
  log(`규칙 비어 있음 → 씨앗 ${SEED_RULES.length}개`)
  if (!dryRun) { const { error } = await sb.from('mgmt_rules').insert(SEED_RULES.map(r => ({ ...r, origin: 'seed' }))); if (error) throw error; return (await sb.from('mgmt_rules').select('*').eq('active', true)).data }
  return SEED_RULES
}

async function stepRules() {
  const rules = await loadRules()
  const cal = makeCalendar()
  const from = todayKey(), to = addDays(from, 60)
  for (const company of COMPANIES) {
    const table = tableFor(company)
    const { data: rows } = await sb.from(table).select('id, title, schedule_date, source_key, is_completed, agent_state, evidence, category').neq('category', 'personal').gte('schedule_date', addDays(from, -45))
    await applyPlan(sb, table, planOccurrences(rules.filter(r => r.company === company), rows, { from, to, cal }), { dryRun, log })
    await applyPlan(sb, table, { insert: [], update: planMissed(rows, from) }, { dryRun, log })
  }
}

async function stepCollect() {
  const sources = [['mail:tensw', () => getCursor(sb, 'mail:tensw').then(c => readMail(sb, 'tensoftworks', c)), 'tensw'],
                   ['mail:willow', () => getCursor(sb, 'mail:willow').then(c => readMail(sb, 'default', c)), 'willow']]
  const batches = []
  for (const [source, read, company] of sources) batches.push({ source, company, items: await read() })
  for (const [space, items] of await readChat(sb, s => getCursor(sb, s))) batches.push({ source: `chat:${space}`, company: 'tensw', items })
  for (const b of batches) {
    for (let i = 0; i < b.items.length; i += 60) {
      const items = b.items.slice(i, i + 60)
      const table = tableFor(b.company)
      const { data: openCases } = await sb.from('mgmt_cases').select('name').eq('company', b.company).eq('status', 'open')
      const { data: openSchedules } = await sb.from(table).select('id, title, schedule_date, source_key, evidence').eq('is_completed', false).neq('category', 'personal').gte('schedule_date', addDays(todayKey(), -60))
      const j = await judge(buildPrompt({ company: b.company, items, openCases: openCases ?? [], openSchedules: openSchedules ?? [] }))
      await applyJudgement(sb, planJudgement(b.company, j, { items, openSchedules: openSchedules ?? [] }), { dryRun, log })
      await saveCursor(sb, b.source, items, { dryRun })
    }
  }
}

async function loadFacts() {
  const since = addDays(todayKey(), -90)
  const { data: taxObligations } = await sb.from('finance_tax_obligations').select('id, company, obligation_type, due_date, status, paid_at').gte('due_date', since).is('deleted_at', null)
  const mailFacts = async (context, dir) => (await readMail(sb, context, { last_seen_at: new Date(Date.now() - 45 * 864e5).toISOString() }, { limit: 300 }))
    .filter(m => m.direction === dir).map(m => ({ id: m.ref, context, to: m.to, from: m.from, subject: m.subject, at: m.at }))
  const sentMail = [...await mailFacts('tensoftworks', 'out'), ...await mailFacts('default', 'out')]
  const receivedMail = [...await mailFacts('tensoftworks', 'in'), ...await mailFacts('default', 'in')]
  const cash = []
  for (const table of ['tensw_mgmt_cash', 'willow_mgmt_cash']) {
    const { data } = await sb.from(table).select('*').gte('transaction_date', addDays(todayKey(), -45))
    for (const r of data ?? []) cash.push({ id: r.id, table, date: r.transaction_date, category: r.category, counterparty: r.counterparty ?? r.description ?? '', amount: r.amount })
  }
  return { taxObligations: taxObligations ?? [], sentMail, receivedMail, cash }
}

async function stepClose() {
  const rules = await loadRules()
  const facts = await loadFacts()
  for (const company of COMPANIES) {
    const table = tableFor(company)
    const { data: rows } = await sb.from(table).select('id, title, schedule_date, source_key, evidence, agent_state').eq('is_completed', false).like('source_key', `mgmt:${company}:%`)
    for (const row of rows ?? []) {
      const [, , task, , step] = row.source_key.split(':')
      const rule = rules.find(r => r.company === company && r.task_key === task && r.step === step)
      const ev = rule && findEvidence(row, rule, facts)
      if (!ev) continue
      log(`완료 ${company} ${row.title} ← ${ev.kind} ${ev.note ?? ''}`)
      if (!dryRun) await sb.from(table).update(closePatch(row, ev)).eq('id', row.id)
    }
  }
}

async function stepDecide() {
  for (const company of COMPANIES) {
    const { data: missed } = await sb.from(tableFor(company)).select('title, schedule_date, source_key').eq('agent_state', 'missed').eq('is_completed', false)
    for (const m of missed ?? []) {
      const row = { company, kind: 'missed', subject_key: `${company}:missed:${m.source_key}`, question: `${m.schedule_date} "${m.title}" 기한이 지났는데 완료 기록이 없어요. 어떻게 할까요?`,
        options: [{ id: 'done', label: '이미 했음' }, { id: 'later', label: '다시 일정 잡기' }, { id: 'drop', label: '안 해도 됨' }], recommended: null, schedule_key: m.source_key, status: 'open' }
      if (!dryRun) { const { error } = await sb.from('mgmt_decisions').insert(row); if (error && error.code !== '23505') throw error }
    }
  }
  const { data: open } = await sb.from('mgmt_decisions').select('*').eq('status', 'open')
  const { data: past } = await sb.from('mgmt_decisions').select('subject_key, answer, status').eq('status', 'answered')
  for (const d of open ?? []) {
    const auto = reuseAnswer(d, past ?? [])
    if (auto) { log(`지난 판단 재사용 ${d.subject_key} → ${auto}`); if (!dryRun) await sb.from('mgmt_decisions').update({ status: 'answered', answer: auto, answered_at: new Date().toISOString() }).eq('id', d.id); continue }
    const { text, buttons } = decisionMessage(d)
    const mid = await telegram(text, buttons)
    if (!dryRun) await sb.from('mgmt_decisions').update({ status: 'sent', telegram_message_id: mid }).eq('id', d.id)
  }
}

async function stepDigest() {
  const today = todayKey()
  const done = [], created = [], missed = []
  for (const company of COMPANIES) {
    const { data } = await sb.from(tableFor(company)).select('title, created_at, is_completed, agent_state, evidence').neq('category', 'personal').or(`created_at.gte.${today},agent_state.eq.missed`)
    for (const r of data ?? []) {
      if (r.agent_state === 'missed') missed.push(r.title)
      else if (r.created_at?.startsWith(today)) created.push(r.title)
    }
    const { data: closed } = await sb.from(tableFor(company)).select('title, evidence').eq('agent_state', 'done')
    for (const r of closed ?? []) if ((r.evidence ?? []).some(e => String(e.at ?? '').startsWith(today))) done.push(r.title)
  }
  const { data: inferred } = await sb.from('mgmt_rules').select('title, rule').eq('origin', 'inferred').gte('created_at', today)
  const { count } = await sb.from('mgmt_decisions').select('id', { count: 'exact', head: true }).in('status', ['open', 'sent'])
  const text = digestMessage({ date: today, done, created, inferred: (inferred ?? []).map(r => `${r.title}(매월 ${r.rule.day}일)`), missed, openDecisions: Array(count ?? 0).fill(0), failures })
  if (text) await telegram(text)
}

async function stepInfer() {
  const since = addDays(todayKey(), -180)
  const events = []
  for (const [context, company] of [['tensoftworks', 'tensw'], ['default', 'willow']]) {
    const mails = await readMail(sb, context, { last_seen_at: `${since}T00:00:00Z` }, { limit: 500 })
    for (const m of mails) {
      const addr = (m.direction === 'out' ? m.to : m.from).match(/[\w.+-]+@[\w.-]+/)?.[0] ?? ''
      const kind = m.direction === 'out' ? 'sent_mail' : 'received_mail'
      events.push({ company, kind, context, to: m.direction === 'out' ? addr : undefined, subject: normalizeSubject(m.subject), key: `${kind}:${addr}:${normalizeSubject(m.subject)}`, label: normalizeSubject(m.subject), date: m.at.slice(0, 10), ref: m.ref })
    }
  }
  for (const [table, company] of [['tensw_mgmt_cash', 'tensw'], ['willow_mgmt_cash', 'willow']]) {
    const { data } = await sb.from(table).select('*').gte('transaction_date', since)
    for (const r of data ?? []) {
      const cp = r.counterparty ?? r.description ?? ''
      if (!cp) continue
      events.push({ company, kind: 'cash', table, counterparty: cp, key: `cash:${table}:${cp}:${r.amount < 0 ? 'out' : 'in'}`, label: `${cp} ${r.amount < 0 ? '출금' : '입금'}`, date: r.transaction_date, ref: r.id })
    }
  }
  const { data: rules } = await sb.from('mgmt_rules').select('*')
  const found = inferRules(events, { existingRules: rules ?? SEED_RULES, minMonths: 3 })
  for (const r of found) {
    log(`추론 규칙 ${r.company} ${r.title} 매월 ${r.rule.day}일 (신뢰 ${r.confidence})`)
    if (!dryRun) { const { error } = await sb.from('mgmt_rules').insert(r); if (error && error.code !== '23505') throw error }
  }
}

const STEPS = { rules: stepRules, collect: stepCollect, close: stepClose, decide: stepDecide, digest: stepDigest, infer: stepInfer }
const hm = kst().toISOString().slice(11, 16)
const plan = only ? [only] : [...(hm >= '07:00' && hm < '07:30' ? ['infer'] : []), 'rules', 'collect', 'close', 'decide', ...(hm >= '18:30' && hm < '19:00' ? ['digest'] : [])]
for (const name of plan) {
  try { log(`단계 ${name}${dryRun ? ' (dry)' : ''}`); await STEPS[name]() } catch (e) { failures.push(name); log(`실패 ${name}: ${e instanceof Error ? e.message : e}`) }
}
process.exitCode = failures.length ? 1 : 0
```

  작성 뒤 확인할 실제 칸 이름: `*_mgmt_cash` 의 날짜·분류·상대 칸(`transaction_date`, `category`, `counterparty`/`description`, `amount`)을 `select * limit 1` 로 보고 다르면 `loadFacts`·`stepInfer` 두 곳만 고친다. `CEO_CHAT_ID` 는 `.env.local` 에 없으면 윌리가 쓰는 값을 찾아 `.env.local` 에 `printf 'CEO_CHAT_ID=%s\n' <값> >> .env.local` 로 넣는다.

- [ ] **Step 2: 드라이런** — `node scripts/mgmt-agent.mjs --dry --only rules` → 양사 10~11월 회차 추가 계획이 나오고, 텐소 4대보험(재무 동기화 행이 있는 날)은 추가되지 않아야 한다.
  `node scripts/mgmt-agent.mjs --dry --only close` → 9월 원천세·4대보험(이미 paid) 행이 "완료"로 나와야 한다(원장에 9월 행이 없으면 0건도 정상).
  `node scripts/mgmt-agent.mjs --dry --only collect` → 최근 24시간 메시지 해석 로그. 이상한 회사 배정·지어낸 일정이 있으면 멈추고 프롬프트를 고친다.
- [ ] **Step 3: launchd**

```bash
# scripts/run-mgmt-agent.sh
#!/bin/zsh
cd /Volumes/PRO-G40/app-dev/willow-invt || exit 1
DOW=$(date +%u); H=$(date +%H)
[ "$DOW" -ge 6 ] && exit 0                    # 주말 쉼
[ "$H" -lt 7 ] || [ "$H" -gt 20 ] && exit 0   # 07~20시만
exec /opt/homebrew/bin/node scripts/mgmt-agent.mjs ${MGMT_ARGS:-}
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.willow.mgmt-agent</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>/Volumes/PRO-G40/app-dev/willow-invt/scripts/run-mgmt-agent.sh</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>MGMT_ARGS</key><string>--dry</string>
    <key>MGMT_DRY_DIGEST</key><string>1</string>
  </dict>
  <key>StartCalendarInterval</key><array>
    <dict><key>Minute</key><integer>5</integer></dict>
    <dict><key>Minute</key><integer>35</integer></dict>
  </array>
  <key>StandardOutPath</key><string>/Users/dongwookkim/logs/mgmt-agent/launchd.log</string>
  <key>StandardErrorPath</key><string>/Users/dongwookkim/logs/mgmt-agent/launchd.log</string>
</dict></plist>
```

  설치: `mkdir -p ~/logs/mgmt-agent && chmod +x scripts/run-mgmt-agent.sh && cp scripts/com.willow.mgmt-agent.plist ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.willow.mgmt-agent.plist`.
  (07:05 실행이 `infer`, 18:35 실행이 `digest` 를 탄다.)
- [ ] **Step 4: 전체 시험** — `npm run mgmt:test` 전부 PASS.
- [ ] **Step 5: 커밋**

```bash
git add scripts/mgmt-agent.mjs scripts/run-mgmt-agent.sh scripts/com.willow.mgmt-agent.plist package.json
git diff --cached --stat
git commit -m "feat(mgmt): periodic management agent runner, dry-run first"
```

---

### Task 13: 6~9월 재현 시험

**Files:**
- Create: `scripts/mgmt-replay.mjs`

**Interfaces:**
- Consumes: `expandRule`, `SEED_RULES`, `findEvidence`, `inferRules`, `normalizeSubject`, `readMail` (앞 Task).
- 출력: `logs/mgmt-replay-2026-06-09.md` — 표 세 개.
  1. **정기 회차 재현**: 씨앗 규칙을 6/1~9/30 로 전개한 회차마다 실제 근거(`findEvidence`)가 있었는지. 열 = 회사·업무·회차 날짜·근거 종류·근거 날짜·차이(일). 근거 없는 회차는 "빠짐" 으로 표시.
  2. **닫힘 누락 사례**: 8월 윌로우 원천세처럼 근거가 있는데 원장·`email_todos`·`ws_threads` 에 열린 채 남은 항목 수(원장은 `source_key` 없이 제목이 같은 행으로 찾는다).
  3. **추론 규칙**: 6~9월 이벤트로 `inferRules(minMonths:3)` 를 돌린 결과 목록(제목·날·신뢰도·근거 수).
- 판단(Codex) 재현은 이 시험에 넣지 않는다(비용·시간). 대신 `--sample-chat N` 옵션이 있으면 스페이스 메시지 N개를 골라 `judge` 결과를 부록으로 붙인다(기본 0).

- [ ] **Step 1: 작성** — 위 세 표를 만드는 스크립트. 사실 적재는 Task 12 `loadFacts` 와 같은 방식이되 기간을 `2026-06-01` ~ `2026-09-30` 으로.
- [ ] **Step 2: 실행** — `node scripts/mgmt-replay.mjs`. 기대: 급여 요청·출근부·지원금(8·9월)·원천세·4대보험 회차 대부분에 근거가 잡힌다. "빠짐" 이 나온 회차는 규칙(날짜·완료 조건)이 틀렸는지 실제로 안 한 건지 한 줄씩 판정해 보고서 끝에 적는다. 규칙이 틀렸으면 `seed-rules.mjs` 를 고치고 Task 5 시험을 다시 돌린다.
- [ ] **Step 3: 보고** — 보고서 요약(재현율 = 근거 잡힌 회차/전체, 닫힘 누락 수, 추론 규칙 수)을 윌리로 보내지 않고 이 세션에서 CEO 에게 보여준다. 첫 2주 dry 운행을 켤지 여기서 확인받는다.
- [ ] **Step 4: 커밋**

```bash
git add scripts/mgmt-replay.mjs
git commit -m "test(mgmt): replay June–September to measure schedule reproduction"
```

---

### Task 14: 텐소 재무 스케줄러 실패(우리카드 로그인)

**Files:**
- 조사 대상: `~/logs/tensw-local-finance/launchd.log`, `scripts/collect-woori-card*.mjs`, `scripts/lib/woori-card-local.mjs`

- [ ] **Step 1:** `superpowers:systematic-debugging` 스킬로 진행한다. 먼저 `grep -n "우리카드" ~/logs/tensw-local-finance/launchd.log | tail -40` 으로 실패가 언제부터 어떤 문구로 나는지 본다.
- [ ] **Step 2:** 인증서 창에서 확인을 누르거나 비밀번호를 다시 제출하는 재시도는 하지 않는다(잠금 카운터 5회, 메모리 `feedback_cert_dialog_never_confirm`). 재현은 `node scripts/run-local-finance.sh tensw --only card` 가 아니라 로그·스크린샷으로 한다. 사람이 필요한 단계면 멈추고 CEO에게 묻는다.
- [ ] **Step 3:** `git status` 에 `scripts/lib/cert-password-entry.mjs`·`login-native-cert.mjs` 가 다른 세션 변경으로 떠 있다. 그 세션이 이 실패를 고치는 중인지 ws 스레드(`node scripts/ws-context.mjs load`)로 먼저 확인하고, 그렇다면 이 Task 는 확인만 하고 넘긴다.
- [ ] **Step 4:** 고쳤으면 해당 파일의 기존 시험(`npm run finance:test`) 통과 후 커밋. 원인·조치를 ws 스레드에 기록.

---

### Task 15: 문서·레시피

**Files:**
- Modify: `CLAUDE.md` ("반복 작업 레시피" 에 경영관리 에이전트 절 추가), `AGENTS.md`(같은 절)
- Create: `.claude/skills/mgmt-agent/SKILL.md`, `.agents/skills/mgmt-agent/SKILL.md`(같은 내용)

- [ ] **Step 1: 레시피 절**

```markdown
### 경영관리 에이전트
`mgmt-agent` · 트리거: "경영관리 에이전트", "일정 정리", "결정함", "반복 규칙"

일정 원장(`tensw_mgmt_schedules`·`willow_mgmt_schedules`)을 중심으로 30분마다 돈다(launchd `com.willow.mgmt-agent`, 평일 07~20시).
규칙으로 정기 일정을 깔고 → 메일(텐소·윌로우)·텐소 스페이스를 읽어 일정·기록부를 고치고 → 기록 근거로만 완료 처리 → 결정이 필요한 것만 윌리 버튼.

```bash
node scripts/mgmt-agent.mjs --dry                 # 무엇을 할지만
node scripts/mgmt-agent.mjs --only rules          # 규칙 전개(오늘~60일)
node scripts/mgmt-agent.mjs --only close          # 근거로 완료 처리
node scripts/mgmt-agent.mjs --only digest         # 저녁 요약
node scripts/mgmt-replay.mjs                      # 6~9월 재현 시험
npm run mgmt:test
```

- 발송은 하지 않는다. 결정함의 발송 승인은 매번 묻고, 같은 분류 판단은 지난 답을 재사용한다.
- `category='personal'` 은 읽지도 쓰지도 않는다. 비밀값은 `redact()` 를 거쳐 값 없이 기록한다.
- 반복 규칙은 `mgmt_rules`. 추정 규칙을 끄려면 `update mgmt_rules set active=false where title=…`.
- 설계: `docs/superpowers/specs/2026-09-30-mgmt-agent-design.md`
```

- [ ] **Step 2: SKILL.md** — 위 절에 "하면 안 되는 것"(발송, 즉석 스크립트, personal 행, 인증서 창 확인) 과 "윌리 말 → 명령" 표(예: "경영 일정 정리해" → `--only rules` + `--only close`, "오늘 요약" → `--only digest`, "규칙 빼 X" → 위 SQL)를 더한다.
- [ ] **Step 3: 커밋**

```bash
git add CLAUDE.md AGENTS.md .claude/skills/mgmt-agent .agents/skills/mgmt-agent
git diff --cached --stat   # AGENTS.md 에 다른 세션 변경이 있으면 git add -p
git commit -m "docs(mgmt): recipe and skill for the management agent"
```

---

## 2단계 이후(이 계획 밖)

- 레시피 실행(텐소 1~4번, 윌로우 W1·W2·W5~W7): `mgmt_rules.recipe` 가 있는 행이 리드타임 안에 들어오면 초안 명령을 부르고 `awaiting_decision` → 발송 승인 결정.
- 경영 화면(`/tensw`, `/mgmt`)에 건·결정 이력 블록.
- 레시피 없는 업무 스킬화(텐소 5·9·11·12, 윌로우 W3·W8·W9·W10).
