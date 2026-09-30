// seed-rules.mjs — 스킬·SOP·세무 달력에 이미 적힌 정기 업무. 제목의 {period} 는 대상 월(YYYY-MM).
const M10 = { kind: 'monthly_day', day: 10, shift: 'next' }
export const SEED_RULES = [
  // 텐소
  { company: 'tensw', task_key: 'payroll', step: 'request', title: '{period} 급여대장 요청(세무법인형운)', rule: { kind: 'business_days_before', anchor: { kind: 'monthly_day', day: 25, shift: 'prev' }, n: 3 }, lead_days: 2, recipe: 'payroll-request', completion: { kind: 'sent_mail', context: 'tensoftworks', to: 'jjtaxro@daum.net', subject: '급여' } },
  { company: 'tensw', task_key: 'payroll', step: 'payday', title: '{period} 급여 이체·명세서 발송', rule: { kind: 'monthly_day', day: 25, shift: 'prev' }, lead_days: 1, recipe: 'payroll-payday', completion: { kind: 'cash', table: 'tensw_mgmt_cash', category: 'salary' } },
  { company: 'tensw', task_key: 'attendance', step: 'send', title: '{period} 강남구 인턴십 출근부 발송', rule: { kind: 'month_end', shift: 'prev' }, lead_days: 1, recipe: 'attendance-send', completion: { kind: 'sent_mail', context: 'tensoftworks', subject: '출근부' }, adopt_prefix: 'gangnam-attendance:send:' },
  { company: 'tensw', task_key: 'attendance', step: 'collect', title: '{period} 출근부 서명본 회신 받기', rule: { kind: 'monthly_day', day: 5, shift: 'next', period_offset: 1 }, lead_days: 0, recipe: 'subsidy-collect', completion: null },
  { company: 'tensw', task_key: 'subsidy', step: 'submit', title: '{period}분 강남구 인턴십 지원금 신청', rule: { kind: 'monthly_day', day: 15, shift: 'prev', period_offset: 1 }, lead_days: 5, recipe: 'subsidy-submit', completion: { kind: 'sent_mail', context: 'tensoftworks', to: 'gnk@gngucci.or.kr' } },
  { company: 'tensw', task_key: 'withholding', step: 'pay', title: '{period} 원천세·지방소득세 납부', rule: { ...M10, period_offset: 1 }, lead_days: 3, recipe: null, completion: { kind: 'tax', types: ['national_tax', 'local_tax'] } },
  { company: 'tensw', task_key: 'social-insurance', step: 'pay', title: '{period} 4대보험 납부', rule: { ...M10, period_offset: 1 }, lead_days: 3, recipe: null, completion: { kind: 'tax', types: ['health_insurance', 'pension', 'employment_insurance', 'industrial_accident'] }, adopt_prefix: 'tensw-finance:tax-obligation:social:' },
  { company: 'tensw', task_key: 'vat', step: 'pay', title: '부가세 신고·납부', rule: { kind: 'quarterly_day', day: 25, months: [1, 4, 7, 10], shift: 'next' }, lead_days: 10, recipe: null, completion: { kind: 'tax', types: ['vat'] } },
  // 윌로우
  // Task 13 재현 시험: completion(sent_mail subject:Invoice)이 한 번도 안 맞았다 — 실제 완료는
  // 커머셜 인보이스 시스템이 매달 만드는 `commercial:etc-invoice:...` 원장 행이다. adopt_prefix 로
  // 그 행을 그대로 흡수해 중복 일정이 생기지 않게 한다(ledger.test.mjs 참고).
  { company: 'willow', task_key: 'etc-invoice', step: 'issue', title: '{period} ETC 월 컨설팅 인보이스', rule: { kind: 'business_days_before', anchor: { kind: 'month_end', shift: 'prev' }, n: 3 }, lead_days: 2, recipe: 'etc-invoice', completion: { kind: 'sent_mail', context: 'default', subject: 'Invoice' }, adopt_prefix: 'commercial:etc-invoice:' },
  { company: 'willow', task_key: 'etc-referral', step: 'receive', title: '{period} ETC 레퍼럴 피 통보 확인', rule: { kind: 'monthly_day', day: 9, shift: 'next', period_offset: 2 }, lead_days: 0, recipe: null, completion: { kind: 'received_mail', context: 'default', subject: 'Referral Fees' } },
  { company: 'willow', task_key: 'akros-fee', step: 'issue', title: '{period} 아크로스 자문료 계산서·입금 확인', rule: { kind: 'monthly_day', day: 25, shift: 'prev' }, lead_days: 3, recipe: null, completion: { kind: 'cash', table: 'willow_mgmt_cash', counterparty: '아크로스' } },
  { company: 'willow', task_key: 'withholding', step: 'pay', title: '{period} 원천세·지방소득세 납부', rule: { ...M10, period_offset: 1 }, lead_days: 3, recipe: null, completion: { kind: 'tax', types: ['national_tax', 'local_tax'] } },
  { company: 'willow', task_key: 'social-insurance', step: 'pay', title: '{period} 4대보험 납부', rule: { ...M10, period_offset: 1 }, lead_days: 3, recipe: null, completion: { kind: 'tax', types: ['health_insurance', 'pension'] } },
  { company: 'willow', task_key: 'vat', step: 'pay', title: '부가세 신고·납부', rule: { kind: 'quarterly_day', day: 25, months: [1, 4, 7, 10], shift: 'next' }, lead_days: 10, recipe: null, completion: { kind: 'tax', types: ['vat'] } },
  // 연간(양사)
  ...['tensw', 'willow'].flatMap(company => [
    { company, task_key: 'corp-tax', step: 'file', title: '법인세 신고·납부', rule: { kind: 'yearly_date', month: 3, day: 31, shift: 'next' }, lead_days: 20, recipe: null, completion: { kind: 'tax', types: ['corporate_tax'] } },
    { company, task_key: 'corp-local-tax', step: 'file', title: '지방소득세(법인분) 신고·납부', rule: { kind: 'yearly_date', month: 4, day: 30, shift: 'next' }, lead_days: 10, recipe: null, completion: { kind: 'tax', types: ['local_tax'] } },
    { company, task_key: 'year-end-settlement', step: 'file', title: '연말정산·지급명세서 제출', rule: { kind: 'yearly_date', month: 3, day: 10, shift: 'next' }, lead_days: 30, recipe: null, completion: null },
  ]),
]
