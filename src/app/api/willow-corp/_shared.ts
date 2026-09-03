import { NextResponse } from 'next/server'
import type { CorpCompany } from '@/types/willow-corp'

/** 회사 파라미터를 검증한다. 모르면 윌로우. */
export function companyParam(request: Request): CorpCompany {
  const v = new URL(request.url).searchParams.get('company')
  return v === 'tensw' ? 'tensw' : 'willow'
}

export function fail(what: string, error: unknown) {
  console.error(`willow-corp ${what}:`, error)
  return NextResponse.json({ error: `Failed to ${what}` }, { status: 500 })
}
