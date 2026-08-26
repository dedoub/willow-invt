import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const KEYCHAIN_SERVICE = 'willow.tensw.hometax.certificate'
export const KEYCHAIN_ACCOUNT = 'tensoftworks'

export function financeIdentity(env = process.env) {
  const company = env.FINANCE_COMPANY === 'willow' ? 'willow' : 'tensw'
  if (company === 'willow') {
    return {
      company,
      keychainService: env.FINANCE_KEYCHAIN_SERVICE || 'willow.willow.hometax.certificate',
      keychainAccount: env.FINANCE_KEYCHAIN_ACCOUNT || 'willow-investments',
      certificateOwnerKeyword: env.FINANCE_CERT_OWNER || '윌로우',
    }
  }
  return {
    company,
    keychainService: env.FINANCE_KEYCHAIN_SERVICE || KEYCHAIN_SERVICE,
    keychainAccount: env.FINANCE_KEYCHAIN_ACCOUNT || KEYCHAIN_ACCOUNT,
    certificateOwnerKeyword: env.FINANCE_CERT_OWNER || '텐소',
  }
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

export function selectCorporateCertificate(rows, now = new Date(), ownerKeyword = '텐소') {
  const match = rows
    .map((row, index) => ({ row, index }))
    .find(({ row }) => {
      const owner = String(row.owner ?? '').replaceAll(' ', '')
      return owner.includes(String(ownerKeyword).replaceAll(' ', '')) && expiryTime(row.expiresAt) >= now.getTime()
    })

  if (!match) {
    const ownerLabel = ownerKeyword === '텐소' ? '텐소프트웍스' : ownerKeyword
    throw new Error(`사용 가능한 ${ownerLabel} 인증서를 찾지 못했어요.`)
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

export function certificateImportPaths(env = process.env) {
  const paths = [env.CODEF_HOMETAX_CERT_DER, env.CODEF_HOMETAX_CERT_KEY]
  if (paths.some(value => !value)) {
    throw new Error('홈택스 인증서 파일 경로가 설정되지 않았어요.')
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

export function failureMessage(stage, error) {
  return [
    '[텐소 재무 로컬 수집 실패]',
    `단계: ${stage}`,
    `원인: ${sanitizeError(error)}`,
  ].join('\n')
}
