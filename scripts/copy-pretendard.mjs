#!/usr/bin/env node
// Pretendard Variable 동적 서브셋을 node_modules → public/fonts/pretendard 로 복사한다.
// CSS @import로 번들러에 태우면 100여 개 woff2(23MB)를 매 컴파일마다 처리해 dev가 수 분씩 느려져서,
// 정적 파일로 서빙한다(같은 오리진 — CDN 차단 브라우저에서도 로드). public/fonts/pretendard 는 gitignore.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules/pretendard/dist/web/variable')
const dst = join(root, 'public/fonts/pretendard')
if (!existsSync(src)) { console.error('pretendard 패키지가 없습니다 — npm install'); process.exit(1) }
rmSync(dst, { recursive: true, force: true })
mkdirSync(dst, { recursive: true })
cpSync(join(src, 'pretendardvariable-dynamic-subset.css'), join(dst, 'pretendardvariable-dynamic-subset.css'))
cpSync(join(src, 'woff2-dynamic-subset'), join(dst, 'woff2-dynamic-subset'), { recursive: true })
console.log('pretendard → public/fonts/pretendard')
