// CODEF (헥토데이터) API 저수준 클라이언트.
//
// 프로토콜 특이사항 — 공식 easycodef SDK와 동일하게 맞춘 것들:
//  1) 요청 바디는 JSON을 통째로 encodeURIComponent 한 문자열로 보낸다.
//  2) 응답 바디도 URI 인코딩되어 오므로 '+' → 공백 치환 후 decodeURIComponent 한다.
//  3) accessToken은 일주일 유효하므로 프로세스 메모리에 캐시한다.
import crypto from 'node:crypto'

const OAUTH_URL = 'https://oauth.codef.io/oauth/token'

export type CodefService = 'sandbox' | 'demo' | 'api'

const HOSTS: Record<CodefService, string> = {
  sandbox: 'https://sandbox.codef.io',
  demo: 'https://development.codef.io',
  api: 'https://api.codef.io',
}

export interface CodefResult {
  code: string
  message: string
  extraMessage: string | null
  transactionId: string
}

export interface CodefResponse<T = unknown> {
  result: CodefResult
  data: T
}

export class CodefError extends Error {
  constructor(readonly result: CodefResult, readonly path: string) {
    super(`[CODEF ${result.code}] ${result.message}${result.extraMessage ? ` (${result.extraMessage})` : ''} @ ${path}`)
    this.name = 'CodefError'
  }
}

export function codefService(): CodefService {
  const raw = (process.env.CODEF_SERVICE || 'demo').toLowerCase()
  if (raw === 'api' || raw === 'production' || raw === 'prod') return 'api'
  if (raw === 'sandbox') return 'sandbox'
  return 'demo'
}

function credentials(service: CodefService): { clientId: string; clientSecret: string } {
  if (service === 'sandbox') {
    return {
      clientId: process.env.CODEF_SANDBOX_CLIENT_ID || 'ef27cfaa-10c1-4470-adac-60ba476273f9',
      clientSecret: process.env.CODEF_SANDBOX_CLIENT_SECRET || '83160c33-9045-4915-86d8-809473cdf5c3',
    }
  }
  const prefix = service === 'api' ? 'CODEF_PROD' : 'CODEF_DEMO'
  const clientId = process.env[`${prefix}_CLIENT_ID`] || process.env.CODEF_CLIENT_ID
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`] || process.env.CODEF_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(`[codef] ${prefix}_CLIENT_ID / ${prefix}_CLIENT_SECRET 가 .env.local 에 없습니다.`)
  }
  return { clientId, clientSecret }
}

const tokenCache = new Map<CodefService, { token: string; expiresAt: number }>()

/**
 * 일일 한도(CF-00012)를 한 번 만나면 그 뒤 호출은 전부 같은 오류로 돌아온다.
 * 그대로 두면 명세서 32건처럼 실패 로그만 잔뜩 쌓이므로, 한도를 본 순간부터는
 * 네트워크를 타지 않고 바로 막는다. 프로세스가 끝나면 초기화된다.
 */
let quotaExhausted = false

export class CodefQuotaError extends Error {
  constructor(readonly path: string) {
    super('[codef] 일일 호출 한도(CF-00012)에 걸려 이후 요청을 중단합니다.')
    this.name = 'CodefQuotaError'
  }
}

export function isQuotaExhausted(): boolean {
  return quotaExhausted
}

async function getAccessToken(service: CodefService, force = false): Promise<string> {
  const cached = tokenCache.get(service)
  if (!force && cached && cached.expiresAt > Date.now()) return cached.token

  const { clientId, clientSecret } = credentials(service)
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: 'grant_type=client_credentials&scope=read',
  })
  if (!res.ok) {
    throw new Error(`[codef] 토큰 발급 실패 (HTTP ${res.status}): ${await res.text()}`)
  }
  const json = (await res.json()) as { access_token: string; expires_in?: number }
  // expires_in은 초 단위(약 7일). 만료 1시간 전에 갱신되도록 여유를 둔다.
  const ttlMs = Math.max(60, (json.expires_in ?? 604800) - 3600) * 1000
  tokenCache.set(service, { token: json.access_token, expiresAt: Date.now() + ttlMs })
  return json.access_token
}

function decodeBody(body: string): string {
  try {
    return decodeURIComponent(body.replace(/\+/g, ' '))
  } catch {
    return body
  }
}

/** CODEF 상품/계정 API 호출. result.code가 CF-00000이 아니면 CodefError를 던진다. */
export async function codefRequest<T = unknown>(
  path: string,
  params: Record<string, unknown>,
  opts: { service?: CodefService; allowCodes?: string[] } = {}
): Promise<CodefResponse<T>> {
  const service = opts.service ?? codefService()
  if (quotaExhausted) throw new CodefQuotaError(path)
  const url = HOSTS[service] + path

  const call = async (token: string) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: encodeURIComponent(JSON.stringify(params)),
    })
    return { status: res.status, text: decodeBody(await res.text()) }
  }

  let token = await getAccessToken(service)
  let out = await call(token)

  // 토큰 만료 시 1회 재발급 후 재시도 (SDK와 동일한 동작).
  if (out.status === 401 && out.text.includes('invalid_token')) {
    token = await getAccessToken(service, true)
    out = await call(token)
  }
  if (out.status !== 200) {
    throw new Error(`[codef] HTTP ${out.status} @ ${path}: ${out.text.slice(0, 500)}`)
  }

  const parsed = JSON.parse(out.text) as CodefResponse<T>
  if (parsed.result.code === 'CF-00012') {
    quotaExhausted = true
    throw new CodefQuotaError(path)
  }
  const ok = parsed.result.code === 'CF-00000' || (opts.allowCodes ?? []).includes(parsed.result.code)
  if (!ok) throw new CodefError(parsed.result, path)
  return parsed
}

/**
 * 계정 등록/수정 시 쓰는 비밀번호 RSA 암호화.
 * CODEF publicKey는 X.509 SPKI base64(헤더 없음)이며 RSA/ECB/PKCS1Padding을 쓴다.
 */
export function encryptPassword(plain: string, publicKey = process.env.CODEF_PUBLIC_KEY): string {
  if (!publicKey) throw new Error('[codef] CODEF_PUBLIC_KEY 가 .env.local 에 없습니다. (키관리 > public_key)')
  const body = publicKey.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '')
  const pem = `-----BEGIN PUBLIC KEY-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`
  return crypto
    .publicEncrypt({ key: pem, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(plain, 'utf8'))
    .toString('base64')
}
