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
  const r = redact(`${codes}\n백업 코드니깐 위키에 저장해줘`)
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
test('사업자등록번호는 마스크하지 않음', () => {
  const r = redact('거래처 사업자등록번호 123-45-67890 확인 부탁드립니다')
  assert.equal(r.text, '거래처 사업자등록번호 123-45-67890 확인 부탁드립니다')
  assert.deepEqual(r.found, [])
})
test('비밀번호 라벨 뒤 평문 단어는 마스크하지 않음', () => {
  const r1 = redact('비밀번호는 관리자에게 문의하세요')
  assert.equal(r1.text, '비밀번호는 관리자에게 문의하세요')
  assert.deepEqual(r1.found, [])

  const r2 = redact('비밀번호는 카카오톡으로 전달했습니다')
  assert.equal(r2.text, '비밀번호는 카카오톡으로 전달했습니다')
  assert.deepEqual(r2.found, [])
})
test('키워드 없는 보통 코드 목록은 마스크하지 않음', () => {
  const r = redact('ABCD1234\nEFGH5678\nIJKL9012\n재고 확인 요청')
  assert.equal(r.text, 'ABCD1234\nEFGH5678\nIJKL9012\n재고 확인 요청')
  assert.deepEqual(r.found, [])
})
test('6줄 이상 백업코드는 키워드 없어도 마스크함', () => {
  const codes = ['a1b2c3d4-e5f6a7b8', 'c9d0e1f2-a3b4c5d6', 'e7f8a9b0-c1d2e3f4', '1a2b3c4d-5e6f7a8b', 'e7f8a9b0-c1d2e3f4', '1a2b3c4d-5e6f7a8b'].join('\n')
  const r = redact(codes)
  assert.doesNotMatch(r.text, /a1b2c3d4/)
  assert.ok(r.found.includes('backup_codes'))
})
