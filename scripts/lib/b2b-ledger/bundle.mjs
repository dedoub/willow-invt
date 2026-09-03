// 증빙 묶음(evidence bundle) 생성.
// buildBundle: 정산의 업무기록·증빙·문서·인보이스·현금 스냅샷으로 번들 콘텐츠(index.pdf/manifest.json/docs/)를 만든다.
// registerBundle: 만든 번들을 법인 서류함(evidence_bundle 문서)에 등록하고 정산에 연결한다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { extensionForMime } from '../corp-records/versions.mjs'
import { BUCKET } from '../corp-records/constants.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..', '..')
const TEMPLATE_PATH = join(__dirname, '..', '..', 'b2b-ledger', 'templates', 'bundle-index.html')

const COMPANY_LABEL = { willow: '윌로우인베스트먼트', tensw: '텐소프트웍스', biblo: '비블로' }

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function money(v) {
  return v == null ? '-' : Number(v).toLocaleString('ko-KR')
}

function fmtDate(v) {
  return v ? String(v).slice(0, 10) : '-'
}

// {{key}} 치환. 함수형 replacer로 넣어서 값에 든 $&, $$, $` 등 특수 시퀀스가 그대로 보존되게 한다
// (String.replace/replaceAll에 문자열 치환값을 바로 넘기면 그 시퀀스들이 패턴/매치 참조로 해석되어 깨진다).
export function fillTemplate(template, values) {
  return Object.entries(values).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, () => String(value ?? '')),
    template,
  )
}

function table(headers, rows, emptyText = '없음') {
  if (!rows.length) return `<table><tr><td class="muted">${esc(emptyText)}</td></tr></table>`
  const head = `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
  return `<table>${head}${body}</table>`
}

// 최신 확정본을 고른다: final_signed/reissue 중 최고 버전, 없으면 전체 중 최고 버전.
function pickLatestVersion(versions) {
  if (!versions.length) return null
  const nonDraft = versions.filter((v) => v.kind !== 'draft')
  const pool = nonDraft.length ? nonDraft : versions
  return pool.reduce((best, v) => (!best || v.version_no > best.version_no ? v : best), null)
}

async function resolveDocument(corp, docNo) {
  if (!docNo) return null
  let doc
  try {
    doc = await corp.getDocument(docNo)
  } catch {
    return null
  }
  const versions = await corp.listVersions(doc.id)
  const version = pickLatestVersion(versions)
  return { doc, version }
}

async function findVersionEventId(corp, doc, version, cache) {
  const cacheKey = `${doc.doc_no}:${version.version_no}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)
  let eventId = null
  try {
    const { data, error } = await corp.client
      .from('willow_corp_events')
      .select('id, payload')
      .eq('company', doc.company)
      .eq('entity_type', 'document')
      .eq('entity_id', doc.doc_no)
      .eq('event', 'version_added')
      .order('id', { ascending: false })
    if (!error && data) {
      eventId = data.find((e) => Number(e.payload?.version_no) === version.version_no)?.id ?? null
    }
  } catch {
    eventId = null
  }
  cache.set(cacheKey, eventId)
  return eventId
}

function buildDocEntries({ agreement, engagement, settlement, works }) {
  const entries = [
    { role: '기본계약', label: agreement.title, docNo: agreement.document_doc_no },
    { role: '개별 약정', label: engagement?.ref_no ?? '-', docNo: engagement?.document_doc_no ?? null },
    { role: '업무확인서', label: settlement.ref_no, docNo: settlement.confirmation_doc_no },
    { role: '정산서', label: settlement.ref_no, docNo: settlement.statement_doc_no },
  ]
  for (const w of works) {
    for (const e of w.evidence ?? []) {
      if (e.doc_no) entries.push({ role: `업무기록 증빙 (${w.ref_no})`, label: e.title ?? e.kind, docNo: e.doc_no })
    }
  }
  return entries
}

function renderIndexHtml({ settlement, agreement, engagement, works, invoices, cash, docRows, reconciliation }) {
  const template = readFileSync(TEMPLATE_PATH, 'utf8')

  const agreementTable = table(
    ['제목', '기간', '문서'],
    [[esc(agreement.title), `${fmtDate(agreement.effective_from)} ~ ${fmtDate(agreement.effective_to)}`, esc(agreement.document_doc_no ?? '없음')]],
  )

  const engagementTable = engagement
    ? table(
        ['ref', '역할', '산식', '금액', '근거'],
        [[
          esc(engagement.ref_no),
          esc((engagement.role_scope ?? []).join(', ') || '-'),
          esc(engagement.fee_basis),
          money(engagement.fee_amount),
          esc(engagement.basis_text ?? '-'),
        ]],
      )
    : table([], [], '개별 약정 없음')

  const worksTable = table(
    ['제목', '기간', '산정액', '근거'],
    works.map((w) => [
      esc(w.title),
      `${fmtDate(w.period_from)} ~ ${fmtDate(w.period_to)}`,
      money(w.pricing?.agreed_amount),
      esc(w.pricing?.basis_text ?? '-'),
    ]),
    '연결된 업무기록 없음',
  )

  const docStatusTable = table(
    ['구분', '문서번호', '상태'],
    [
      ['업무확인서', esc(settlement.confirmation_doc_no ?? '없음'), esc(settlement.confirmation_doc_no ? 'linked' : '-')],
      ['정산서', esc(settlement.statement_doc_no ?? '없음'), esc(settlement.statement_doc_no ? 'linked' : '-')],
    ],
  )

  const invoicesTable = table(
    ['구분', '승인번호', '발행일', '공급가액', '합계'],
    [
      invoices.willow
        ? ['윌로우(매출)', esc(invoices.willow.approval_no), fmtDate(invoices.willow.issue_date), money(invoices.willow.supply_amount), money(invoices.willow.total_amount)]
        : null,
      invoices.tensw
        ? ['텐소(매입)', esc(invoices.tensw.approval_no), fmtDate(invoices.tensw.issue_date), money(invoices.tensw.supply_amount), money(invoices.tensw.total_amount)]
        : null,
    ].filter(Boolean),
    '연결된 세금계산서 없음',
  )

  const cashRows = [
    ...cash.willow.map((r) => ['윌로우 수취', fmtDate(r.payment_date), money(r.amount), esc(r.counterparty ?? '-')]),
    ...cash.tensw.map((r) => ['텐소 지급', fmtDate(r.payment_date), money(r.amount), esc(r.counterparty ?? '-')]),
  ]
  const cashTable = table(['구분', '일자', '금액', '거래처'], cashRows, '연결된 입금 행 없음')

  const diffs = reconciliation?.diffs ?? []
  const reconciliationBlock = reconciliation?.ok
    ? '<div class="badge-ok">일치 (ok)</div>'
    : `<div class="badge-diff">불일치: ${esc(diffs.join(', ') || '-')}</div>`

  const hashTable = table(
    ['구분', '문서번호', '버전', 'sha256', '이벤트 id'],
    docRows.map((d) => [
      esc(d.role),
      esc(d.docNo ?? '없음'),
      d.version_no != null ? `v${d.version_no}` : '-',
      d.sha256 ? `<span class="mono">${esc(d.sha256)}</span>` : '-',
      d.event_id != null ? String(d.event_id) : '-',
    ]),
  )

  return fillTemplate(template, {
    ref: esc(settlement.ref_no),
    period: esc(settlement.period_label ?? '-'),
    provider_label: esc(COMPANY_LABEL[settlement.provider_company] ?? settlement.provider_company),
    client_label: esc(COMPANY_LABEL[settlement.client_company] ?? settlement.client_company),
    status: esc(settlement.status),
    generated_at: esc(new Date().toISOString()),
    agreement_table: agreementTable,
    engagement_table: engagementTable,
    works_table: worksTable,
    doc_status_table: docStatusTable,
    invoices_table: invoicesTable,
    cash_table: cashTable,
    reconciliation_block: reconciliationBlock,
    hash_table: hashTable,
  })
}

function buildContentSummary({ settlement, manifest }) {
  const lines = []
  lines.push(`정산 ${settlement.ref_no} (${settlement.period_label ?? '-'})`)
  lines.push(`공급가액 ${settlement.supply_amount} / 부가세 ${settlement.vat_amount} / 합계 ${settlement.total_amount}`)
  lines.push(
    manifest.reconciliation?.ok
      ? '대사: ok'
      : `대사: diffs=${(manifest.reconciliation?.diffs ?? []).join(', ') || '-'}`,
  )
  lines.push('문서 목록:')
  if (manifest.documents.length) {
    for (const d of manifest.documents) lines.push(`- ${d.doc_no} v${d.version_no} (${d.role}) sha256=${d.sha256}`)
  } else {
    lines.push('- 없음')
  }
  return lines.join('\n')
}

// buildBundle(db, settlementRef, outDir?) → { zipPath, indexPdfPath, manifest }
export async function buildBundle(db, settlementRef, outDir) {
  if (!db) throw new Error('db required')
  if (!settlementRef) throw new Error('settlementRef required')
  const corp = db.corp

  const resolvedOutDir = outDir ?? join(ROOT, 'scripts', 'logs', 'corp-records', 'bundles', `${settlementRef}-${Date.now()}`)
  const docsDir = join(resolvedOutDir, 'docs')
  mkdirSync(docsDir, { recursive: true })

  const { settlement, agreement, engagement, works, invoices, cash } = await db.getSettlement(settlementRef)

  const entries = buildDocEntries({ agreement, engagement, settlement, works })
  const resolvedCache = new Map()
  const eventIdCache = new Map()
  const docRows = []
  const manifestDocs = []

  for (const entry of entries) {
    if (!entry.docNo) {
      docRows.push({ ...entry, status: '없음' })
      continue
    }
    let resolved = resolvedCache.get(entry.docNo)
    if (resolved === undefined) {
      resolved = await resolveDocument(corp, entry.docNo)
      resolvedCache.set(entry.docNo, resolved)
    }
    if (!resolved || !resolved.version) {
      docRows.push({ ...entry, status: '없음' })
      continue
    }
    const { doc, version } = resolved
    const filename = `${doc.doc_no}_v${version.version_no}.${extensionForMime(version.mime)}`
    const destPath = join(docsDir, filename)
    if (!existsSync(destPath)) {
      const { data, error } = await corp.client.storage.from(BUCKET).download(version.storage_path)
      if (error) throw new Error(`download ${doc.doc_no}: ${error.message}`)
      writeFileSync(destPath, Buffer.from(await data.arrayBuffer()))
    }
    const eventId = await findVersionEventId(corp, doc, version, eventIdCache)
    docRows.push({ ...entry, status: doc.status, version_no: version.version_no, sha256: version.sha256, file: `docs/${filename}`, event_id: eventId })
    if (!manifestDocs.some((m) => m.doc_no === doc.doc_no && m.version_no === version.version_no)) {
      manifestDocs.push({ doc_no: doc.doc_no, role: entry.role, version_no: version.version_no, sha256: version.sha256, file: `docs/${filename}`, event_id: eventId })
    }
  }

  const reconciliation = settlement.reconciliation ?? (await db.previewReconcile(settlementRef))

  const manifest = {
    settlement: {
      ref_no: settlement.ref_no,
      period_label: settlement.period_label,
      provider_company: settlement.provider_company,
      client_company: settlement.client_company,
      supply_amount: settlement.supply_amount,
      vat_amount: settlement.vat_amount,
      total_amount: settlement.total_amount,
      status: settlement.status,
    },
    documents: manifestDocs,
    reconciliation,
    generated_at: new Date().toISOString(),
  }
  writeFileSync(join(resolvedOutDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  const html = renderIndexHtml({ settlement, agreement, engagement, works, invoices, cash, docRows, reconciliation })
  const indexPdfPath = join(resolvedOutDir, 'index.pdf')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.pdf({ path: indexPdfPath, format: 'A4', printBackground: true })
  } finally {
    await browser.close()
  }

  // Files written with a macOS xattr (e.g. com.apple.provenance) on a non-native filesystem
  // (exFAT/network volumes) get a real "._name" AppleDouble sidecar on disk. Drop those before
  // zipping so the archive only holds the actual documents. Best-effort: `find` is POSIX.
  try { spawnSync('find', [resolvedOutDir, '-name', '._*', '-delete']) } catch { /* find unavailable: ignore */ }
  const zipRes = spawnSync('zip', ['-r', '-X', 'bundle.zip', 'index.pdf', 'manifest.json', 'docs'], { cwd: resolvedOutDir })
  if (zipRes.status !== 0) {
    throw new Error(`zip failed (exit ${zipRes.status}): ${zipRes.stderr?.toString() ?? zipRes.stdout?.toString() ?? ''}`)
  }
  const zipPath = join(resolvedOutDir, 'bundle.zip')

  return { zipPath, indexPdfPath, manifest }
}

const IDENTICAL_CONTENT_RE = /identical content already stored as (v\d+)/

// 이미 존재하는 문서에 새 버전을 붙인다. 방금 만든 zip과 sha256이 같은 버전이 이미 있으면
// (재실행인데 내용 변화가 없는 경우) addVersion이 던지는 "identical content already stored"를
// 잡아서 실패시키지 않고 그 버전을 재사용한 것으로 취급한다.
async function addVersionOrReuse(corp, docNo, versionInput) {
  try {
    await corp.addVersion({ docNo, ...versionInput })
    return { docNo, note: null }
  } catch (err) {
    const match = IDENTICAL_CONTENT_RE.exec(err?.message ?? '')
    if (!match) throw err
    return { docNo, note: `content unchanged since last bundle; reused existing ${match[1]} (no new version created)` }
  }
}

// registerBundle(db, settlementRef, { zipPath, manifest }, { titlePrefix } = {}) → { docNo, note }
//
// 재실행 시 새 evidence_bundle 문서를 또 만들지 않고, 기존 문서에 새 버전(v2, v3, ...)을 붙인다:
//   1) settlement.bundle_doc_no가 있으면 그 문서에 버전 추가.
//   2) 없으면 sourceKey('b2b-bundle:'+ref)로 기존 문서를 찾아 재사용(있었지만 정산에 아직 안 연결된 경우 대비).
//   3) 그래도 없으면 새 문서를 만든다(sourceKey 부여).
// 세 경로 모두 zip 내용이 직전 버전과 동일하면(addVersion의 "identical content" 에러) 실패시키지 않고
// 기존 버전을 그대로 재사용한 것으로 보고한다.
export async function registerBundle(db, settlementRef, built, options = {}) {
  if (!db) throw new Error('db required')
  if (!settlementRef) throw new Error('settlementRef required')
  const { zipPath, manifest } = built ?? {}
  if (!zipPath || !manifest) throw new Error('built.zipPath and built.manifest required')
  const { titlePrefix = '' } = options

  const { settlement } = await db.getSettlement(settlementRef)
  const provider = settlement.provider_company
  const client = settlement.client_company
  const period = settlement.period_label ?? settlement.ref_no
  const sourceKey = `b2b-bundle:${settlementRef}`

  const buffer = readFileSync(zipPath)
  const contentText = buildContentSummary({ settlement, manifest })
  const versionInput = {
    kind: 'final_signed',
    buffer,
    mime: 'application/zip',
    contentText,
    note: 'evidence bundle',
    generatedBy: 'agent',
  }

  if (settlement.bundle_doc_no) {
    const result = await addVersionOrReuse(db.corp, settlement.bundle_doc_no, versionInput)
    await db.setBundle(settlementRef, result.docNo)
    return result
  }

  const existing = await db.corp.getDocumentByKey(sourceKey)
  if (existing) {
    const result = await addVersionOrReuse(db.corp, existing.doc_no, versionInput)
    await db.setBundle(settlementRef, result.docNo)
    return result
  }

  const doc = await db.corp.createDocument({
    company: provider,
    docType: 'evidence_bundle',
    category: 'contract',
    title: `${titlePrefix}증빙 묶음 ${settlementRef} (${period})`,
    tags: ['b2b', settlementRef],
    sourceKey,
  })
  await db.corp.setCounterparty(doc.doc_no, client)
  const result = await addVersionOrReuse(db.corp, doc.doc_no, versionInput)
  await db.setBundle(settlementRef, result.docNo)
  return result
}
