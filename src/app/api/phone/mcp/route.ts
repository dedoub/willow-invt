// AI 전화비서(ClawOps 에이전트)가 통화 중에 부르는 MCP 도구. 도구는 save_call_memo 하나.
// 이름·소속·회신 번호·용건을 AI 가 이해한 대로 칸에 넣어 보내면 tensw_phone_memos 에 쌓고,
// 통화가 끝난 뒤 웹훅(/api/phone/clawops)이 통화 시간대로 짝지어 카드·일정에 쓴다.
// 인증: Authorization: Bearer CLAWOPS_WEBHOOK_TOKEN. Streamable HTTP 의 JSON 응답 모드만 쓴다(상태 없음).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { safeEqual } from '@/lib/phone/clawops'

const TOOL = {
  name: 'save_call_memo',
  description: '발신자 메모를 저장합니다. 이름·소속·회신 번호·용건 중 하나라도 알게 되면 바로 부르고, 더 알게 되면 다시 부르세요(마지막 값이 남습니다). 모르는 칸은 비워 두세요.',
  inputSchema: {
    type: 'object',
    properties: {
      caller_name: { type: 'string', description: '발신자 이름(직함 제외). 예: 김동욱' },
      caller_org: { type: 'string', description: '소속 회사·기관. 예: 서울시체육회' },
      callback_number: { type: 'string', description: '회신받을 번호. "이 번호로"라고 하면 "발신번호"' },
      purpose: { type: 'string', description: '용건 한 줄' },
      urgent: { type: 'boolean', description: '오늘 중 회신이 필요하거나 급하다고 했으면 true' },
      category: { type: 'string', enum: ['고객문의', '기관', '거래처', '채용', '광고', '기타'] },
    },
  },
}

const rpc = (id: unknown, result: unknown) => NextResponse.json({ jsonrpc: '2.0', id, result })
const rpcErr = (id: unknown, code: number, message: string) => NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } })

export async function POST(req: NextRequest) {
  const token = process.env.CLAWOPS_WEBHOOK_TOKEN
  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token || !safeEqual(auth, token)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const msg = await req.json().catch(() => null) as { id?: unknown; method?: string; params?: Record<string, unknown> } | null
  if (!msg?.method) return rpcErr(null, -32600, 'invalid request')
  if (msg.id === undefined) return new NextResponse(null, { status: 202 })          // notifications/*

  switch (msg.method) {
    case 'initialize':
      return rpc(msg.id, {
        protocolVersion: (msg.params?.protocolVersion as string) ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'tensw-phone-memo', version: '1.0.0' },
      })
    case 'ping': return rpc(msg.id, {})
    case 'tools/list': return rpc(msg.id, { tools: [TOOL] })
    case 'tools/call': {
      if (msg.params?.name !== TOOL.name) return rpcErr(msg.id, -32602, 'unknown tool')
      const a = (msg.params?.arguments ?? {}) as Record<string, unknown>
      const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null)
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
      const { error } = await sb.from('tensw_phone_memos').insert({
        caller_name: str(a.caller_name), caller_org: str(a.caller_org), callback_number: str(a.callback_number),
        purpose: str(a.purpose), urgent: typeof a.urgent === 'boolean' ? a.urgent : null, category: str(a.category), raw: a,
      })
      return rpc(msg.id, { content: [{ type: 'text', text: error ? `저장 실패: ${error.message}` : '메모를 저장했습니다.' }], isError: !!error })
    }
    default: return rpcErr(msg.id, -32601, 'method not found')
  }
}

export async function GET() {
  return NextResponse.json({ error: 'use POST (streamable http, JSON response mode)' }, { status: 405 })
}
