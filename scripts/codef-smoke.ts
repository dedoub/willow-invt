#!/usr/bin/env npx tsx
// CODEF 연결 확인용 스모크 테스트: 토큰 발급 + connectedId 목록 조회.
import * as dotenv from 'dotenv'
import * as path from 'path'
import { codefService } from '../src/lib/codef/client'
import { listConnectedIds } from '../src/lib/codef/bank'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

async function main() {
  console.log('service =', codefService())
  const ids = await listConnectedIds()
  console.log('토큰 발급 OK. connectedId', ids.length ? `= ${ids.join(', ')}` : '없음 (계정 등록 전)')
}
main().catch(e => { console.error('ERR:', e instanceof Error ? e.message : e); process.exit(1) })
