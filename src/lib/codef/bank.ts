// CODEF 은행 상품(기업/법인) 래퍼 + 텐소프트웍스 계좌 매핑.
import { codefRequest } from './client'

/** 기관코드 (CODEF 은행 공통). 필요한 것만 둔다. */
export const BANK_ORG = {
  산업: '0002',
  기업: '0003',
  국민: '0004',
  수협: '0007',
  농협: '0011',
  우리: '0020',
  SC제일: '0023',
  씨티: '0027',
  대구: '0031',
  부산: '0032',
  광주: '0034',
  제주: '0035',
  전북: '0037',
  경남: '0039',
  새마을: '0045',
  신협: '0048',
  우체국: '0071',
  하나: '0081',
  신한: '0088',
  케이뱅크: '0089',
  카카오뱅크: '0090',
  토스뱅크: '0092',
} as const

export interface BankAccount {
  /** 현금관리 테이블(account_number)에 쓰는 표시 문자열. 기존 데이터와 반드시 동일해야 한다. */
  label: string
  organization: string
  /** 숫자만. CODEF 입력부의 account 값. */
  account: string
}

/**
 * 텐소프트웍스 법인 계좌.
 * label은 tensw_mgmt_cash.account_number 기존 표기와 1:1로 맞춰야 잔고 스파크라인이 이어진다.
 */
export const TENSW_ACCOUNTS: BankAccount[] = [
  { label: '우리 1005-403-461450', organization: BANK_ORG.우리, account: '1005403461450' },
  { label: '우리 1005-903-636048', organization: BANK_ORG.우리, account: '1005903636048' },
  { label: '우리 1005-603-639403', organization: BANK_ORG.우리, account: '1005603639403' },
  { label: '우리 1005-704-524272', organization: BANK_ORG.우리, account: '1005704524272' },
  { label: '우리 1005-204-474909', organization: BANK_ORG.우리, account: '1005204474909' },
  { label: '우리 1005-403-914716', organization: BANK_ORG.우리, account: '1005403914716' },
  { label: '우리 1005-803-628060', organization: BANK_ORG.우리, account: '1005803628060' },
  { label: '우리 1005-604-650468', organization: BANK_ORG.우리, account: '1005604650468' },
  { label: '신한 140-013-150883', organization: BANK_ORG.신한, account: '140013150883' },
]

export interface CodefAccountListItem {
  resAccount: string
  resAccountDisplay: string
  resAccountBalance: string
  resAccountDeposit: string
  resAccountName: string
  resAccountNickName?: string
  resAccountCurrency: string
  resLastTranDate?: string
}

export interface CodefAccountList {
  resDepositTrust: CodefAccountListItem[]
  resForeignCurrency: CodefAccountListItem[]
  resFund: CodefAccountListItem[]
  resLoan: CodefAccountListItem[]
}

/** 기업 보유계좌 조회. */
export async function listCorporateAccounts(params: {
  connectedId: string
  organization: string
}): Promise<CodefAccountList> {
  const res = await codefRequest<CodefAccountList>('/v1/kr/bank/b/account/account-list', {
    connectedId: params.connectedId,
    organization: params.organization,
  })
  return res.data
}

export interface CodefTransaction {
  resAccountTrDate: string
  resAccountTrTime: string
  resAccountOut: string
  resAccountIn: string
  resAccountDesc1?: string
  resAccountDesc2?: string
  resAccountDesc3?: string
  resAccountDesc4?: string
  resAfterTranBalance: string
}

export interface CodefTransactionList {
  resAccount?: string
  resAccountName?: string
  resAccountHolder?: string
  resAccountBalance?: string
  resWithdrawalAmt?: string
  resTrHistoryList: CodefTransaction[]
}

/**
 * 기업 수시입출 거래내역 조회.
 * 은행별 조회 가능 기간 제한이 있어 호출부에서 기간을 쪼갠다(기업은행 12개월, SC 3개월 등).
 */
export async function listCorporateTransactions(params: {
  connectedId: string
  organization: string
  account: string
  startDate: string // YYYYMMDD
  endDate: string // YYYYMMDD
  orderBy?: '0' | '1'
  inquiryType?: '0' | '1'
}): Promise<CodefTransactionList> {
  const res = await codefRequest<CodefTransactionList | CodefTransactionList[]>(
    '/v1/kr/bank/b/account/transaction-list',
    {
      connectedId: params.connectedId,
      organization: params.organization,
      account: params.account,
      startDate: params.startDate,
      endDate: params.endDate,
      orderBy: params.orderBy ?? '1', // 과거순 — 잔액 흐름 확인이 쉽다
      inquiryType: params.inquiryType ?? '1',
    }
  )
  // 단건은 객체, 다건은 리스트로 온다.
  const data = Array.isArray(res.data) ? res.data[0] : res.data
  return { ...data, resTrHistoryList: data?.resTrHistoryList ?? [] }
}

export interface ConnectedIdAccount {
  countryCode: string
  businessType: string
  clientType: string
  organization: string
  loginType: string
}

/** 커넥티드 아이디에 등록된 계정 목록. */
export async function listConnectedIdAccounts(connectedId: string) {
  const res = await codefRequest<{ accountList: ConnectedIdAccount[] }>('/v1/account/list', { connectedId })
  return res.data.accountList ?? []
}

/** 클라이언트에 발급된 커넥티드 아이디 전체 목록. 하나도 없으면 빈 배열(CF-03999). */
export async function listConnectedIds() {
  const res = await codefRequest<{ connectedIdList?: string[] }>(
    '/v1/account/connectedId-list',
    {},
    { allowCodes: ['CF-03999'] }
  )
  return res.data?.connectedIdList ?? []
}
