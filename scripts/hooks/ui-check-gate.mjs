#!/usr/bin/env node
/**
 * Claude Code PreToolUse(Bash) 훅 — 대시보드 UI 파일을 커밋하려면 ui-check 를 먼저 통과해야 한다.
 *
 * `git commit` 이 들어간 명령만 본다. 커밋에 들어갈 파일(이미 스테이징된 것 + 같은 명령의 `git add` 경로) 중
 * src/app/(dashboard)/(linear)/** 또는 src/app/(dashboard)/_components/** 의 .tsx 가 있으면,
 * .ui-check/last-pass.json 이 그 파일들보다 나중에 기록됐는지 본다. 아니면 커밋을 막고 돌릴 명령을 알려 준다.
 *
 * 화면이 바뀌지 않는 tsx 수정(타입만, 주석만)은 명령 앞에 UI_CHECK_SKIP=1 을 붙여 넘긴다 — 커밋 메시지에 이유를 적는다.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
const cmd = String(input?.tool_input?.command || '')
if (!/\bgit\s+commit\b/.test(cmd)) process.exit(0)
if (/\bUI_CHECK_SKIP=1\b/.test(cmd)) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)

// 같은 명령의 `git add a b c` 경로 — 훅은 add 가 실행되기 전에 돈다.
const addSpecs = []
for (const m of cmd.matchAll(/\bgit\s+add\s+([^;&|]+)/g)) {
  for (const tok of m[1].match(/"[^"]*"|'[^']*'|\S+/g) || []) {
    const t = tok.replace(/^["']|["']$/g, '')
    if (!t.startsWith('-')) addSpecs.push(t)
  }
}
let files = new Set(git('diff', '--cached', '--name-only'))
if (addSpecs.length) {
  try { for (const f of git('diff', '--name-only', 'HEAD', '--', ...addSpecs)) files.add(f) } catch { /* 잘못된 pathspec 은 add 가 알아서 실패한다 */ }
}

const UI = /^src\/app\/\(dashboard\)\/(\(linear\)|_components)\/.*\.tsx$/
const uiFiles = [...files].filter(f => UI.test(f) && fs.existsSync(path.join(root, f)))
if (uiFiles.length === 0) process.exit(0)

const newest = Math.max(...uiFiles.map(f => fs.statSync(path.join(root, f)).mtimeMs))
let passAt = 0, passPaths = []
try {
  const pass = JSON.parse(fs.readFileSync(path.join(root, '.ui-check/last-pass.json'), 'utf8'))
  passAt = Date.parse(pass.at); passPaths = pass.paths || []
} catch {}

// 파일 경로에서 검사할 화면을 짐작한다: (linear)/invest/... → /invest. 공용 컴포넌트면 사람이 고른다.
const routes = [...new Set(uiFiles.map(f => f.match(/\(linear\)\/([^/(_][^/]*)/)?.[1]).filter(Boolean).map(r => `/${r}`))]
// 통과 기록이 새롭고, 바뀐 화면이 모두 그 검사에 들어 있어야 연다 — 다른 화면의 통과로 이 화면이 새지 않게.
const missing = routes.filter(r => !passPaths.includes(r))
if (passAt > newest && missing.length === 0) process.exit(0)
const run = `node scripts/ui-check.mjs ${routes.length ? routes.join(' ') : '/<바뀐 화면>'}`
const reason = [
  '대시보드 UI 파일을 커밋하려면 화면 검사를 먼저 통과해야 합니다.',
  `바뀐 파일: ${uiFiles.join(', ')}`,
  !passAt ? '통과 기록(.ui-check/last-pass.json)이 없습니다.'
    : missing.length ? `마지막 통과 검사에 이 화면이 없습니다: ${missing.join(', ')}` : '마지막 통과 기록이 이 파일들보다 오래됐습니다.',
  `실행: ${run}  (결정적 검사 + Codex 화면 심사, 통과해야 기록이 남습니다)`,
  '실패 항목을 고친 뒤 다시 돌리고, CEO 의 새 지적은 docs/design-system/ui-judge-rubric.md 지적 이력에 한 줄 더합니다.',
  '화면이 바뀌지 않는 수정이면 UI_CHECK_SKIP=1 git commit … 으로 넘기고 커밋 메시지에 이유를 적습니다.',
].join('\n')

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
}))
