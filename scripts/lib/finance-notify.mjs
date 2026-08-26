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

/**
 * 수집 결과를 한 줄씩으로 요약한다.
 *
 * @param {object} artifacts 파일 이름 → 파싱한 JSON (없으면 null)
 * @param {object} config 회사 레지스트리 항목
 */
export function summaryLines(artifacts, config, now = new Date()) {
  const lines = []
  const stale = []

  const take = (name) => {
    const payload = artifacts[name]
    if (!payload) return null
    if (!isFresh(payload.collected_at, now)) {
      stale.push(name)
      return null
    }
    return payload
  }

  const invoices = take('latest-tax-invoices.json')
  if (invoices) {
    const sales = invoices.sales?.length ?? 0
    const purchases = invoices.purchases?.length ?? 0
    lines.push(`세금계산서 매출 ${formatCount(sales)}건 · 매입 ${formatCount(purchases)}건`)
  }

  for (const bank of config.banks) {
    const accounts = take(bank.accountsFile)
    const transactions = take(bank.transactionsFile)
    if (!accounts && !transactions) continue
    const balance = (accounts?.accounts ?? [])
      .filter(account => (account.currency ?? 'KRW') === 'KRW')
      .reduce((sum, account) => sum + Number(account.balance ?? 0), 0)
    lines.push(
      `${bank.bankName} 계좌 ${formatCount(accounts?.accounts?.length)}개 · `
      + `거래 ${formatCount(transactions?.transactions?.length)}건 · 잔액 ${formatCount(Math.round(balance))}원`,
    )
  }

  const approvals = take(config.card.approvalsFile)
  if (approvals) {
    lines.push(
      `${config.card.cardName} 승인 ${formatCount(approvals.raw_count ?? approvals.rows?.length)}건 · `
      + `순액 ${formatCount(approvals.net_krw_amount)}원`,
    )
  }
  const statement = take(config.card.statementFile)
  if (statement) {
    const billed = statement.billed_amount ?? statement.total_amount
    lines.push(`${config.card.cardName} 청구 ${formatCount(billed)}원 (결제일 ${statement.payment_date ?? statement.payment_due_date ?? '-'})`)
  }

  for (const [name, label] of [
    ['latest-hometax-national-tax.json', '국세'],
    ['latest-wetax-obligations.json', '지방세'],
    ['latest-nhis-obligations.json', '4대보험'],
  ]) {
    const payload = take(name)
    if (!payload) continue
    const items = payload.obligations ?? []
    const unpaid = items.filter(item => item.status === 'unpaid')
    const unpaidTotal = unpaid.reduce((sum, item) => sum + Number(item.amount ?? 0), 0)
    lines.push(unpaid.length > 0
      ? `${label} ${formatCount(items.length)}건 · 미납 ${formatCount(unpaid.length)}건 ${formatCount(unpaidTotal)}원`
      : `${label} ${formatCount(items.length)}건 · 미납 없음`)
  }

  return { lines, stale }
}

/**
 * 보낼 메시지 전문. 실패면 어느 단계에서 멈췄는지가 가장 중요한 정보라 맨 앞에 둔다.
 */
export function notifyMessage({ company, label, status, step, artifacts, config, now = new Date(), logFile }) {
  const { lines, stale } = summaryLines(artifacts, config, now)
  const head = status === 'ok'
    ? `✅ ${label} 재무 자동화 완료`
    : `⚠️ ${label} 재무 자동화 실패`

  const body = [head]
  if (status !== 'ok') body.push(`멈춘 단계: ${step || '(알 수 없음)'}`)

  if (lines.length > 0) {
    body.push('')
    body.push(...lines.map(line => `· ${line}`))
  } else if (status === 'ok') {
    body.push('')
    body.push('· 가져온 내용을 확인하지 못했어요. 로그를 봐야 해요.')
  }

  // 오래된 파일을 오늘 수집분처럼 세면 문제가 없는 것처럼 보인다.
  if (stale.length > 0) {
    body.push('')
    body.push(`오늘 갱신되지 않은 항목 ${stale.length}개가 있어요.`)
  }

  if (status !== 'ok' && logFile) {
    body.push('')
    body.push(logFile)
  }

  return body.join('\n')
}
