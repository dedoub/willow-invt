// 증빙 묶음(evidence bundle) 생성.
// buildBundle: 정산의 업무기록·증빙·문서·인보이스·현금 스냅샷으로 번들 콘텐츠(index.pdf/manifest.json/docs/)를 만든다.
// registerBundle: 만든 번들을 법인 서류함(evidence_bundle 문서)에 등록하고 정산에 연결한다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { extensionForMime } from '../corp-records/versions.mjs'

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

async function findVersionEventId(corp, doc, version) {
  try {
    const { data, error } = await corp.client
      .from('willow_corp_events')
      .select('id, payload')
      .eq('company', doc.company)
      .eq('entity_type', 'document')
      .eq('entity_id', doc.doc_no)
      .eq('event', 'version_added')
      .order('id', { ascending: false })
    if (error || !data) return null
    return data.find((e) => Number(e.payload?.version_no) === version.version_no)?.id ?? null
  } catch {
    return null
  }
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

  return template
    .replaceAll('{{ref}}', esc(settlement.ref_no))
    .replaceAll('{{period}}', esc(settlement.period_label ?? '-'))
    .replaceAll('{{provider_label}}', esc(COMPANY_LABEL[settlement.provider_company] ?? settlement.provider_company))
    .replaceAll('{{client_label}}', esc(COMPANY_LABEL[settlement.client_company] ?? settlement.client_company))
    .replaceAll('{{status}}', esc(settlement.status))
    .replaceAll('{{generated_at}}', esc(new Date().toISOString()))
    .replace('{{agreement_table}}', agreementTable)
    .replace('{{engagement_table}}', engagementTable)
    .replace('{{works_table}}', worksTable)
    .replace('{{doc_status_table}}', docStatusTable)
    .replace('{{invoices_table}}', invoicesTable)
    .replace('{{cash_table}}', cashTable)
    .replace('{{reconciliation_block}}', reconciliationBlock)
    .replace('{{hash_table}}', hashTable)
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
      const { data, error } = await corp.client.storage.from('corp-records').download(version.storage_path)
      if (error) throw new Error(`download ${doc.doc_no}: ${error.message}`)
      writeFileSync(destPath, Buffer.from(await data.arrayBuffer()))
    }
    const eventId = await findVersionEventId(corp, doc, version)
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

// registerBundle(db, settlementRef, { zipPath, manifest }, { titlePrefix } = {}) → doc_no
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

  const buffer = readFileSync(zipPath)
  const doc = await db.corp.createDocument({
    company: provider,
    docType: 'evidence_bundle',
    category: 'contract',
    title: `${titlePrefix}증빙 묶음 ${settlementRef} (${period})`,
    tags: ['b2b', settlementRef],
  })
  await db.corp.setCounterparty(doc.doc_no, client)
  const contentText = buildContentSummary({ settlement, manifest })
  await db.corp.addVersion({
    docNo: doc.doc_no,
    kind: 'final_signed',
    buffer,
    mime: 'application/zip',
    contentText,
    note: 'evidence bundle',
    generatedBy: 'agent',
  })
  await db.setBundle(settlementRef, doc.doc_no)
  return doc.doc_no
}
