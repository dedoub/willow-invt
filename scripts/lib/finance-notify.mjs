// 재무 자동화 결과를 CEO에게 보낼 메시지로 만든다.
//
// 조용히 실패하면 며칠이 지나도 아무도 모른다. 실제로 CODEF 시절 한도에 걸려 신한
// 계좌·세금계산서·카드가 통째로 안 돌았는데 CEO가 직접 물어보기 전까지 드러나지
// 않았다. 그래서 성공했을 때도 무엇을 몇 건 가져왔는지 함께 보낸다.
//
// 수집기가 남긴 JSON 을 그대로 읽어 세므로, DB 를 다시 묻지 않는다.

export function formatCount(value) {
  return Number(value ?? 0).toLocaleString()
}

/** 오늘 것이 아니면 숫자를 믿을 수 없다 — 지난 실행의 파일이 남아 있을 수 있다. */
export function isFresh(collectedAt, now, hours = 12) {
  if (!collectedAt) return false
  const stamp = Date.parse(collectedAt)
  if (Number.isNaN(stamp)) return false
  return now.getTime() - stamp <= hours * 3_600_000
}

/** 파일 이름 대신 사람이 읽는 이름으로 알린다. */
export function artifactLabels(config) {
  const labels = {
    'latest-tax-invoices.json': '세금계산서',
    'latest-hometax-national-tax.json': '국세',
    'latest-wetax-obligations.json': '지방세',
    'latest-nhis-obligations.json': '4대보험',
    [config.card.approvalsFile]: `${config.card.cardName} 승인내역`,
    [config.card.statementFile]: `${config.card.cardName} 명세서`,
  }
  for (const bank of config.banks) {
    labels[bank.accountsFile] = `${bank.bankName} 계좌`
    labels[bank.transactionsFile] = `${bank.bankName} 거래내역`
  }
  return labels
}

/**
 * 어느 수집 단계가 오늘 결과를 내놓지 못했는지 가린다.
 *
 * 숫자는 여기서 만들지 않는다. 잔액·미납·미수는 오늘 수집이 돌았는지와 무관한
 * 현재 상태라, 파일이 아니라 DB 에서 읽는다.
 */
export function collectionGaps(artifacts, config, now = new Date()) {
  const labels = artifactLabels(config)
  const stale = []
  const missing = []

  for (const [name, label] of Object.entries(labels)) {
    const payload = artifacts[name]
    if (!payload) missing.push(label)
    else if (!isFresh(payload.collected_at, now)) stale.push(label)
  }
  return { stale: [...new Set(stale)], missing: [...new Set(missing)] }
}

/** 원화는 반올림, 외화는 소수 그대로. 4.62 를 5로 적으면 잔액이 아니다. */
export function formatMoney(amount, currency = 'KRW') {
  return currency === 'KRW'
    ? `${formatCount(Math.round(Number(amount ?? 0)))}원`
    : `${Number(amount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`
}

/** 잔액이 이보다 적은 계좌는 이름을 대지 않고 합계에만 넣는다. */
const NAMEABLE_BALANCE = { KRW: 1_000_000, default: 0.01 }
const MAX_NAMED_ACCOUNTS = 3

/**
 * 통화별로 합계를 내고, 돈이 실제로 들어 있는 계좌만 이름을 댄다.
 * 텐소프트웍스는 계좌가 9개인데 대부분 0원이라, 전부 적으면 알림이 잔액 목록이
 * 되어 정작 봐야 할 미납·미수가 묻힌다.
 */
export function balanceLines(balances) {
  const byCurrency = new Map()
  for (const account of balances) {
    const currency = account.currency ?? 'KRW'
    if (!byCurrency.has(currency)) byCurrency.set(currency, [])
    byCurrency.get(currency).push(account)
  }

  // 통화 표기가 라벨에 이미 붙어 있으면 금액에서 또 읽히지 않게 뗀다.
  const shortLabel = label => String(label ?? '').replace(/\s*\([A-Z]{3}\)\s*$/, '').trim()

  const lines = []
  // 원화가 본 계좌이므로 먼저 적는다.
  const currencies = [...byCurrency.keys()].sort((a, b) => (a === 'KRW' ? -1 : b === 'KRW' ? 1 : 0))
  for (const currency of currencies) {
    const accounts = byCurrency.get(currency)
    const total = accounts.reduce((sum, account) => sum + Number(account.balance ?? 0), 0)

    // 계좌가 하나면 합계와 계좌가 같은 숫자다. 두 번 적지 않는다.
    if (accounts.length === 1) {
      lines.push(`잔액 ${shortLabel(accounts[0].label)} ${formatMoney(total, currency)}`)
      continue
    }

    const threshold = NAMEABLE_BALANCE[currency] ?? NAMEABLE_BALANCE.default
    const named = accounts
      .filter(account => Number(account.balance ?? 0) >= threshold)
      .sort((a, b) => Number(b.balance) - Number(a.balance))
      .slice(0, MAX_NAMED_ACCOUNTS)

    if (named.length === 0) {
      lines.push(`잔액 ${formatMoney(total, currency)}`)
      continue
    }
    const detail = named
      .map(account => `${shortLabel(account.label)} ${formatMoney(account.balance, currency)}`)
      .join(' · ')
    const rest = accounts.length - named.length
    lines.push(`잔액 ${formatMoney(total, currency)} (${detail}${rest > 0 ? ` 외 ${rest}개` : ''})`)
  }
  return lines
}

/**
 * 지금 남아 있는 것만 적는다 — 잔액, 나갈 돈(카드 청구·세금 미납), 받을 돈(미수).
 * 몇 건 수집했는지는 [오늘 추가]가 말하므로 여기서 다시 세지 않는다.
 */
export function outstandingLines(outstanding) {
  if (!outstanding) return []
  const lines = []

  lines.push(...balanceLines(outstanding.balances ?? []))

  const billing = outstanding.cardBilling
  if (billing && Number(billing.amount) > 0) {
    lines.push(`카드 청구 ${formatMoney(billing.amount)}${billing.dueDate ? ` (${billing.dueDate} 결제)` : ''}`)
  }

  const tax = outstanding.taxUnpaid
  if (tax && Number(tax.count) > 0) {
    const detail = (tax.bySource ?? []).map(item => `${item.label} ${formatCount(item.count)}`).join(' · ')
    lines.push(`세금 미납 ${formatMoney(tax.amount)}${detail ? ` (${detail})` : ''}`)
  }

  const receivable = outstanding.receivable
  if (receivable && Number(receivable.count) > 0) {
    lines.push(`매출 미수 ${formatMoney(receivable.amount, receivable.currency)} (${formatCount(receivable.count)}건)`)
  }

  return lines
}

/**
 * 오늘 새로 들어온 건수를 줄로 만든다.
 *
 * 산출물 숫자는 조회 기간 전체(카드 30일치 등)라 매일 비슷하게 나온다. 어제와
 * 무엇이 달라졌는지는 이쪽이 말해 준다. 0건이면 굳이 적지 않는다.
 */
export function dailyLines(daily) {
  if (!daily) return []
  const parts = []
  const add = (label, value) => {
    if (Number(value ?? 0) > 0) parts.push(`${label} ${formatCount(value)}건`)
  }
  add('계좌 거래내역', daily.transactions)
  add('카드 승인내역', daily.cardApprovals)
  add('세금계산서', daily.taxInvoices)
  add('세금 고지', daily.taxObligations)
  add('현금관리 반영', daily.cash)

  const lines = []
  lines.push(parts.length > 0 ? parts.join(' · ') : '새로 들어온 내역 없음')
  // 판단 대기는 0이 아니면 사람이 손을 대야 하는 신호라 따로 세운다.
  if (Number(daily.pending ?? 0) > 0) lines.push(`판단 대기 ${formatCount(daily.pending)}건`)
  return lines
}

/**
 * 보낼 메시지 전문. 실패면 어느 단계에서 멈췄는지가 가장 중요한 정보라 맨 앞에 둔다.
 */
export function notifyMessage({ company, label, status, step, artifacts, config, now = new Date(), logFile, daily, outstanding }) {
  const { stale, missing } = collectionGaps(artifacts, config, now)
  const head = status === 'ok'
    ? `✅ ${label} 재무 자동화 완료`
    : `⚠️ ${label} 재무 자동화 실패`

  const body = [head]
  if (status !== 'ok') body.push(`멈춘 단계: ${step || '(알 수 없음)'}`)

  const added = dailyLines(daily)
  if (added.length > 0) {
    body.push('')
    body.push('[오늘 추가]')
    body.push(...added.map(line => `· ${line}`))
  }

  const standing = outstandingLines(outstanding)
  if (standing.length > 0) {
    body.push('')
    body.push('[현재]')
    body.push(...standing.map(line => `· ${line}`))
  }

  // 오래된 파일을 오늘 수집분처럼 세면 문제가 없는 것처럼 보인다. 무엇이 빠졌는지
  // 이름을 대야 어디를 봐야 할지 알 수 있다.
  const notCollected = [...stale, ...missing]
  if (notCollected.length > 0) {
    body.push('')
    body.push(`오늘 못 가져온 항목: ${notCollected.join(', ')}`)
  }

  if (status !== 'ok' && logFile) {
    body.push('')
    body.push(logFile)
  }

  return body.join('\n')
}
