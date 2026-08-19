// CODEF 국세청 홈택스 상품 래퍼 (전자세금계산서).
//
// 은행 상품과 달리 connectedId를 쓰지 않는다. 요청마다 인증서(der/key)와
// RSA 암호화된 인증서 비밀번호를 직접 실어 보낸다.
import fs from 'node:fs'
import path from 'node:path'
import { codefRequest, encryptPassword } from './client'

/** 홈택스 기관코드는 고정값이다. */
export const HOMETAX_ORG = '0002'

export interface HometaxCert {
  certFile: string // base64 der
  keyFile: string // base64 key
  certPassword: string // RSA 암호문
}

function resolveHome(p: string): string {
  return p.startsWith('~') ? path.join(process.env.HOME || '', p.slice(1)) : p
}

/**
 * .env.local 에서 홈택스 인증서 자격을 구성한다.
 *   CODEF_HOMETAX_CERT_DER / CODEF_HOMETAX_CERT_KEY : 인증서 파일 경로
 *   CODEF_HOMETAX_CERT_PASSWORD_ENC : RSA 암호문 (scripts/codef-encrypt-password.ts 로 생성)
 *   CODEF_HOMETAX_CERT_PASSWORD     : 평문 (암호문이 없을 때만 사용)
 */
export function hometaxCertFromEnv(): HometaxCert {
  const der = process.env.CODEF_HOMETAX_CERT_DER
  const key = process.env.CODEF_HOMETAX_CERT_KEY
  if (!der || !key) {
    throw new Error('[codef] CODEF_HOMETAX_CERT_DER / CODEF_HOMETAX_CERT_KEY 경로가 .env.local 에 없습니다.')
  }
  const enc = process.env.CODEF_HOMETAX_CERT_PASSWORD_ENC
  const plain = process.env.CODEF_HOMETAX_CERT_PASSWORD
  if (!enc && !plain) {
    throw new Error('[codef] CODEF_HOMETAX_CERT_PASSWORD_ENC 가 .env.local 에 없습니다. npm run codef:encrypt 로 생성하세요.')
  }
  return {
    certFile: fs.readFileSync(resolveHome(der)).toString('base64'),
    keyFile: fs.readFileSync(resolveHome(key)).toString('base64'),
    certPassword: enc || encryptPassword(plain!),
  }
}

export interface TaxInvoiceRow {
  resIssueNm: string // 발급형태
  resTaxAmt: string // 세액
  resIssueDate: string // 발급일자 YYYYMMDD
  resApprovalNo: string // 승인번호
  resSupplyValue: string // 공급가액
  resReportingDate: string // 작성일자
  resSendDate: string // 전송일자
  resSupplierRegNumber?: string
  resSupplierCompanyName?: string
  resSupplierName?: string
  resContractorRegNumber?: string
  resContractorCompanyName?: string
  resContractorName?: string
  resTotalAmount: string // 합계금액
  resETaxInvoiceType: string // 일반/영세 등
  resNote?: string
  resReceiptOrCharge: string // 영수/청구
  resRepItems: string // 대표품목
}

/** 거래구분: 매출 / 매입 */
export type TranseType = '01' | '02'

/**
 * 전자세금계산서 목록 조회.
 * 조회 가능 기간에 제한은 없지만 3개월 단위로 끊어 호출해야 한다.
 */
export async function listTaxInvoices(params: {
  cert: HometaxCert
  startDate: string // YYYYMMDD
  endDate: string // YYYYMMDD
  transeType: TranseType
  /** "01" 전자세금계산서(기본), "03" 전자계산서 */
  inquiryType?: '01' | '02' | '03' | '04'
  /** "01" 작성일자(기본), "02" 발급일자, "03" 전송일자 */
  searchType?: '01' | '02' | '03'
  /** 사업장이 여러 개일 때 지정 */
  identity?: string
}): Promise<TaxInvoiceRow[]> {
  const body: Record<string, unknown> = {
    organization: HOMETAX_ORG,
    loginType: '0',
    certType: '1',
    certFile: params.cert.certFile,
    keyFile: params.cert.keyFile,
    certPassword: params.cert.certPassword,
    inquiryType: params.inquiryType ?? '01',
    searchType: params.searchType ?? '01',
    startDate: params.startDate,
    endDate: params.endDate,
    sortby: '1',
    orderBy: '1', // 과거순
    transeType: params.transeType,
    type: '0',
  }
  if (params.identity) body.identity = params.identity

  const res = await codefRequest<TaxInvoiceRow[] | TaxInvoiceRow | { continue2Way?: boolean; method?: string }>(
    '/v1/kr/public/nt/tax-invoice/check-list',
    body,
    { allowCodes: ['CF-03002'] }
  )

  if (res.result.code === 'CF-03002') {
    const info = res.data as { method?: string }
    throw new Error(
      `[codef] 홈택스가 추가인증을 요구합니다 (method=${info.method ?? '?'}). ` +
        '인증서 로그인은 보통 추가인증이 없으므로, 인증서가 홈택스에 등록돼 있는지 확인하세요.'
    )
  }

  if (!res.data) return []
  return Array.isArray(res.data) ? res.data : [res.data as TaxInvoiceRow]
}

/** 홈택스 조회 제한(3개월 단위)에 맞춰 기간을 쪼갠다. */
export function splitQuarterly(startDate: string, endDate: string): Array<{ startDate: string; endDate: string }> {
  const toDate = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)))
  const toYmd = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

  const end = toDate(endDate)
  const out: Array<{ startDate: string; endDate: string }> = []
  let cursor = toDate(startDate)
  while (cursor <= end) {
    const chunkEnd = new Date(cursor)
    chunkEnd.setMonth(chunkEnd.getMonth() + 3)
    chunkEnd.setDate(chunkEnd.getDate() - 1)
    out.push({ startDate: toYmd(cursor), endDate: toYmd(chunkEnd > end ? end : chunkEnd) })
    cursor = new Date(chunkEnd)
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}
