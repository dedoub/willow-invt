export type FinanceCompany = 'tensw' | 'willow'
export type TaxObligationSource = 'hometax' | 'wetax' | 'nhis'
export type TaxObligationStatus = 'unpaid' | 'paid' | 'overdue' | 'cancelled'

export interface FinanceTaxObligation {
  id: string
  company: FinanceCompany
  source: TaxObligationSource
  obligation_type: string
  notice_number: string | null
  period_label: string | null
  title: string
  agency: string
  amount: number
  issued_date: string | null
  due_date: string | null
  status: TaxObligationStatus
  paid_at: string | null
  matched_cash_id: string | null
  match_confidence: 'exact' | 'manual' | null
  collected_at: string
}
