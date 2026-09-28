#!/usr/bin/env node
/**
 * Claude Code PreToolUse(Bash) 훅 — 대시보드 UI 파일을 커밋하려면 ui-check 를 먼저 통과해야 한다.
 *
 * `git commit` 이 들어간 명령만 본다. 커밋에 들어갈 파일(이미 스테이징된 것 + 같은 명령의 `git add` 경로) 중
 * src/app/(dashboard)/(linear)/** 또는 src/app/(dashboard)/_components/** 의 .tsx 가 있으면,
 * 파일이 속한 화면(scripts/lib/ui-routes.mjs)의 통과 기록(.ui-check/last-pass.json routes[화면])이 파일보다
 * 새로운지 본다. 공용 컴포넌트는 --all 기록(all)을 본다. 아니면 커밋을 막고 돌릴 명령을 알려 준다.
 *
 * 화면이 바뀌지 않는 tsx 수정(타입만, 주석만)은 명령 앞에 UI_CHECK_SKIP=1 을 붙여 넘긴다 — 커밋 메시지에 이유를 적는다.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { discoverRoutes, routeOfFile } from '../lib/ui-routes.mjs'

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

const routes = discoverRoutes(root)
const records = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, '.ui-check/last-pass.json'), 'utf8')) } catch { return {} } })()
// 파일마다 속한 화면의 통과 기록이 그 파일보다 새로워야 한다. 공용(*)은 --all 기록을 본다.
const stale = new Map() // route → 파일들
for (const f of uiFiles) {
  const route = routeOfFile(f, routes) ?? '*'
  const at = Date.parse(route === '*' ? records.all : records.routes?.[route]) || 0
  if (at <= fs.statSync(path.join(root, f)).mtimeMs) stale.set(route, [...(stale.get(route) || []), f])
}
if (stale.size === 0) process.exit(0)

const named = [...stale.keys()].filter(r => r !== '*')
const run = [
  named.length ? `node scripts/ui-check.mjs ${named.join(' ')}` : null,
  stale.has('*') ? 'node scripts/ui-check.mjs --all --no-judge   (공용 컴포넌트 — 전 화면 결정적 검사)' : null,
].filter(Boolean).join('\n      ')
const reason = [
  '대시보드 UI 파일을 커밋하려면 화면 검사를 먼저 통과해야 합니다.',
  ...[...stale].map(([r, fs_]) => `${r === '*' ? '전 화면(공용)' : r}: ${fs_.join(', ')} — 이 화면의 통과 기록이 없거나 파일보다 오래됐습니다.`),
  `실행: ${run}`,
  '옛 화면의 기존 부채(docs/ui-review/baseline.json)는 막지 않습니다. 새 위반이나 점수 하락만 막습니다.',
  '실패 항목을 고친 뒤 다시 돌리고, CEO 의 새 지적은 docs/design-system/ui-judge-rubric.md 지적 이력에 한 줄 더합니다.',
  '화면이 바뀌지 않는 수정이면 UI_CHECK_SKIP=1 git commit … 으로 넘기고 커밋 메시지에 이유를 적습니다.',
].join('\n')

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
}))
