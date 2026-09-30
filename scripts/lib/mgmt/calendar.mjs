// calendar.mjs — 한국 영업일. 계산은 kr_workdays.py 하나에 맡긴다(출근부·발송과 같은 달력).
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const pad = n => String(n).padStart(2, '0')
export const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
export const parseKey = k => k.split('-').map(Number)

export function defaultLoadMonth(y, m) {
  const out = execFileSync('python3', [path.join(ROOT, 'scripts/lib/kr_workdays.py'), String(y), String(m)], { encoding: 'utf8' })
  return JSON.parse(out)
}

export function makeCalendar(loadMonth = defaultLoadMonth) {
  const cache = new Map()
  const month = (y, m) => {
    const k = `${y}-${m}`
    if (!cache.has(k)) cache.set(k, loadMonth(y, m))
    return cache.get(k)
  }
  const isWorkday = key => {
    const [y, m, d] = parseKey(key)
    return month(y, m).workdays.includes(d)
  }
  const step = (key, dir) => {
    const t = new Date(`${key}T00:00:00Z`)
    t.setUTCDate(t.getUTCDate() + dir)
    return t.toISOString().slice(0, 10)
  }
  const shift = (key, how) => {
    if (!how) return key
    let k = key
    let steps = 0
    while (!isWorkday(k)) {
      k = step(k, how === 'prev' ? -1 : 1)
      steps++
      if (steps > 40) throw new Error(`영업일을 찾지 못했어요: ${key}`)
    }
    return k
  }
  const backBusinessDays = (key, n) => {
    let k = key
    let steps = 0
    for (let i = 0; i < n; i++) {
      k = step(k, -1)
      steps++
      while (!isWorkday(k)) {
        k = step(k, -1)
        steps++
        if (steps > 40) throw new Error(`영업일을 찾지 못했어요: ${key}`)
      }
    }
    return k
  }
  return { isWorkday, shift, backBusinessDays, lastDay: (y, m) => month(y, m).lastDay }
}
