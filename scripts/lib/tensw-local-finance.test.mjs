import assert from 'node:assert/strict'
import test from 'node:test'

async function loadSubject() {
  try {
    return await import('./tensw-local-finance.mjs')
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return {}
    throw error
  }
}

test('selectCorporateCertificate chooses a valid Tensoftworks certificate', async () => {
  const { selectCorporateCertificate } = await loadSubject()

  assert.equal(typeof selectCorporateCertificate, 'function')
  assert.deepEqual(
    selectCorporateCertificate(
      [
        { owner: '김동욱', purpose: '범용', issuer: 'SignKorea', expiresAt: '2027-05-08' },
        { owner: '주식회사 텐소프트웍스', purpose: '전자세금계산서', issuer: 'TradeSign', expiresAt: '2028-05-19' },
      ],
      new Date('2026-08-25T00:00:00+09:00'),
    ),
    { index: 1, owner: '주식회사 텐소프트웍스' },
  )
})

test('selectCorporateCertificate rejects expired matching certificates', async () => {
  const { selectCorporateCertificate } = await loadSubject()

  assert.equal(typeof selectCorporateCertificate, 'function')
  assert.throws(
    () => selectCorporateCertificate(
      [{ owner: '텐소프트웍스', purpose: '범용', issuer: 'TradeSign', expiresAt: '2025-01-01' }],
      new Date('2026-08-25T00:00:00+09:00'),
    ),
    /사용 가능한 텐소프트웍스 인증서/,
  )
})

test('keychainArgs uses a fixed service and account without exposing a secret', async () => {
  const { keychainArgs } = await loadSubject()

  assert.equal(typeof keychainArgs, 'function')
  assert.deepEqual(keychainArgs(), [
    'find-generic-password',
    '-s',
    'willow.tensw.hometax.certificate',
    '-a',
    'tensoftworks',
    '-w',
  ])
})

test('financeIdentity separates Willow and Tensoftworks Keychain credentials', async () => {
  const { financeIdentity } = await loadSubject()

  const willow = financeIdentity({ FINANCE_COMPANY: 'willow' })
  assert.equal(willow.keychainService, 'willow.willow.hometax.certificate')
  assert.equal(willow.keychainAccount, 'willow-investments')
  // OCR misreads 윌 as 월, so the keyword avoids that syllable.
  assert.equal(willow.certificateOwnerKeyword, '인베스트먼트')
  assert.ok('윌로우인베스트먼트((BizBank)0088'.includes(willow.certificateOwnerKeyword))
  assert.equal(willow.businessNumber, '2058801897')

  const tensw = financeIdentity({ FINANCE_COMPANY: 'tensw' })
  assert.equal(tensw.keychainService, 'willow.tensw.hometax.certificate')
  assert.equal(tensw.keychainAccount, 'tensoftworks')
  assert.equal(tensw.certificateOwnerKeyword, '텐소')
  assert.equal(tensw.businessNumber, '8288800992')
})

test('financeIdentity defaults to Tensoftworks and refuses an unknown company', async () => {
  const { financeIdentity } = await loadSubject()

  assert.equal(financeIdentity({}).company, 'tensw')
  // A typo must not silently write one company's data into the other's tables.
  assert.throws(() => financeIdentity({ FINANCE_COMPANY: 'wilow' }), /등록되지 않은 회사/)
})

test('each company stages into its own tables and banks', async () => {
  const { financeCompany } = await loadSubject()

  const willow = financeCompany('willow')
  const tensw = financeCompany('tensw')
  const shared = Object.keys(willow.tables)
    .filter(key => willow.tables[key] === tensw.tables[key])
  assert.deepEqual(shared, [])

  assert.deepEqual(tensw.banks.map(bank => bank.bankName), ['우리은행', '신한은행'])
  assert.deepEqual(willow.banks.map(bank => bank.bankName), ['신한은행'])
  assert.equal(tensw.card.cardName, '우리카드')
  assert.equal(willow.card.cardName, 'KB카드')
})

test('certificateDirectories picks the company folder out of the NPKI tree', async () => {
  const { certificateDirectories } = await loadSubject()

  const tree = [
    { name: 'cn=주식회사 텐소프트웍스_0001729044,ou=KTNET,o=TradeSign,c=KR', path: '/npki/tradesign/tensw' },
    { name: 'cn=윌로우인베스트먼트((BizBank)0088,ou=BizBank,o=SignKorea,c=KR', path: '/npki/signkorea/willow' },
  ]

  assert.deepEqual(certificateDirectories(tree, '텐소'), ['/npki/tradesign/tensw'])
  assert.deepEqual(certificateDirectories(tree, '인베스트먼트'), ['/npki/signkorea/willow'])
  // 인증서 주체명에는 공백이 들어가므로 공백을 지운 뒤 비교한다.
  assert.deepEqual(certificateDirectories(tree, '주식회사 텐소프트웍스'), ['/npki/tradesign/tensw'])
  assert.deepEqual(certificateDirectories(tree, '아크로스'), [])
})

test('failureMessage includes the stage and sanitized error only', async () => {
  const { failureMessage } = await loadSubject()

  assert.equal(typeof failureMessage, 'function')
  assert.equal(
    failureMessage('certificate-login', new Error('password=secret123\nfailed')),
    '[텐소프트웍스 재무 로컬 수집 실패]\n단계: certificate-login\n원인: password=[REDACTED] failed',
  )
  assert.equal(
    failureMessage('certificate-login', new Error('boom'), '윌로우인베스트먼트'),
    '[윌로우인베스트먼트 재무 로컬 수집 실패]\n단계: certificate-login\n원인: boom',
  )
})

test('certificateRowsFromCells groups the four visible certificate columns', async () => {
  const { certificateRowsFromCells } = await loadSubject()

  assert.equal(typeof certificateRowsFromCells, 'function')
  assert.deepEqual(
    certificateRowsFromCells([
      '주식회사 텐소프트웍스', '전자세금계산서', 'TradeSignCA4', '2028-05-19',
      '김동욱', '범용', 'SignKorea CA4', '2027-05-08',
    ]),
    [
      { owner: '주식회사 텐소프트웍스', purpose: '전자세금계산서', issuer: 'TradeSignCA4', expiresAt: '2028-05-19' },
      { owner: '김동욱', purpose: '범용', issuer: 'SignKorea CA4', expiresAt: '2027-05-08' },
    ],
  )
})

test('isHometaxReadyUrl waits for the WebSquare main route', async () => {
  const { isHometaxReadyUrl } = await loadSubject()

  assert.equal(typeof isHometaxReadyUrl, 'function')
  assert.equal(isHometaxReadyUrl('https://www.hometax.go.kr/'), false)
  assert.equal(
    isHometaxReadyUrl('https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml'),
    true,
  )
})

test('certificateImportPaths reads the NPKI folder, falling back to the configured pair', async () => {
  const { certificateImportPaths } = await loadSubject()
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')

  // A home with a real NPKI tree resolves the company's own certificate.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'npki-'))
  const dir = path.join(home, 'Library/Preferences/NPKI/TradeSign/User', 'cn=주식회사 텐소프트웍스_0001')
  fs.mkdirSync(dir, { recursive: true })
  assert.deepEqual(certificateImportPaths({ HOME: home, FINANCE_COMPANY: 'tensw' }), [
    path.join(dir, 'signCert.der'),
    path.join(dir, 'signPri.key'),
  ])

  // A home without one falls back to the pair CODEF left in the environment.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'npki-empty-'))
  fs.mkdirSync(path.join(empty, 'Library/Preferences/NPKI'), { recursive: true })
  assert.deepEqual(certificateImportPaths({
    HOME: empty,
    CODEF_HOMETAX_CERT_DER: '/secure/signCert.der',
    CODEF_HOMETAX_CERT_KEY: '/secure/signPri.key',
  }), ['/secure/signCert.der', '/secure/signPri.key'])

  assert.throws(() => certificateImportPaths({ HOME: empty }), /인증서 파일을 NPKI 폴더에서 찾지 못했어요/)

  fs.rmSync(home, { recursive: true, force: true })
  fs.rmSync(empty, { recursive: true, force: true })
})

test('taxInvoiceFromCells maps a sales invoice to the staging shape', async () => {
  const { taxInvoiceFromCells } = await loadSubject()
  const cells = [
    '', 'summary', '2026-08-23', '2026-08-23', '2026-08-23',
    '312-82-02552', '828-88-00992', '', '독립기념관', '한시준', '유지보수',
    '3,300,000', '3,000,000', '300,000', 'approval-1', '일반', '인터넷발급',
    '', '청구', 'supplier@example.com', 'buyer@example.com', '',
  ]

  assert.deepEqual(taxInvoiceFromCells(cells, 'sales'), {
    transe_type: 'sales',
    reporting_date: '2026-08-23',
    issue_date: '2026-08-23',
    send_date: '2026-08-23',
    contractor_reg_number: '312-82-02552',
    supplier_reg_number: '828-88-00992',
    contractor_company: '독립기념관',
    supplier_company: null,
    contractor_name: '한시준',
    supplier_name: null,
    rep_items: '유지보수',
    total_amount: 3300000,
    supply_amount: 3000000,
    tax_amount: 300000,
    approval_no: 'approval-1',
    invoice_kind: '일반',
    issue_form: '인터넷발급',
    note: null,
    receipt_or_charge: '청구',
    supplier_email: 'supplier@example.com',
    contractor_email: 'buyer@example.com',
  })
})

test('parseWooriAccountCardText maps a deposit account card', async () => {
  const { parseWooriAccountCardText } = await loadSubject()

  assert.equal(typeof parseWooriAccountCardText, 'function')
  assert.deepEqual(parseWooriAccountCardText([
    '입출금',
    '메인통장우리큐브(CUBE)기업자유예금',
    '1005-403-461450 계좌번호 클립보드복사',
    '계좌잔액',
    '1,234,567원',
    '거래내역조회',
  ].join('\n')), {
    account_type: 'deposit',
    account: '1005403461450',
    account_display: '1005-403-461450',
    account_label: '우리 1005-403-461450',
    product_name: '메인통장우리큐브(CUBE)기업자유예금',
    balance: 1234567,
    suspended: false,
  })
})

test('parseWooriAccountCardText identifies suspended and loan accounts', async () => {
  const { parseWooriAccountCardText } = await loadSubject()

  assert.equal(parseWooriAccountCardText([
    '입출금 거래중지계좌', '기업자유예금', '1005-704-524272 계좌번호 클립보드복사',
    '계좌잔액', '5,000원', '거래내역조회',
  ].join('\n')).suspended, true)
  assert.equal(parseWooriAccountCardText([
    '대출', '기업운전일반대출', '1005-123-456789 계좌번호 클립보드복사',
    '만기일 2027.08.25', '계좌잔액', '300,000,000원', '거래내역조회',
  ].join('\n')).account_type, 'loan')
})

test('parseWooriTransactionBodyText parses accessible transaction rows', async () => {
  const { parseWooriTransactionBodyText } = await loadSubject()
  const body = [
    '1행 거래일시열', '2026.08.25 13:24:10',
    '1행 적요열', '모바일',
    '1행 기재내용열', '장비구입비환급',
    '1행 지급(원)열', '1,200,000',
    '1행 입금(원)열', '0',
    '1행 거래후 잔액(원)열', '3,456,789',
    '1행 취급점열', '신림역금융센터',
    '1행 메모열',
    '1행 수표·어음·증권금액(원)열', '0',
    '2행 거래일시열', '총 1건',
  ].join('\n')

  assert.deepEqual(parseWooriTransactionBodyText(body), [{
    tr_date: '2026-08-25',
    tr_time: '13:24:10',
    desc1: '모바일',
    desc2: '장비구입비환급',
    desc3: '신림역금융센터',
    desc4: null,
    amount_out: 1200000,
    amount_in: 0,
    balance_after: 3456789,
  }])
})

test('wooriTransactionFingerprint is stable and account-specific', async () => {
  const { wooriTransactionFingerprint } = await loadSubject()
  const row = {
    organization: '0020', account: '1005403461450', tr_date: '2026-08-25', tr_time: '13:24:10',
    amount_in: 0, amount_out: 1200000, balance_after: 3456789,
    desc1: '모바일', desc2: '장비구입비환급', desc3: '신림역금융센터', desc4: null,
  }

  assert.equal(wooriTransactionFingerprint(row), wooriTransactionFingerprint({ ...row }))
  assert.notEqual(wooriTransactionFingerprint(row), wooriTransactionFingerprint({ ...row, account: '1005903636048' }))
  assert.match(wooriTransactionFingerprint(row), /^[a-f0-9]{40}$/)
})

test('parseShinhanAccountBodyText maps the single corporate account', async () => {
  const { parseShinhanAccountBodyText } = await loadSubject()
  const body = [
    '자유입출예금', '총1건', '2026.08.25 15:41:58현재',
    '1', '기업자유예금', '140-013-150883', '계좌번호 선택',
    '(주)텐소프트웍스', '41,874,940', '41,874,940', '2020.08.03', '2026.08.24',
  ].join('\n')

  assert.deepEqual(parseShinhanAccountBodyText(body), {
    account_type: 'deposit',
    account: '140013150883',
    account_display: '140-013-150883',
    account_label: '신한 140-013-150883',
    product_name: '기업자유예금',
    balance: 41874940,
    available_balance: 41874940,
    suspended: false,
  })
})

test('parseShinhanTransactionBodyText parses accessible transaction rows', async () => {
  const { parseShinhanTransactionBodyText } = await loadSubject()
  const body = [
    '거래내역', '조회 2건', '조회기간 : 2026.08.11 ~ 2026.08.25',
    '1', '1행 거래일시 2026.08.24 18:27:01 입금액 0 출금액 287,068 내용 중진공대출\t2026.08.24 18:27:01\tFB자동\t0\t287,068\t중진공대출\t41,874,940\t공기\t\t\t메모 팝업 열기',
    '2', '2행 거래일시 2026.08.20 10:26:47 입금액 0 출금액 10,000,500 내용 운영비이체\t2026.08.20 10:26:47\tBZ뱅크\t0\t10,000,500\t운영비이체\t42,162,008\t테헤금\t\t\t메모 팝업 열기',
    '합계',
  ].join('\n')

  assert.deepEqual(parseShinhanTransactionBodyText(body), [
    {
      tr_date: '2026-08-24', tr_time: '18:27:01', desc1: 'FB자동', desc2: '중진공대출',
      desc3: '공기', desc4: null, amount_in: 0, amount_out: 287068, balance_after: 41874940,
    },
    {
      tr_date: '2026-08-20', tr_time: '10:26:47', desc1: 'BZ뱅크', desc2: '운영비이체',
      desc3: '테헤금', desc4: null, amount_in: 0, amount_out: 10000500, balance_after: 42162008,
    },
  ])
})

test('accountLabelForTransaction resolves the required staging label', async () => {
  const { accountLabelForTransaction } = await loadSubject()
  assert.equal(
    accountLabelForTransaction(
      { account: '140013150883' },
      [{ account: '140013150883', account_label: '신한 140-013-150883' }],
    ),
    '신한 140-013-150883',
  )
  assert.throws(
    () => accountLabelForTransaction({ account: 'missing' }, []),
    /계좌 라벨/,
  )
})

test('transactionIdentity matches the same transaction across providers', async () => {
  const { transactionIdentity } = await loadSubject()
  const local = {
    organization: '0088', account: '140013150883', tr_date: '2026-08-24', tr_time: '18:27:01',
    amount_in: 0, amount_out: 287068, desc1: 'FB자동', desc2: '중진공대출',
  }
  const codef = { ...local, desc1: null, desc2: 'FB자동', desc3: '중진공대출' }

  assert.equal(transactionIdentity(local), transactionIdentity(codef))
  assert.notEqual(transactionIdentity(local), transactionIdentity({ ...codef, amount_out: 287069 }))
})

test('taxInvoiceMonths lists every month between two YYYY-MM bounds', async () => {
  const { taxInvoiceMonths } = await loadSubject()

  assert.deepEqual(taxInvoiceMonths('2026-01', '2026-03'), [
    { year: '2026', month: '01' },
    { year: '2026', month: '02' },
    { year: '2026', month: '03' },
  ])
  assert.deepEqual(taxInvoiceMonths('2025-11', '2026-01'), [
    { year: '2025', month: '11' },
    { year: '2025', month: '12' },
    { year: '2026', month: '01' },
  ])
  assert.deepEqual(taxInvoiceMonths('2026-09', '2026-09'), [{ year: '2026', month: '09' }])
  assert.throws(() => taxInvoiceMonths('2026-10', '2026-09'))
  assert.throws(() => taxInvoiceMonths('2026-1', '2026-09'))
})
