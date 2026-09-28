/**
 * 대시보드 화면 목록과 파일 → 화면 매핑. ui-check(--all)와 커밋 게이트가 같이 쓴다.
 *
 * 화면 = src/app/(dashboard)/(linear)/**\/page.tsx. 경로의 (그룹) 폴더는 URL 에서 빠진다.
 * 동적 세그먼트([id])가 있는 화면은 대표 URL 을 모르니 목록에서 뺀다 — 생기면 여기서 따로 정한다.
 */
import fs from 'node:fs'
import path from 'node:path'

export const LINEAR_DIR = 'src/app/(dashboard)/(linear)'

const toRoute = (relDir) => '/' + relDir.split('/').filter(seg => seg && !/^\(.*\)$/.test(seg)).join('/')

export function discoverRoutes(root) {
  const base = path.join(root, LINEAR_DIR)
  const out = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'page.tsx') {
        const rel = path.relative(base, dir)
        if (!/\[/.test(rel)) out.push(toRoute(rel))
      }
    }
  }
  walk(base)
  return [...new Set(out)].sort()
}

/**
 * 파일이 속한 화면. (linear) 아래 파일은 경로가 가장 길게 겹치는 화면으로 간다
 * (invest/research/... → /invest/research, invest/_components/... → /invest).
 * 공용(src/app/(dashboard)/_components)은 '*' — 모든 화면이다.
 */
export function routeOfFile(file, routes) {
  if (file.startsWith('src/app/(dashboard)/_components/')) return '*'
  if (!file.startsWith(LINEAR_DIR + '/')) return null
  const route = toRoute(path.dirname(file.slice(LINEAR_DIR.length + 1)).replace(/(^|\/)_[^/]+.*$/, ''))
  let best = null
  for (const r of routes) {
    if (route === r || route.startsWith(r + '/')) { if (!best || r.length > best.length) best = r }
  }
  // 어느 화면에도 안 걸리는 (linear) 파일(layout.tsx 등)은 모든 화면에 걸린다.
  return best ?? '*'
}
