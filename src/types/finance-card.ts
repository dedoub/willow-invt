// 법인카드 승인·청구 내역. 두 회사가 서로 다른 카드사를 쓰지만(텐소프트웍스 우리카드,
// 윌로우인베스트먼트 KB카드) 수집기가 같은 모양으로 맞춰 넣으므로 화면도 공용이다.

export interface CardApproval {
  id: string
  used_date: string
  used_time: string | null
  card_no: string
  store_name: string | null
  store_type: string | null
  store_corp_no: string | null
  amount: number
  /** 원화 환산 금액. 국내 건은 amount와 같다. 합산은 반드시 이 값으로 한다. */
  krw: number
  home_foreign_type: string | null
  vat: number | null
  payment_type: string | null
  installment_month: string | null
  cancel_yn: string | null
  cancel_amount: number | null
}

export interface CardBilling {
  billing_month: string
  payment_due_date: string | null
  total_amount: number
  domestic_use: number | null
  overseas_use: number | null
  full_amount: number | null
  installment_amount: number | null
  annual_fee: number | null
  payment_account: string | null
}
