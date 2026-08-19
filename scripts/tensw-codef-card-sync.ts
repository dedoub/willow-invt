#!/usr/bin/env npx tsx
/**
 * tensw-codef-card-sync.ts
 *
 * 법인카드 승인내역을 CODEF로 끌어와 tensw_codef_card_approvals 에 적재한다.
 *
 * 왜 필요한가: 한전·KT·구글클라우드처럼 카드 자동이체로 결제되는 매입은 계산서별로 대응하는
 * 은행 출금이 없다. 은행만 보면 카드 대금 합계 한 줄뿐이라 어느 계산서가 결제됐는지 알 수 없다.
 * 승인내역에는 가맹점 사업자번호가 있어 매입 계산서의 공급자와 1:1로 붙는다.
 *
 *   npx tsx scripts/tensw-codef-card-sync.ts                # 최근 90일
 *   npx tsx scripts/tensw-codef-card-sync.ts --days 365
 *   npx tsx scripts/tensw-codef-card-sync.ts --from 20260101 --to 20260819
 *   npx tsx scripts/tensw-codef-card-sync.ts --cards         # 보유카드만 조회
 *   npx tsx scripts/tensw-codef-card-sync.ts --dry
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import crypto from 'node:crypto'
import { codefService } from '../src/lib/codef/client'
import {
  TENSW_CARD_ORGS,
  CARD_ORG,
  listCorporateCards,
  listCardApprovals,
  splitByMonths,
  type CardApproval,
} from '../src/lib/codef/card'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const argv = process.argv.slice(2)
const flag = (n: string) => argv.includes(`--${n}`)
const arg = (n: string) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}

const DRY = flag('dry')
const CONNECTED_ID = process.env.TENSW_CODEF_CONNECTED_ID
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY!

/** 카드사별 1회 조회 가능 개월. 우리카드는 12개월 단위. */
const CHUNK_MONTHS: Record<string, number> = { [CARD_ORG.우리]: 12, [CARD_ORG.신한]: 1, [CARD_ORG.BC]: 1 }

const ymd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

function dateRange() {
  const from = arg('from')
  if (from) return { startDate: from, endDate: arg('to') ?? ymd(new Date()) }
  const days = Number(arg('days') ?? 90)
  const end = new Date()
  const start = new Date(end.getTime() - days * 86400000)
  return { startDate: ymd(start), endDate: ymd(end) }
}

const num = (v?: string) => {
  if (!v) return 0
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const isoDate = (v?: string) => (v && /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null)
const isoTime = (v?: string) => {
  if (!v) return null
  const d = v.replace(/\D/g, '')
  return d.length >= 6 ? `${d.slice(0, 2)}:${d.slice(2, 4)}:${d.slice(4, 6)}` : null
}

/** 승인번호는 카드사에 따라 비므로 사용일시·카드·가맹점·금액까지 묶어 지문을 만든다. */
function fingerprint(org: string, r: CardApproval): string {
  return crypto
    .createHash('sha1')
    .update(
      [
        org,
        r.resCardNo ?? '',
        r.resUsedDate ?? '',
        r.resUsedTime ?? '',
        r.resApprovalNo ?? '',
        r.resMemberStoreName ?? '',
        r.resUsedAmount ?? '',
        r.resCancelYN ?? '',
      ].join('|')
    )
    .digest('hex')
}

async function main() {
  if (!CONNECTED_ID) {
    console.error('[card-sync] TENSW_CODEF_CONNECTED_ID 가 없습니다.')
    process.exit(1)
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[card-sync] Supabase env(.env.local) 누락')
    process.exit(1)
  }

  console.log(`[card-sync] service=${codefService()}`)

  if (flag('cards')) {
    for (const organization of TENSW_CARD_ORGS) {
      const cards = await listCorporateCards({ connectedId: CONNECTED_ID, organization })
      for (const c of cards) {
        console.log(`  ${organization} ${c.resCardNo} ${c.resCardName} ${c.resUserNm ?? ''} ${c.resState ?? ''}`)
      }
      if (!cards.length) console.log(`  ${organization}: 보유카드 없음`)
    }
    return
  }

  const { startDate, endDate } = dateRange()
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let totalNew = 0
  for (const organization of TENSW_CARD_ORGS) {
    const chunks = splitByMonths(startDate, endDate, CHUNK_MONTHS[organization] ?? 3)
    for (const chunk of chunks) {
      let list: CardApproval[]
      try {
        list = await listCardApprovals({ connectedId: CONNECTED_ID, organization, ...chunk })
      } catch (err) {
        console.error(`  ✗ ${organization} ${chunk.startDate}~${chunk.endDate}: ${err instanceof Error ? err.message : err}`)
        continue
      }

      const rows = list
        .map(r => {
          const usedDate = isoDate(r.resUsedDate)
          if (!usedDate) return null
          return {
            organization,
            card_no: r.resCardNo ?? '',
            used_date: usedDate,
            used_time: isoTime(r.resUsedTime),
            store_name: r.resMemberStoreName || null,
            store_corp_no: r.resMemberStoreCorpNo ? r.resMemberStoreCorpNo.replace(/\D/g, '') || null : null,
            store_type: r.resMemberStoreType || null,
            amount: num(r.resUsedAmount),
            vat: r.resVAT ? num(r.resVAT) : null,
            payment_type: r.resPaymentType || null,
            installment_month: r.resInstallmentMonth || null,
            approval_no: r.resApprovalNo || null,
            payment_due_date: isoDate(r.resPaymentDueDate),
            cancel_yn: r.resCancelYN || null,
            cancel_amount: r.resCancelAmount ? num(r.resCancelAmount) : null,
            purchase_yn: r.resPurchaseYN || null,
            purchase_date: isoDate(r.resPurchaseDate),
            raw: r,
            fingerprint: fingerprint(organization, r),
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (DRY) {
        console.log(`  · ${organization} ${chunk.startDate}~${chunk.endDate}: ${rows.length}건 (dry)`)
        for (const r of rows.slice(0, 6)) {
          console.log(`      ${r.used_date} ${r.store_name ?? ''} ${r.amount.toLocaleString()}원 사업자 ${r.store_corp_no ?? '-'}`)
        }
        continue
      }

      const { data, error } = await sb
        .from('tensw_codef_card_approvals')
        .upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true })
        .select('id')
      if (error) {
        console.error(`  ✗ ${organization} ${chunk.startDate}~${chunk.endDate}: ${error.message}`)
        continue
      }
      const added = data?.length ?? 0
      totalNew += added
      console.log(`  · ${organization} ${chunk.startDate}~${chunk.endDate}: 조회 ${rows.length}건, 신규 ${added}건`)
    }
  }

  if (!DRY) console.log(`\n[card-sync] 신규 ${totalNew}건 적재 완료.`)
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
