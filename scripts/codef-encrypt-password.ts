#!/usr/bin/env npx tsx
/**
 * codef-encrypt-password.ts
 *
 * 인증서 비밀번호를 CODEF publicKey로 RSA 암호화해 출력한다.
 * 자동화 잡이 비밀번호 평문을 들고 있지 않도록, 암호문만 .env.local에 저장한다.
 * 이 암호문은 CODEF 개인키로만 풀 수 있어 다른 곳에서는 쓸모가 없다.
 *
 *   printf '%s' '비밀번호' | npm run codef:encrypt
 *   npm run codef:encrypt                              (TTY면 프롬프트로 입력)
 *   npm run codef:encrypt -- --write-env CODEF_HOMETAX_CERT_PASSWORD_ENC
 *       암호문을 화면에 찍지 않고 .env.local 의 해당 키에 바로 쓴다.
 */
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as readline from 'readline'
import * as fs from 'fs'
import { encryptPassword } from '../src/lib/codef/client'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', c => { buf += c })
    process.stdin.on('end', () => resolve(buf.replace(/\r?\n$/, '')))
    process.stdin.on('error', reject)
  })
}

function promptHidden(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  return new Promise(resolve => {
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

function writeEnv(key: string, value: string) {
  const envPath = path.join(__dirname, '..', '.env.local')
  const raw = fs.readFileSync(envPath, 'utf8')
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  const next = re.test(raw) ? raw.replace(re, line) : `${raw.replace(/\n*$/, '')}\n${line}\n`
  fs.writeFileSync(envPath, next, { mode: 0o600 })
  console.log(`.env.local 의 ${key} 를 갱신했습니다. (암호문 길이 ${value.length})`)
}

async function main() {
  const i = process.argv.indexOf('--write-env')
  const envKey = i >= 0 ? process.argv[i + 1] : undefined
  const pw = process.stdin.isTTY && i < 0 ? await promptHidden('비밀번호: ') : await readStdin()
  if (!pw) { console.error('비밀번호가 비어 있습니다.'); process.exit(1) }
  const enc = encryptPassword(pw)
  if (envKey) writeEnv(envKey, enc)
  else console.log(enc)
}

main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1) })
