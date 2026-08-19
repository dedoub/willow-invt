// CODEF 카드 상품(법인) 래퍼.
// 은행과 같은 connectedId 방식이며, 계정 등록 시 businessType='CD' 로 붙인다.
import { codefRequest } from './client'

/** 카드사 기관코드 (CODEF 카드 개요 기준). */
export const CARD_ORG = {
  KB: '0301',
  현대: '0302',
  삼성: '0303',
  NH: '0304',
  BC: '0305',
  신한: '0306',
  씨티: '0307',
  우리: '0309',
  롯데: '0311',
  하나: '0313',
  전북: '0315',
  광주: '0316',
  수협: '0320',
  제주: '0321',
} as const

/** 텐소프트웍스가 쓰는 법인카드사. 현금관리에 우리카드 결제대금만 찍힌다. */
export const TENSW_CARD_ORGS: string[] = [CARD_ORG.우리]

export interface CorporateCard {
  resCardName: string
  resCardNo: string
  resUserNm?: string
  resValidPeriod?: string
  resState?: string
  resCardType?: string
}

/** 법인 보유카드 조회. 승인내역을 카드별로 볼 때 카드번호가 필요하다. */
export async function listCorporateCards(params: {
  connectedId: string
  organization: string
}): Promise<CorporateCard[]> {
  const res = await codefRequest<CorporateCard[] | CorporateCard>('/v1/kr/card/b/account/card-list', {
    connectedId: params.connectedId,
    organization: params.organization,
  })
  if (!res.data) return []
  return Array.isArray(res.data) ? res.data : [res.data]
}

export interface CardApproval {
  resUsedDate: string // YYYYMMDD
  resUsedTime?: string // hhmmss
  resCardNo: string
  resMemberStoreName: string
  resMemberStoreNo?: string
  resMemberStoreCorpNo?: string // 가맹점 사업자번호 — 매입 계산서와 붙이는 열쇠
  resMemberStoreType?: string
  resUsedAmount: string
  resVAT?: string
  resPaymentType?: string // 1 일시불, 2 할부
  resInstallmentMonth?: string
  resApprovalNo?: string
  resPaymentDueDate?: string
  resCancelYN?: string // 0 정상, 1 취소, 2 부분취소, 3 거절
  resCancelAmount?: string
  resHomeForeignType?: string
  resKRWAmt?: string
  resPurchaseYN?: string
  resPurchaseDate?: string
}

/**
 * 법인 카드 승인내역.
 * memberStoreInfoType='3' 이어야 가맹점 사업자번호와 부가세가 함께 온다.
 * 이 두 값이 있어야 매입 세금계산서와 1:1로 붙는다.
 */
export async function listCardApprovals(params: {
  connectedId: string
  organization: string
  startDate: string // YYYYMMDD
  endDate: string // YYYYMMDD
  /** 미지정 시 전체조회. 카드사에 따라 카드별 조회만 되는 곳도 있다. */
  cardNo?: string
  identity?: string
}): Promise<CardApproval[]> {
  const body: Record<string, unknown> = {
    connectedId: params.connectedId,
    organization: params.organization,
    startDate: params.startDate,
    endDate: params.endDate,
    orderBy: '1', // 과거순
    inquiryType: params.cardNo ? '0' : '1',
    memberStoreInfoType: '3', // 가맹점 + 부가세
    applicationType: '0',
  }
  if (params.cardNo) body.cardNo = params.cardNo
  if (params.identity) body.identity = params.identity

  const res = await codefRequest<CardApproval[] | CardApproval>('/v1/kr/card/b/account/approval-list', body)
  if (!res.data) return []
  return Array.isArray(res.data) ? res.data : [res.data]
}

/**
 * 카드사별 1회 조회 가능 기간에 맞춰 기간을 쪼갠다.
 * 우리·국민·하나·NH는 12개월, 신한은 일주일, BC는 1개월 단위다.
 */
export function splitByMonths(startDate: string, endDate: string, months: number) {
  const toDate = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)))
  const toYmd = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

  const end = toDate(endDate)
  const out: Array<{ startDate: string; endDate: string }> = []
  let cursor = toDate(startDate)
  while (cursor <= end) {
    const chunkEnd = new Date(cursor)
    chunkEnd.setMonth(chunkEnd.getMonth() + months)
    chunkEnd.setDate(chunkEnd.getDate() - 1)
    out.push({ startDate: toYmd(cursor), endDate: toYmd(chunkEnd > end ? end : chunkEnd) })
    cursor = new Date(chunkEnd)
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}
