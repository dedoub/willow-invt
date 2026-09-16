import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const KEYCHAIN_SERVICE = 'willow.tensw.hometax.certificate'
export const KEYCHAIN_ACCOUNT = 'tensoftworks'

// Everything that differs between the two companies lives here, so a collector
// or importer only has to ask which company it is running for.
//
// 텐소프트웍스 banks with 우리·신한; 윌로우인베스트먼트 banks with 신한 alone,
// carrying its spend on KB카드. Both file the same national taxes, local taxes
// and social insurance, so those three sites are shared.
//
// 두 회사 모두 SignKorea BizBank 인증서로 서명한다. 텐소는 2026-09-16 에 TradeSign
// 범용(주식회사 텐소프트웍스)에서 갈아탔다(CEO). 신한이 발급하는 BizBank 인증서의
// CN 은 회사명이 아니라 사용자 이름을 담아서, 텐소 것은 "주식회사 승인자(BizBank)…"
// 로 시작한다 — 이름만 보면 어느 회사인지 알 수 없으므로 '승인자' 로 고른다.
//
// 그래서 발급기관은 더 이상 두 회사를 가르지 못한다. certificateRowKeywords 에서
// 발급기관 예비 키워드를 뺀 이유다 — 이름이 안 읽히면 아무 줄이나 고르느니 실패하는
// 편이 낫다. 남의 인증서에 비밀번호를 넣으면 그 인증서의 오류 횟수가 오른다(5회 잠김).
//
// The staging tables carry the CODEF name only for 텐소프트웍스, where they were
// created while that vendor was still in use. 윌로우 was wired up after CODEF was
// retired (2026-08-25), so its tables are named for what they hold.
const COMPANIES = Object.freeze({
  tensw: Object.freeze({
    company: 'tensw',
    label: '텐소프트웍스',
    keychainService: 'willow.tensw.hometax.certificate',
    keychainAccount: 'tensoftworks',
    // 인증서 CN 에 회사명이 없다. 신한 인증서 창은 이름을 "주식회사 승인..." 으로 잘라
    // 끝의 '자' 를 지우므로 '승인자' 로는 걸리지 않는다(2026-09-16 실측). 매칭은 양쪽
    // 공백을 지우고 하니 '주식회사 승인' 이면 잘린 줄도, 안 잘린 홈택스 DOM 도 걸린다.
    // 맨 '승인' 하나로 두지 않는 것은 인증서 창 밖에서 흔한 낱말이기 때문이다.
    certificateOwnerKeyword: '주식회사 승인',
    certificateRowKeywords: Object.freeze(['주식회사 승인']),
    businessNumber: '8288800992',
    // 로그인한 화면이 이 회사임을 알아보는 표시. 공용 포털에서 남의 세션을
    // 물고 수집하는 사고를 막는다.
    sessionMarkers: Object.freeze(['텐소프트웍스', 'Ten Softworks']),
    tables: Object.freeze({
      cash: 'tensw_mgmt_cash',
      bankBalances: 'tensw_mgmt_bank_balances',
      transactions: 'tensw_codef_transactions',
      taxInvoices: 'tensw_codef_tax_invoices',
      cardApprovals: 'tensw_codef_card_approvals',
      cardBilling: 'tensw_codef_card_billing',
    }),
    banks: Object.freeze([
      Object.freeze({
        bankName: '우리은행',
        source: 'woori-local-chrome',
        organization: '0020',
        expectedAccounts: 8,
        accountsFile: 'latest-woori-accounts.json',
        transactionsFile: 'latest-woori-transactions.json',
      }),
      Object.freeze({
        bankName: '신한은행',
        source: 'shinhan-local-chrome',
        organization: '0088',
        // 전체계좌 조회의 모든 표를 읽기 시작하면서 외화·정기 계좌가 함께 잡힐 수
        // 있어 수를 고정하지 않는다. 우리은행은 배치가 확인돼 있어 8개를 지킨다.
        expectedAccounts: null,
        accountsFile: 'latest-shinhan-accounts.json',
        transactionsFile: 'latest-shinhan-transactions.json',
      }),
    ]),
    card: Object.freeze({
      site: 'woori-card',
      cardName: '우리카드',
      organization: '0309',
      approvalsFile: 'latest-woori-card-approvals.json',
      statementFile: 'latest-woori-card-statement.json',
    }),
  }),

  willow: Object.freeze({
    company: 'willow',
    label: '윌로우인베스트먼트',
    keychainService: 'willow.willow.hometax.certificate',
    keychainAccount: 'willow-investments',
    // OCR reads 윌 as 월 in the certificate list, so the row is matched on a part
    // of the name that survives it. It still matches the DOM text on 홈택스.
    certificateOwnerKeyword: '인베스트먼트',
    // 'SignKorea' 는 예비 키워드로 못 쓴다 — 텐소도 SignKorea 라 두 줄 다 걸린다.
    certificateRowKeywords: Object.freeze(['인베스트']),
    businessNumber: '2058801897',
    sessionMarkers: Object.freeze(['윌로우인베스트먼트', '월로우인베스트먼트']),
    tables: Object.freeze({
      cash: 'willow_mgmt_cash',
      bankBalances: 'willow_mgmt_bank_balances',
      transactions: 'willow_finance_transactions',
      taxInvoices: 'willow_finance_tax_invoices',
      cardApprovals: 'willow_finance_card_approvals',
      cardBilling: 'willow_finance_card_billing',
    }),
    banks: Object.freeze([
      Object.freeze({
        bankName: '신한은행',
        source: 'shinhan-local-chrome',
        organization: '0088',
        // Left open until a real collection shows how the 외화 account renders in
        // the grid; 텐소 keeps its count because that grid is known.
        expectedAccounts: null,
        accountsFile: 'latest-shinhan-accounts.json',
        transactionsFile: 'latest-shinhan-transactions.json',
      }),
    ]),
    card: Object.freeze({
      site: 'kb-card',
      cardName: 'KB카드',
      organization: '0301',
      approvalsFile: 'latest-kb-card-approvals.json',
      statementFile: 'latest-kb-card-statement.json',
    }),
  }),
})

export function financeCompanies() {
  return Object.keys(COMPANIES)
}

export function financeIdentity(env = process.env) {
  const requested = env.FINANCE_COMPANY ?? 'tensw'
  const base = COMPANIES[requested]
  if (!base) throw new Error(`등록되지 않은 회사예요: ${requested}`)
  return {
    ...base,
    keychainService: env.FINANCE_KEYCHAIN_SERVICE || base.keychainService,
    keychainAccount: env.FINANCE_KEYCHAIN_ACCOUNT || base.keychainAccount,
    certificateOwnerKeyword: env.FINANCE_CERT_OWNER || base.certificateOwnerKeyword,
    businessNumber: env.FINANCE_BUSINESS_NUMBER || base.businessNumber,
  }
}

/** 회사를 인자로 고르는 적재 스크립트용 — 환경변수를 거치지 않는다. */
export function financeCompany(company) {
  const base = COMPANIES[company]
  if (!base) throw new Error(`등록되지 않은 회사예요: ${company}`)
  return base
}

export function keychainArgs(env = process.env) {
  const identity = financeIdentity(env)
  return [
    'find-generic-password',
    '-s',
    identity.keychainService,
    '-a',
    identity.keychainAccount,
    '-w',
  ]
}

export async function readCertificatePassword(env = process.env) {
  try {
    const { stdout } = await execFileAsync('/usr/bin/security', keychainArgs(env), {
      encoding: 'utf8',
    })
    const password = stdout.trim()
    if (!password) throw new Error('Keychain password is empty')
    return password
  } catch {
    throw new Error(
      '홈택스 인증서 비밀번호가 Keychain에 없어요. scripts/setup-tensw-finance-keychain.sh를 먼저 실행하세요.',
    )
  }
}

function expiryTime(value) {
  const normalized = String(value ?? '').trim().replaceAll('.', '-')
  const parsed = Date.parse(`${normalized}T23:59:59+09:00`)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** 목록에 이 회사의 살아 있는 인증서가 있는가. 없으면 가져오기부터 해야 한다. */
export function hasUsableCertificate(rows, now = new Date(), ownerKeyword = '텐소') {
  const wanted = String(ownerKeyword).replaceAll(' ', '')
  return rows.some(row =>
    String(row.owner ?? '').replaceAll(' ', '').includes(wanted) && expiryTime(row.expiresAt) >= now.getTime())
}

export function selectCorporateCertificate(rows, now = new Date(), ownerKeyword = '텐소') {
  const match = rows
    .map((row, index) => ({ row, index }))
    .find(({ row }) => {
      const owner = String(row.owner ?? '').replaceAll(' ', '')
      return owner.includes(String(ownerKeyword).replaceAll(' ', '')) && expiryTime(row.expiresAt) >= now.getTime()
    })

  if (!match) {
    // 무엇이 보였는지 함께 적는다. 인증서를 바꾸면 화면에 뜨는 이름도 바뀌는데, 예전
    // 메시지로는 이름이 안 맞은 것인지 기한이 지난 것인지조차 알 수 없었다(2026-09-16).
    const seen = rows
      .map(row => `${String(row.owner ?? '').trim()}(${String(row.expiresAt ?? '').trim()})`)
      .slice(0, 12)
    const listed = seen.length > 0 ? ` 목록: ${seen.join(' | ')}` : ' 목록이 비어 있었어요.'
    throw new Error(`사용 가능한 ${ownerKeyword} 인증서를 찾지 못했어요.${listed}`)
  }

  return { index: match.index, owner: match.row.owner }
}

export function certificateRowsFromCells(cells) {
  const values = cells.map(value => String(value ?? '').trim())
  const rows = []
  for (let index = 0; index + 3 < values.length; index += 4) {
    rows.push({
      owner: values[index],
      purpose: values[index + 1],
      issuer: values[index + 2],
      expiresAt: values[index + 3],
    })
  }
  return rows
}

export function isHometaxReadyUrl(value) {
  try {
    const url = new URL(value)
    return url.pathname.endsWith('/websquare/websquare.html')
      && url.searchParams.get('w2xPath') === '/ui/pp/index_pp.xml'
  } catch {
    return false
  }
}

// NPKI stores one directory per certificate, named after its subject, under a
// folder per issuer. Finding the company's directory by its name survives a
// reissue — the CN carries a serial that changes every year — and keeps the two
// companies' keys apart without spelling either path out.
export function certificateDirectories(root, ownerKeyword) {
  const wanted = String(ownerKeyword).replaceAll(' ', '')
  return root
    .filter(entry => entry.name.replaceAll(' ', '').includes(wanted))
    .map(entry => entry.path)
}

function npkiUserDirectories(home) {
  const seen = new Map()
  for (const issuer of fs.readdirSync(path.join(home, 'Library/Preferences/NPKI'), { withFileTypes: true })) {
    if (!issuer.isDirectory()) continue
    // The folder is spelled User on some issuers and USER on others. macOS is
    // case-insensitive, so both spellings resolve to one directory and the real
    // path is what tells two certificates apart.
    for (const name of ['User', 'USER']) {
      const dir = path.join(home, 'Library/Preferences/NPKI', issuer.name, name)
      if (!fs.existsSync(dir)) continue
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        // realpath keeps the spelling it was handed, so the key is case-folded.
        const resolved = path.join(dir, entry.name)
        const key = resolved.toLowerCase()
        if (!seen.has(key)) seen.set(key, { name: entry.name, path: resolved })
      }
    }
  }
  return [...seen.values()]
}

export function certificateImportPaths(env = process.env) {
  const identity = financeIdentity(env)
  const home = env.HOME || os.homedir()

  const matches = certificateDirectories(npkiUserDirectories(home), identity.certificateOwnerKeyword)
  if (matches.length === 1) {
    return [path.join(matches[0], 'signCert.der'), path.join(matches[0], 'signPri.key')]
  }
  if (matches.length > 1) {
    throw new Error(`${identity.label} 인증서 폴더가 여러 개예요. 오래된 인증서를 정리해 주세요.`)
  }

  // 텐소프트웍스는 CODEF 시절 지정한 경로가 아직 .env.local 에 남아 있다. 그 경로는
  // 2026-09-16 에 내린 TradeSign 인증서를 가리키므로, 폴더를 못 찾았다고 그대로 쓰면
  // 바꾼 인증서 대신 옛 인증서로 서명하게 된다 — 조용히 틀리는 대신 멈춘다.
  const paths = [env.CODEF_HOMETAX_CERT_DER, env.CODEF_HOMETAX_CERT_KEY]
  if (paths.some(value => !value)) {
    throw new Error(`${identity.label} 인증서 파일을 NPKI 폴더에서 찾지 못했어요.`)
  }
  const named = paths.map(value => ({ name: value, path: value }))
  if (certificateDirectories(named, identity.certificateOwnerKeyword).length !== paths.length) {
    throw new Error(
      `${identity.label} 인증서 폴더를 찾지 못했고, .env.local 의 CODEF_HOMETAX_CERT_* 는 `
      + `다른 인증서('${identity.certificateOwnerKeyword}' 아님)라 쓰지 않았어요.`,
    )
  }
  return paths
}

function amount(value) {
  return Number(String(value ?? '').replace(/[^\d-]/g, '')) || 0
}

export function parseWooriAccountCardText(text) {
  const lines = String(text ?? '').split('\n').map(value => value.trim()).filter(Boolean)
  const accountMatch = lines.join(' ').match(/(\d{4}-\d{3}-\d{6})/)
  const balanceIndex = lines.findIndex(value => value === '계좌잔액')
  if (!accountMatch || balanceIndex < 0 || !lines[balanceIndex + 1]) {
    throw new Error('우리은행 계좌 카드 형식이 달라졌어요.')
  }

  const accountDisplay = accountMatch[1]
  return {
    account_type: lines[0].startsWith('대출') ? 'loan' : 'deposit',
    account: accountDisplay.replaceAll('-', ''),
    account_display: accountDisplay,
    account_label: `우리 ${accountDisplay}`,
    product_name: lines[1],
    balance: amount(lines[balanceIndex + 1]),
    suspended: lines[0].includes('거래중지계좌'),
  }
}

export function parseWooriTransactionBodyText(text) {
  const lines = String(text ?? '').split('\n').map(value => value.trim()).filter(Boolean)
  const rows = []
  const rowLabel = /^\d+행 .*열$/

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\d+)행 거래일시열$/)
    if (!match) continue
    const rowNumber = match[1]
    const dateTime = lines[index + 1] ?? ''
    const dateMatch = dateTime.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}:\d{2}:\d{2})$/)
    if (!dateMatch) continue

    const valueFor = label => {
      const labelIndex = lines.indexOf(`${rowNumber}행 ${label}열`, index)
      if (labelIndex < 0) return null
      const value = lines[labelIndex + 1]
      return !value || rowLabel.test(value) ? null : value
    }

    rows.push({
      tr_date: `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
      tr_time: dateMatch[4],
      desc1: valueFor('적요'),
      desc2: valueFor('기재내용'),
      desc3: valueFor('취급점'),
      desc4: valueFor('메모'),
      amount_out: amount(valueFor('지급(원)')),
      amount_in: amount(valueFor('입금(원)')),
      balance_after: amount(valueFor('거래후 잔액(원)')),
    })
  }

  return rows
}

export function parseShinhanAccountBodyText(text) {
  const normalized = String(text ?? '').replaceAll('\t', '\n')
  const match = normalized.match(
    /기업자유예금\s+(\d{3}-\d{3}-\d{6})\s+계좌번호 선택\s+[^\n]+\s+([\d,]+)\s+([\d,]+)/,
  )
  if (!match) throw new Error('신한은행 계좌 조회 형식이 달라졌어요.')

  return {
    account_type: 'deposit',
    account: match[1].replaceAll('-', ''),
    account_display: match[1],
    account_label: `신한 ${match[1]}`,
    product_name: '기업자유예금',
    balance: amount(match[2]),
    available_balance: amount(match[3]),
    suspended: false,
  }
}

export function parseShinhanTransactionBodyText(text) {
  const lines = String(text ?? '').replaceAll('\t', '\n').split('\n').map(value => value.trim()).filter(Boolean)
  const rows = []

  for (let index = 0; index < lines.length; index += 1) {
    const summary = lines[index].match(
      /^(\d+)행 거래일시 (\d{4})\.(\d{2})\.(\d{2}) (\d{2}:\d{2}:\d{2}) 입금액 ([\d,]+) 출금액 ([\d,]+)/,
    )
    if (!summary) continue
    const dateTime = `${summary[2]}.${summary[3]}.${summary[4]} ${summary[5]}`
    const detailIndex = lines.indexOf(dateTime, index + 1)
    if (detailIndex < 0) continue

    rows.push({
      tr_date: `${summary[2]}-${summary[3]}-${summary[4]}`,
      tr_time: summary[5],
      desc1: lines[detailIndex + 1] || null,
      desc2: lines[detailIndex + 4] || null,
      desc3: lines[detailIndex + 6] || null,
      desc4: null,
      amount_in: amount(lines[detailIndex + 2]),
      amount_out: amount(lines[detailIndex + 3]),
      balance_after: amount(lines[detailIndex + 5]),
    })
  }

  return rows
}

export function wooriTransactionFingerprint(row) {
  const parts = [
    row.organization,
    row.account,
    row.tr_date,
    row.tr_time ?? '',
    row.amount_in ?? 0,
    row.amount_out ?? 0,
    row.balance_after ?? '',
    row.desc1 ?? '',
    row.desc3 ?? '',
  ]
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex')
}

export function transactionIdentity(row) {
  return [
    row.organization,
    row.account,
    row.tr_date,
    row.tr_time ?? '',
    row.amount_in ?? 0,
    row.amount_out ?? 0,
  ].join('|')
}

export function accountLabelForTransaction(transaction, accounts) {
  const account = accounts.find(candidate => candidate.account === transaction.account)
  if (!account?.account_label) throw new Error(`계좌 라벨을 찾지 못했어요: ${transaction.account}`)
  return account.account_label
}

// The 홈택스 목록조회 screen only answers one month at a time (월별). A backfill
// walks every month between two YYYY-MM bounds, inclusive.
export function taxInvoiceMonths(from, to) {
  const pattern = /^(\d{4})-(\d{2})$/
  const start = pattern.exec(from)
  const end = pattern.exec(to)
  if (!start || !end) throw new Error('조회 월은 YYYY-MM 형식이어야 해요.')
  let cursor = Number(start[1]) * 12 + Number(start[2]) - 1
  const last = Number(end[1]) * 12 + Number(end[2]) - 1
  if (cursor > last) throw new Error('조회 시작 월이 종료 월보다 늦어요.')
  const months = []
  for (; cursor <= last; cursor += 1) {
    months.push({ year: String(Math.floor(cursor / 12)), month: String((cursor % 12) + 1).padStart(2, '0') })
  }
  return months
}

export function taxInvoiceFromCells(cells, transeType) {
  if (cells.length < 22) throw new Error('홈택스 세금계산서 행 형식이 달라졌어요.')
  const isPurchase = transeType === 'purchase'
  return {
    transe_type: transeType,
    reporting_date: cells[2],
    issue_date: cells[3],
    send_date: cells[4],
    contractor_reg_number: cells[5] || null,
    supplier_reg_number: cells[6] || null,
    contractor_company: isPurchase ? null : cells[8] || null,
    supplier_company: isPurchase ? cells[8] || null : null,
    contractor_name: isPurchase ? null : cells[9] || null,
    supplier_name: isPurchase ? cells[9] || null : null,
    rep_items: cells[10] || null,
    total_amount: amount(cells[11]),
    supply_amount: amount(cells[12]),
    tax_amount: amount(cells[13]),
    approval_no: cells[14] || null,
    invoice_kind: cells[15] || null,
    issue_form: cells[16] || null,
    note: cells[17] || null,
    receipt_or_charge: cells[18] || null,
    supplier_email: cells[19] || null,
    contractor_email: cells[20] || null,
  }
}

function sanitizeError(error) {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/(password\s*=\s*)\S+/gi, '$1[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

export function failureMessage(stage, error, company = financeIdentity().label) {
  return [
    `[${company} 재무 로컬 수집 실패]`,
    `단계: ${stage}`,
    `원인: ${sanitizeError(error)}`,
  ].join('\n')
}
