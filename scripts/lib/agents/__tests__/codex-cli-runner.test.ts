import assert from 'node:assert/strict'
import test from 'node:test'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  codexCliRunner,
  resolveTimeoutMs,
  DEFAULT_TIMEOUT_MS,
  KILL_GRACE_MS,
} from '../codex-cli-runner'

// 2026-08-17 회귀: 텔레그램 봇의 아침 브리핑이 codex 자식을 1시간 37분 붙잡고 있었다.
// 원인 두 가지 — (1) 호출부가 timeoutMs를 안 넘기면 타이머 자체가 안 걸려 무제한 대기,
// (2) 타임아웃이 걸려도 SIGTERM 한 번뿐이라 물린 codex와 그 MCP 자식들이 살아남았다.

test('timeoutMs를 안 넘겨도 유한한 기본 타임아웃이 걸린다', () => {
  // 무제한 대기(null/Infinity)가 되면 안 된다. 이게 행의 1차 원인이었다.
  const fallback = resolveTimeoutMs(undefined)
  assert.ok(Number.isFinite(fallback), '기본 타임아웃이 유한해야 한다')
  assert.ok(fallback > 0, '기본 타임아웃이 양수여야 한다')
  assert.equal(fallback, DEFAULT_TIMEOUT_MS)
})

test('명시된 timeoutMs는 기본값을 덮어쓴다', () => {
  assert.equal(resolveTimeoutMs(1234), 1234)
})

// SIGTERM을 무시하는 가짜 codex를 PATH 앞에 심어, 실제로 죽는지 본다.
function makeFakeCodex(dir: string) {
  const selfPidFile = join(dir, 'self.pid')
  const childPidFile = join(dir, 'child.pid')
  const bin = join(dir, 'codex')
  writeFileSync(
    bin,
    [
      '#!/bin/sh',
      // MCP 서버 흉내: 자식 하나를 띄운다. 같은 프로세스 그룹에 들어간다.
      'sleep 600 &',
      `echo $! > "${childPidFile}"`,
      `echo $$ > "${selfPidFile}"`,
      // 물린 codex 재현: SIGTERM/SIGINT를 무시한다.
      "trap '' TERM INT",
      'while true; do sleep 1; done',
    ].join('\n') + '\n',
  )
  chmodSync(bin, 0o755)
  return { selfPidFile, childPidFile }
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

async function waitGone(pid: number, deadlineMs: number): Promise<boolean> {
  const until = Date.now() + deadlineMs
  while (Date.now() < until) {
    if (!alive(pid)) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return !alive(pid)
}

test('SIGTERM을 무시하는 codex도 타임아웃 후 프로세스 트리째 정리된다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-runner-test-'))
  const { selfPidFile, childPidFile } = makeFakeCodex(dir)
  const originalPath = process.env.PATH

  try {
    process.env.PATH = `${dir}:${originalPath}`

    const timeoutMs = 1000
    await assert.rejects(
      () => codexCliRunner.run('안녕', { timeoutMs, sandbox: 'danger-full-access' }),
      /codex timeout/,
      '타임아웃이면 codex timeout 으로 거절해야 한다',
    )

    // 가짜 codex가 pid를 남길 시간을 준다.
    for (let i = 0; i < 20 && !existsSync(selfPidFile); i++) {
      await new Promise((r) => setTimeout(r, 50))
    }
    assert.ok(existsSync(selfPidFile), '가짜 codex가 실행됐어야 한다')

    const selfPid = Number(readFileSync(selfPidFile, 'utf-8').trim())
    const childPid = Number(readFileSync(childPidFile, 'utf-8').trim())

    // SIGTERM 유예 후 SIGKILL 까지 간다. 넉넉히 기다린다.
    const budget = KILL_GRACE_MS + 4000

    assert.ok(
      await waitGone(selfPid, budget),
      `codex(${selfPid})가 SIGTERM을 무시해도 결국 종료돼야 한다`,
    )
    assert.ok(
      await waitGone(childPid, 2000),
      `codex가 띄운 자식(${childPid}, MCP 서버 상당)도 함께 정리돼야 한다`,
    )
  } finally {
    process.env.PATH = originalPath
    // 테스트가 실패해 남은 게 있으면 여기서 확실히 청소한다.
    for (const f of [selfPidFile, childPidFile]) {
      if (!existsSync(f)) continue
      const pid = Number(readFileSync(f, 'utf-8').trim())
      if (Number.isFinite(pid) && alive(pid)) {
        try { process.kill(-pid, 'SIGKILL') } catch { /* ignore */ }
        try { process.kill(pid, 'SIGKILL') } catch { /* ignore */ }
      }
    }
    rmSync(dir, { recursive: true, force: true })
  }
})
