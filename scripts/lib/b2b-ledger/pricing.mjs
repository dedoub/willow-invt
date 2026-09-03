import { FORBIDDEN_BASIS } from './constants.mjs'

export function computeFee({ basis, percent, contractAmount, amount }) {
  if (basis === 'fixed') return amount
  if (basis === 'percent_of_contract') return Math.round((contractAmount * percent) / 100)
  if (basis === 'rate_card') return amount
  throw new Error(`unknown basis: ${basis}`)
}

export function computePricing({ method, factors, rateCard }) {
  if (method === 'rate_card') {
    return (factors?.lines ?? []).reduce((sum, line) => {
      const unit = rateCard?.[line.role]
      if (!unit) throw new Error(`rate card missing role: ${line.role}`)
      return sum + line.days * unit.amount
    }, 0)
  }
  return factors.amount
}

export function assertBasisAllowed(text, factors) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) throw new Error('basis_text required')
  const haystack = `${trimmed} ${JSON.stringify(factors ?? null)}`
  if (FORBIDDEN_BASIS.some((word) => haystack.includes(word))) {
    throw new Error('basis must cite market evidence, not profit or cash')
  }
}
