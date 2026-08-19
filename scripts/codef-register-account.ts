#!/usr/bin/env npx tsx
/**
 * codef-register-account.ts
 *
 * CODEF 커넥티드 아이디(connectedId) 발급/조회.
 * 은행 계좌 조회 API는 전부 connectedId를 요구하고, connectedId는 법인 공동인증서(또는
 * 인터넷뱅킹 ID/PW)를 CODEF에 등록해야 나온다. 인증서 비밀번호는 이 스크립트가 직접
 * 입력받아 RSA로 암호화해 전송하며, 화면·로그·파일 어디에도 평문으로 남기지 않는다.
 *
 *   npx tsx scripts/codef-register-account.ts --list
 *       발급된 connectedId 목록과 각 아이디에 등록된 기관 출력
 *
 *   npx tsx scripts/codef-register-account.ts --cert \
 *       --org 0020,0088 --der ~/certs/signCert.der --key ~/certs/signPri.key
 *       공동인증서로 계정 등록. --org 에 기관코드를 쉼표로 여러 개 주면
 *       한 번의 비밀번호 입력으로 여러 은행을 같은 connectedId에 등록한다.
 *
 *   npx tsx scripts/codef-register-account.ts --id --org 0020 --login-id myid
 *       인터넷뱅킹 ID/PW로 계정 등록
 *
 *   --connected-id <id>  : 이미 있는 connectedId에 기관 추가 (/v1/account/add)
 *   --password-stdin     : 비밀번호를 프롬프트 대신 stdin에서 읽는다.
 *                          대화형 입력이 안 되는 셸에서 사용:
 *                            printf '%s' '비번' | npm run codef:register -- --password-stdin ...
 *
 * 발급된 connectedId는 .env.local 의 TENSW_CODEF_CONNECTED_ID 에 넣는다.
 */
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import * as readline from 'readline'
import { codefRequest, codefService, encryptPassword } from '../src/lib/codef/client'
import { listConnectedIds, listConnectedIdAccounts, BANK_ORG } from '../src/lib/codef/bank'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(`--${name}`)
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => { buf += chunk })
    process.stdin.on('end', () => resolve(buf.replace(/\r?\n$/, '')))
    process.stdin.on('error', reject)
  })
}

/** 비밀번호 획득. --password-stdin 이거나 TTY가 아니면 stdin에서 읽는다. */
async function readSecret(label: string): Promise<string> {
  if (flag('password-stdin') || !process.stdin.isTTY) return readStdin()
  return prompt(label, true)
}

function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  return new Promise(resolve => {
    if (!hidden) {
      rl.question(question, answer => { rl.close(); resolve(answer.trim()) })
      return
    }
    // 비밀번호는 에코하지 않는다.
    const out = process.stdout as NodeJS.WriteStream & { muted?: boolean }
    const write = out.write.bind(out)
    out.write = ((chunk: string, ...rest: unknown[]) =>
      out.muted ? true : write(chunk, ...(rest as []))) as typeof out.write
    rl.question(question, answer => {
      out.write = write
      out.muted = false
      process.stdout.write('\n')
      rl.close()
      resolve(answer.trim())
    })
    out.muted = true
  })
}

function readBase64(file: string): string {
  const resolved = file.startsWith('~') ? path.join(process.env.HOME || '', file.slice(1)) : file
  return fs.readFileSync(resolved).toString('base64')
}

async function main() {
  console.log(`[codef] service = ${codefService()}`)

  if (flag('list')) {
    const ids = await listConnectedIds()
    if (!ids.length) {
      console.log('발급된 connectedId 가 없습니다. --cert 또는 --id 로 계정을 등록하세요.')
      return
    }
    for (const id of ids) {
      const accounts = await listConnectedIdAccounts(id)
      const orgNames = accounts.map(a => {
        const name = Object.entries(BANK_ORG).find(([, code]) => code === a.organization)?.[0]
        return `${a.organization}${name ? `(${name})` : ''}/${a.businessType}/${a.clientType}`
      })
      console.log(`- ${id}: ${orgNames.join(', ') || '등록된 기관 없음'}`)
    }
    return
  }

  const organizations = (arg('org') || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
  if (!organizations.length) {
    console.error('--org <기관코드> 가 필요합니다. (우리 0020, 신한 0088, 여러 개는 쉼표로 구분)')
    process.exit(1)
  }

  // 기관마다 별도 항목이지만 인증수단은 같으므로 비밀번호는 한 번만 입력받는다.
  const account: Record<string, string> = {
    countryCode: 'KR',
    businessType: 'BK',
    clientType: 'B', // 법인
  }

  if (flag('cert')) {
    const der = arg('der')
    const key = arg('key')
    if (!der || !key) {
      console.error('--der <signCert.der> --key <signPri.key> 가 필요합니다.')
      process.exit(1)
    }
    account.loginType = '0'
    account.certType = '1'
    account.derFile = readBase64(der)
    account.keyFile = readBase64(key)
    const pw = await readSecret('인증서 비밀번호: ')
    if (!pw) { console.error('비밀번호가 비어 있습니다.'); process.exit(1) }
    account.password = encryptPassword(pw)
  } else if (flag('id')) {
    const loginId = arg('login-id')
    if (!loginId) {
      console.error('--login-id <인터넷뱅킹 아이디> 가 필요합니다.')
      process.exit(1)
    }
    account.loginType = '1'
    account.id = loginId
    const pw = await readSecret('인터넷뱅킹 비밀번호: ')
    if (!pw) { console.error('비밀번호가 비어 있습니다.'); process.exit(1) }
    account.password = encryptPassword(pw)
  } else {
    console.error('--list / --cert / --id 중 하나를 지정하세요.')
    process.exit(1)
  }

  const existing = arg('connected-id')
  const accountList = organizations.map(organization => ({ ...account, organization }))
  const body: Record<string, unknown> = { accountList }
  if (existing) body.connectedId = existing

  const orgLabel = organizations
    .map(code => {
      const name = Object.entries(BANK_ORG).find(([, c]) => c === code)?.[0]
      return name ? `${code}(${name})` : code
    })
    .join(', ')
  console.log(`[codef] 등록 대상 기관: ${orgLabel}`)

  const res = await codefRequest<{
    connectedId?: string
    successList: unknown[]
    errorList: unknown[]
  }>(existing ? '/v1/account/add' : '/v1/account/create', body)

  console.log('successList:', JSON.stringify(res.data.successList, null, 2))
  if (res.data.errorList?.length) {
    console.log('errorList:', JSON.stringify(res.data.errorList, null, 2))
  }
  const connectedId = res.data.connectedId || existing
  if (connectedId) {
    console.log(`\nconnectedId = ${connectedId}`)
    console.log('.env.local 에 아래 줄을 추가하세요:')
    console.log(`TENSW_CODEF_CONNECTED_ID=${connectedId}`)
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
