const signed = (value, digits = 1, unit = '%') =>
  `${value > 0 ? '+' : ''}${value.toFixed(digits)}${unit}`

function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

export function trendSnapshot(trend = []) {
  const valid = trend.filter(point => Number.isFinite(point?.gapRate))
  const latest = valid.at(-1)
  if (!latest) return null

  const target = shiftDate(latest.date, 7)
  const previous = valid.filter(point => point.date <= target).at(-1) ?? null
  return {
    date: latest.date,
    gap: latest.gapRate,
    pairs: latest.pairs ?? 0,
    deals: latest.deals ?? 0,
    previousDate: previous?.date ?? null,
    change: previous ? Math.round((latest.gapRate - previous.gapRate) * 10) / 10 : null,
  }
}

function direction(gap) {
  if (gap <= -5) return '매물 호가가 실거래보다 크게 낮아 약세예요.'
  if (gap <= -3) return '매물 호가가 실거래보다 낮아 약세예요.'
  if (gap < 3) return '호가와 실거래가가 대체로 균형이에요.'
  if (gap < 5) return '호가가 실거래보다 조금 높아 강보합이에요.'
  return '호가가 실거래보다 높아 강세예요.'
}

function headline(gap) {
  if (gap <= -3) return '약세'
  if (gap < 3) return '보합'
  return '강세'
}

function isUnreliable(sample) {
  return sample.pairs < 5
    || sample.deals < 10
    || Math.abs(sample.change ?? 0) >= 15
    || Math.abs(sample.gap) >= 30
}

function metricLine(label, sample) {
  const change = sample.change == null ? '' : ` · 7일 ${signed(sample.change, 1, '%p')}`
  return `· ${label} ${signed(sample.gap)}${change} — ${direction(sample.gap)}`
}

export function buildRealEstateReport({ date, overall, fifty, listing, sync }) {
  const fiftyWarnings = []
  if (isUnreliable(fifty.trade)) fiftyWarnings.push('매매')
  if (isUnreliable(fifty.jeonse)) fiftyWarnings.push('전세')

  const lines = [
    `🏠 부동산 분석 · ${date}`,
    '',
    '[매매]',
    metricLine('전체', overall.trade),
    metricLine('50평대', fifty.trade),
    '',
    '[전세]',
    metricLine('전체', overall.jeonse),
    metricLine('50평대', fifty.jeonse),
  ]

  if (fiftyWarnings.length) {
    lines.push(`· 50평대 ${fiftyWarnings.join('·')}는 거래 짝이 얇거나 주간 변동이 과도해 표본 왜곡 가능성이 커요.`)
  }

  lines.push(
    '',
    '[종합]',
    `· 전체 기준으로 매매 ${headline(overall.trade.gap)}·전세 ${headline(overall.jeonse.gap)} 흐름이에요.`,
  )

  if (fiftyWarnings.length) {
    lines.push('· 50평대는 합계 숫자만으로 방향을 확정하지 않고 단지 분포와 신규 실거래 누적을 함께 볼게요.')
  } else {
    lines.push(`· 50평대는 매매 ${headline(fifty.trade.gap)}·전세 ${headline(fifty.jeonse.gap)} 흐름이에요.`)
  }

  const listingDelta = listing.previousCount == null ? '' : ` · 직전 대비 ${signed(listing.count - listing.previousCount, 0, '건')}`
  lines.push(
    '',
    `[데이터] 전체 ${listing.trackedComplexes}개 추적 단지·오늘 호가 갱신 ${listing.updatedComplexes}개 단지/${listing.count.toLocaleString()}건${listingDelta} · 신규 실거래 매매 ${sync.trades}건·전월세 ${sync.rentals}건`,
  )
  return lines.join('\n')
}
