import assert from 'node:assert/strict'
import test from 'node:test'
import { inferRules, normalizeSubject, isExcludedCandidate, INFER_LIMIT } from './infer.mjs'

test('제목 정규화', () => {
  assert.equal(normalizeSubject('Re: [GS네오텍:사용내역서] 26년 7월 AWS, GWS'), '[GS네오텍:사용내역서] 년 AWS, GWS')
  assert.equal(normalizeSubject('[텐소프트웍스] 8월 월말 보고서 송부'), '[텐소프트웍스] 월말 보고서 송부')
})

test('Controller R3: 월 이름은 완전 매치만 (문자 뒤섞임 방지)', () => {
  assert.equal(normalizeSubject('Marketing report for March'), 'Marketing report for')
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

test('Item 1: 씨앗 subject와 제목 정합 - 같은 상대지만 제목 다르면 규칙 생성', () => {
  // 급여 관련 seed 규칙
  const seed = [{ company: 'tensw', task_key: 'payroll', step: 'request', completion: { kind: 'sent_mail', context: 'tensoftworks', to: 'jjtaxro@daum.net', subject: '급여' } }]

  // 급여 제목은 억제됨 (subject 매치)
  const payrollMail = ['2026-07-22', '2026-08-21', '2026-09-22'].map((d, i) => ({ company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'jjtaxro@daum.net', key: 'sent_mail:jjtaxro@daum.net:급여대장 요청', label: '급여대장 요청', date: d, ref: `m${i}` }))
  assert.equal(inferRules(payrollMail, { existingRules: seed }).length, 0, '급여 제목은 억제됨')

  // 다른 제목은 억제 안됨 (subject 미매치). (C2 뒤로 4대보험 같은 세금·보험 낱말은 씨앗이 맡으므로 다른 제목으로 본다.)
  const otherMail = ['2026-07-15', '2026-08-15', '2026-09-15'].map((d, i) => ({ company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'jjtaxro@daum.net', key: 'sent_mail:jjtaxro@daum.net:법인카드 영수증 송부', label: '법인카드 영수증 송부', date: d, ref: `i${i}` }))
  const rules = inferRules(otherMail, { existingRules: seed })
  assert.equal(rules.length, 1, '법인카드 영수증 송부는 규칙 생성')
  assert.equal(rules[0].completion.to, 'jjtaxro@daum.net')
})

test('Item 3: 회사별 그룹핑 - 같은 key 다른 company는 합쳐지지 않음', () => {
  const sameLabelDifferentCompanies = [
    { company: 'willow', kind: 'sent_mail', context: 'default', to: 'a@b.c', key: 'sent_mail:a@b.c:월간 보고서', label: '월간 보고서', date: '2026-07-10', ref: 'w1' },
    { company: 'willow', kind: 'sent_mail', context: 'default', to: 'a@b.c', key: 'sent_mail:a@b.c:월간 보고서', label: '월간 보고서', date: '2026-08-12', ref: 'w2' },
    { company: 'willow', kind: 'sent_mail', context: 'default', to: 'a@b.c', key: 'sent_mail:a@b.c:월간 보고서', label: '월간 보고서', date: '2026-09-11', ref: 'w3' },
    { company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'a@b.c', key: 'sent_mail:a@b.c:월간 보고서', label: '월간 보고서', date: '2026-07-20', ref: 't1' },
    { company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'a@b.c', key: 'sent_mail:a@b.c:월간 보고서', label: '월간 보고서', date: '2026-08-22', ref: 't2' },
    { company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'a@b.c', key: 'sent_mail:a@b.c:월간 보고서', label: '월간 보고서', date: '2026-09-21', ref: 't3' },
  ]
  const rules = inferRules(sameLabelDifferentCompanies, { existingRules: [] })
  assert.equal(rules.length, 2, '각 회사별 1개씩 규칙 생성')
  const willowRule = rules.find(r => r.company === 'willow')
  const tenswRule = rules.find(r => r.company === 'tensw')
  assert.ok(willowRule)
  assert.ok(tenswRule)
  assert.notEqual(willowRule.task_key, tenswRule.task_key)
})

test('Item 4: 월 경계 순환 거리 - [30, 1, 2] 3개월 패턴 인식', () => {
  const monthBoundaryDates = [
    { company: 'tensw', kind: 'cash', table: 'tensw_mgmt_cash', counterparty: 'X', key: 'cash:tensw_mgmt_cash:X:out', label: 'X 송금', date: '2026-07-30', ref: 'c1' },
    { company: 'tensw', kind: 'cash', table: 'tensw_mgmt_cash', counterparty: 'X', key: 'cash:tensw_mgmt_cash:X:out', label: 'X 송금', date: '2026-08-01', ref: 'c2' },
    { company: 'tensw', kind: 'cash', table: 'tensw_mgmt_cash', counterparty: 'X', key: 'cash:tensw_mgmt_cash:X:out', label: 'X 송금', date: '2026-09-02', ref: 'c3' },
  ]
  const rules = inferRules(monthBoundaryDates, { existingRules: [], spread: 4, minConfidence: 0 })
  assert.equal(rules.length, 1, '[30, 1, 2] 순환 거리 4는 spread 4 안에 포함')
  assert.equal(rules[0].rule.day, 1, '회전 후 중앙값이 1')
})

test('Item 5: 제목 가림 - 민감 정보 마스크된 title', () => {
  const eventsWithPassword = [
    { company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'admin@b.c', key: 'sent_mail:admin@b.c:password reset', label: 'PW: Abc!2345xy 리셋 완료', date: '2026-07-15', ref: 'm1' },
    { company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'admin@b.c', key: 'sent_mail:admin@b.c:password reset', label: 'PW: Abc!2345xy 리셋 완료', date: '2026-08-16', ref: 'm2' },
    { company: 'tensw', kind: 'sent_mail', context: 'tensoftworks', to: 'admin@b.c', key: 'sent_mail:admin@b.c:password reset', label: 'PW: Abc!2345xy 리셋 완료', date: '2026-09-17', ref: 'm3' },
  ]
  const rules = inferRules(eventsWithPassword, { existingRules: [] })
  assert.equal(rules.length, 1)
  assert.ok(rules[0].title.includes('[가림]'), '비밀번호 마스크 포함')
  assert.ok(!rules[0].title.includes('Abc!2345xy'), '원본 비밀번호 없음')
})

// --- C2 가드레일 ---
const monthly = (label, extra = {}) => ['2026-06-10', '2026-07-10', '2026-08-10', '2026-09-10'].map((d, i) => ({ company: 'tensw', kind: 'cash', table: 'tensw_mgmt_cash', counterparty: label, key: `cash:tensw_mgmt_cash:${label}:out`, label, date: d, ref: `${label}${i}`, ...extra }))

test('C2: 세금·개인·잡음 후보는 뺀다, 거래처 사용내역은 남긴다', () => {
  assert.equal(isExcludedCandidate({ kind: 'cash', counterparty: '국세', label: '국세 출금' }), true)
  assert.equal(isExcludedCandidate({ kind: 'received_mail', label: '[미래에셋증권] 김류하님의 거래내역입니다', subject: '[미래에셋증권] 김류하님의 거래내역입니다' }), true)
  assert.equal(isExcludedCandidate({ kind: 'received_mail', label: '관리 콘솔 보안 위험 알림', subject: '관리 콘솔 보안 위험 알림' }), true)
  assert.equal(isExcludedCandidate({ kind: 'received_mail', label: 'GS네오텍 사용내역', subject: 'GS네오텍 사용내역' }), false)
  assert.equal(isExcludedCandidate({ kind: 'received_mail', label: 'New security alert for your account' }), true)
  assert.equal(isExcludedCandidate({ kind: 'sent_mail', label: '대보험 자료 요청' }), true, '4대보험의 숫자가 정규화로 빠져도 씨앗 몫')
})

test('C2: inferRules 는 제외 후보를 규칙으로 만들지 않는다', () => {
  const ev = [...monthly('국세 출금'), ...monthly('[미래에셋증권] 김류하님의 거래내역입니다'), ...monthly('관리 콘솔 보안 위험 알림'), ...monthly('GS네오텍 사용내역')]
  const r = inferRules(ev, { existingRules: [] })
  assert.deepEqual(r.map(x => x.title), ['GS네오텍 사용내역'])
})

test('C2: 신뢰 0.6 미만·3개월 미만은 버리고, 실행당 5개까지 신뢰 높은 순', () => {
  const two = monthly('두달치').slice(0, 2)
  assert.equal(inferRules(two, { existingRules: [] }).length, 0, '2개월은 부족')
  // 3개월·날 차이 4 → 0.75 * 0.6 = 0.45 → 버림
  const loose = ['2026-07-10', '2026-08-14', '2026-09-12'].map((d, i) => ({ company: 'tensw', kind: 'cash', table: 't', counterparty: '느슨', key: 'k-loose', label: '느슨', date: d, ref: `l${i}` }))
  assert.equal(inferRules(loose, { existingRules: [] }).length, 0)
  const many = []
  for (let n = 0; n < 7; n++) {
    const dates = n < 2 ? ['2026-07-10', '2026-08-10', '2026-09-10'] : ['2026-06-10', '2026-07-10', '2026-08-10', '2026-09-10']
    for (const [i, d] of dates.entries()) many.push({ company: 'tensw', kind: 'cash', table: 't', counterparty: `거래처${n}`, key: `k${n}`, label: `거래처${n}`, date: d, ref: `r${n}-${i}` })
  }
  const r = inferRules(many, { existingRules: [] })
  assert.equal(r.length, INFER_LIMIT)
  assert.ok(r.every(x => x.confidence === 1), '4개월(신뢰 1)이 3개월(0.75)보다 먼저')
})
