import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_CMD_TIMEOUT_MS,
  clip,
  formatFailureReport,
  formatSuccessReport,
  humanDuration,
  timeoutForSource,
} from '../dispatch-report'

// 2026-08-27 회귀: GSC 색인 배치가 15분 상한에 잘렸다. 10건을 이미 요청해 둔 뒤라
// 실제 요청은 살아있는데 보고와 문서 갱신만 사라졌고, CEO에겐 "codex timeout" 다섯 글자만 갔다.

test('색인 배치는 기본 상한보다 긴 상한을 받는다', () => {
  assert.ok(timeoutForSource('scheduled:gsc-indexing') > DEFAULT_CMD_TIMEOUT_MS)
  assert.equal(timeoutForSource('adhoc'), DEFAULT_CMD_TIMEOUT_MS)
  assert.equal(timeoutForSource(null), DEFAULT_CMD_TIMEOUT_MS)
})

test('환경변수로 상한을 덮어쓸 수 있다', () => {
  process.env.WS_DISPATCH_TIMEOUT_MS = '90000'
  try {
    assert.equal(timeoutForSource('scheduled:gsc-indexing'), 90_000)
  } finally {
    delete process.env.WS_DISPATCH_TIMEOUT_MS
  }
})

test('결과의 줄 구조를 눌러 한 줄로 만들지 않는다', () => {
  const report = '전체 결과\n- 성공: 10건\n- 실패: 0건'
  assert.equal(clip(report, 200), report)
  assert.ok(clip(report, 200).includes('\n'))
})

test('잘릴 때도 줄 경계를 지키고 말줄임을 남긴다', () => {
  const long = Array.from({ length: 40 }, (_, i) => `- 항목 ${i}`).join('\n')
  const cut = clip(long, 100)
  assert.ok(cut.length <= 100)
  assert.ok(cut.endsWith('…'))
})

test('성공 알림은 제목·소요시간·본문 순서를 지킨다', () => {
  const msg = formatSuccessReport(
    { project: 'willow-invt', source: 'scheduled:gsc-indexing', started_at: '2026-08-27T09:15:15.000Z' },
    '전체 결과\n- 성공: 11건',
    { turn: 3, finishedAt: '2026-08-27T09:41:15.000Z' },
  )
  const lines = msg.split('\n')
  assert.equal(lines[0], '✅ GSC 색인 요청 · willow-invt')
  assert.equal(lines[1], '18:15 → 18:41 · 26분 · 대화 3번째')
  assert.equal(lines[3], '전체 결과')
})

test('타임아웃 실패는 원인과 다음 행동을 문장으로 알린다', () => {
  const msg = formatFailureReport(
    { project: 'willow-invt', source: 'scheduled:gsc-indexing', started_at: '2026-08-27T09:15:15.000Z' },
    'codex timeout',
    { timeoutMs: 60 * 60 * 1000, finishedAt: '2026-08-27T10:15:15.000Z' },
  )
  assert.ok(msg.startsWith('❌ GSC 색인 요청 · willow-invt'))
  assert.ok(msg.includes('18:15 → 19:15 · 1시간 0분 만에 중단'))
  assert.ok(msg.includes('상한 1시간 0분'))
  assert.ok(msg.includes('실제 상태부터 확인'))
  assert.ok(!msg.includes('codex timeout'), '원문 에러 문자열을 그대로 노출하지 않는다')
})

test('모르는 에러는 지어내지 않고 그대로 전달한다', () => {
  const msg = formatFailureReport(
    { project: 'voicecards', source: 'adhoc', instruction: '덱 통계 확인' },
    'REST 500: upstream 오류',
    { timeoutMs: DEFAULT_CMD_TIMEOUT_MS, finishedAt: '2026-08-27T10:15:15.000Z' },
  )
  assert.ok(msg.includes('REST 500: upstream 오류'))
  assert.ok(msg.startsWith('❌ 덱 통계 확인 · voicecards'))
})

test('소요시간 표기', () => {
  assert.equal(humanDuration(45_000), '45초')
  assert.equal(humanDuration(15 * 60 * 1000), '15분')
  assert.equal(humanDuration(14 * 60 * 1000 + 30_000), '14분 30초')
})
