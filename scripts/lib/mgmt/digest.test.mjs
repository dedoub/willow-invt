import assert from 'node:assert/strict'
import test from 'node:test'
import { richDigest, tidy, groupRows, esc } from './digest.mjs'

test('긴 메일 제목을 줄인다', () => {
  assert.equal(tidy('Google Workspace: willowinvt.com 인보이스가 발행되었습니다'), 'Google Workspace 인보이스(willowinvt.com)')
  assert.equal(tidy('[전자세금계산서 정발행] 지에스네오텍（주） ▶ 주식회사 텐소프트웍스(Ten Softworks Inc.)'), '세금계산서 수신 — 지에스네오텍')
  assert.ok(tidy('가'.repeat(60)).endsWith('…'))
})

test('회사별로 묶고 같은 이름은 날짜만 모은다(텐소 먼저)', () => {
  const g = groupRows([
    { company: 'willow', title: '세무법인 형운 출금', schedule_date: '2026-11-26' },
    { company: 'tensw', title: 'SBI 출금', schedule_date: '2026-11-06' },
    { company: 'tensw', title: 'SBI 출금', schedule_date: '2026-10-06' },
    { company: 'willow', title: '세무법인 형운 출금', schedule_date: '2026-10-26' },
  ])
  assert.equal(g[0].company, 'tensw')
  assert.deepEqual(g[0].items[0], { title: 'SBI 출금', dates: ['2026-10-06', '2026-11-06'] })
  assert.deepEqual(g[1].items[0].dates, ['2026-10-26', '2026-11-26'])
})

test('저녁 요약: 머리말·부문·HTML 이스케이프·빈 날', () => {
  assert.equal(richDigest({ date: '2026-10-02' }), null)
  const s = richDigest({
    date: '2026-10-02',
    done: [{ company: 'tensw', title: '인포테크 협약서 수정 요청안 전달', schedule_date: '2026-10-07' }],
    created: [{ company: 'tensw', title: 'SBI 출금', schedule_date: '2026-10-06' }, { company: 'tensw', title: 'SBI 출금', schedule_date: '2026-11-06' }, { company: 'willow', title: 'ETC 레퍼럴 피 송금 확인', schedule_date: '2026-10-05' }],
    inferred: [{ title: 'SBI 출금', day: 6 }],
    openDecisions: 5,
    failures: ['collect:mail <tensw>'],
  })
  assert.match(s, /^📋 <b>경영관리 저녁 요약<\/b> · 10\/2\(금\)/)
  assert.match(s, /<i>완료 1 · 새 일정 3 · 결정 대기 5<\/i>/)
  assert.match(s, /✅ <b>완료 1<\/b>/)
  assert.match(s, /<u>텐소<\/u>\n• <code>10\/6 · 11\/6<\/code> SBI 출금 <i>×2<\/i>/)
  assert.match(s, /<u>윌로우<\/u>/)
  assert.match(s, /• SBI 출금 — 매월 6일/)
  assert.match(s, /⚖️ <b>대기 중인 결정 5건<\/b>/)
  assert.match(s, /collect:mail &lt;tensw&gt;/)
  assert.equal(esc('a<b>&'), 'a&lt;b&gt;&amp;')
})
