// 저장·전송 전에 비밀값을 가린다. 값은 남기지 않고 종류만 돌려준다.
const MASK = '[가림]'
const RULES = [
  ['pg_url', /(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1' + MASK + '@'],
  ['password', /(PGPASSWORD\s*=\s*)['"]?[^'"\s]+['"]?/g, '$1' + MASK],
  ['password', /((?:비밀번호|비번|패스워드|암호|password|passwd|\bpw)\s*(?:는|은|:|=|->|→)?\s*)[`"']?[^\s`"',]{4,}[`"']?/gi, '$1' + MASK],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}/g, MASK],
  ['api_key', /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, MASK],
  ['api_key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, MASK],
  ['api_key', /\b(?:ghp|gho|github_pat|xox[bap])_[A-Za-z0-9_]{16,}\b/g, MASK],
  ['rrn', /\b\d{6}-[1-4]\d{6}\b/g, MASK],
  ['account', /\b\d{3,6}-\d{2,6}-\d{4,8}(?:-\d{1,3})?\b/g, MASK],
]
// 한 줄에 코드 하나씩, 연속 3줄 이상이면 백업·복구 코드로 본다.
const CODE_LINE = /^\s*[A-Za-z0-9]{4,10}(?:[- ][A-Za-z0-9]{4,10}){0,3}\s*$/

export function redact(input) {
  let text = String(input ?? '')
  const found = []
  const lines = text.split('\n')
  let run = []
  const flush = () => {
    if (run.length >= 3 && run.some(i => /\d/.test(lines[i]))) {
      for (const i of run) lines[i] = MASK
      found.push('backup_codes')
    }
    run = []
  }
  lines.forEach((line, i) => { if (CODE_LINE.test(line)) run.push(i); else flush() })
  flush()
  text = lines.join('\n')
  for (const [kind, re, rep] of RULES) {
    const next = text.replace(re, rep)
    if (next !== text) { found.push(kind); text = next }
  }
  return { text, found }
}
