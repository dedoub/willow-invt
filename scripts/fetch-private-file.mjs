#!/usr/bin/env node
// 비공개 버킷에서 파일 하나를 받아 온다.
//
//   node scripts/fetch-private-file.mjs signatures tensw/corp-seal.png /tmp/seal.png
//
// 인감·서명 같은 것은 저장소에 두지 않는다. 공개 버킷에 두면 URL 만으로 누구나 가져간다.

import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const [bucket, key, destination] = process.argv.slice(2)
if (!bucket || !key || !destination) {
  console.error('사용법: node scripts/fetch-private-file.mjs <버킷> <키> <저장경로>')
  process.exit(1)
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
const { data, error } = await supabase.storage.from(bucket).download(key)
if (error) {
  console.error(`받지 못했어요: ${bucket}/${key} — ${error.message}`)
  process.exit(1)
}

await fs.mkdir(path.dirname(path.resolve(destination)), { recursive: true })
await fs.writeFile(destination, Buffer.from(await data.arrayBuffer()), { mode: 0o600 })
console.log(destination)
