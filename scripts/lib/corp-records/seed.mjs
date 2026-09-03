import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { extractPdfText, extractDocxText, convertDocxToPdf, guessMime } from './text-extract.mjs'
import { splitRegulationSections, replaceArticleBody } from './articles-parser.mjs'
import { sha256Hex } from './versions.mjs'

// url 항목은 로컬 폴더에 한 번 내려받아 재사용한다(재실행 시 네트워크 불필요).
async function materialize(dir, v) {
  if (v.file) return join(dir, v.file)
  if (!v.url) throw new Error('version needs file or url')
  const local = join(dir, v.localName ?? basename(new URL(v.url).pathname))
  if (!existsSync(local)) {
    const res = await fetch(v.url)
    if (!res.ok) throw new Error(`download failed ${res.status}: ${v.url}`)
    writeFileSync(local, Buffer.from(await res.arrayBuffer()))
  }
  return local
}

function pickSection(text, section) {
  const { body, attachments } = splitRegulationSections(text)
  if (!section || section === 'body') return body
  const m = /^attachment:(\d+)$/.exec(section)
  if (!m) throw new Error(`unknown section: ${section}`)
  const att = attachments.find(a => a.index === Number(m[1]))
  if (!att) throw new Error(`attachment ${m[1]} not found`)
  return `${att.title}\n${att.text}`
}

export async function runSeed({ db, manifestPath, root, log = () => {} }) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const company = manifest.company ?? 'willow'
  const dir = join(root, manifest.localDir)
  const created = []
  const skipped = []
  const docIdByKey = {}
  const docNoByKey = {}

  await db.ensureBucket()

  for (const d of manifest.documents ?? []) {
    let doc = await db.getDocumentByKey(d.key)
    if (doc) { skipped.push(`document ${d.key}`) } else {
      doc = await db.createDocument({
        company, docType: d.type, category: d.category ?? 'other', title: d.title, issuedBy: d.issuedBy ?? null, issuedAt: d.issued ?? null,
        validFrom: d.validFrom ?? null, validTo: d.validTo ?? null, counterparty: d.counterparty ?? null,
        contractStart: d.contractStart ?? null, contractEnd: d.contractEnd ?? null, tags: d.tags ?? [], sourceKey: d.key,
      })
      created.push(`document ${d.key} → ${doc.doc_no}`)
    }
    docIdByKey[d.key] = doc.id
    docNoByKey[d.key] = doc.doc_no
    const existing = await db.listVersions(doc.id)
    for (const v of d.versions ?? []) {
      const srcPath = await materialize(dir, v)
      let path = srcPath
      if (v.convert && /\.docx$/i.test(path)) path = convertDocxToPdf(path, dirname(path))
      const buffer = readFileSync(path)
      const mime = guessMime(path)
      if (existing.some(x => x.sha256 === sha256Hex(buffer))) { skipped.push(`version ${d.key}/${basename(srcPath)}`); continue }
      let contentText = v.textFile ? readFileSync(join(dir, v.textFile), 'utf8') : null
      if (!contentText && mime === 'application/pdf') contentText = await extractPdfText(buffer)
      if (!contentText && /\.docx$/i.test(srcPath)) contentText = extractDocxText(srcPath)
      if (mime.startsWith('image/')) contentText = null
      const r = await db.addVersion({ docNo: doc.doc_no, kind: v.kind, buffer, mime, contentText, note: v.note ?? null })
      existing.push(r.version)
      created.push(`version ${doc.doc_no} v${r.version.version_no} (${v.kind})`)
      log(`  + ${doc.doc_no} v${r.version.version_no} ${basename(srcPath)}`)
    }
  }

  const ruleIdByKey = {}
  for (const r of manifest.rules ?? []) {
    const found = await db.getRuleByKey(r.key)
    if (found) { ruleIdByKey[r.key] = found.id; skipped.push(`rule ${r.key}`); continue }
    let text = pickSection(readFileSync(join(dir, r.textFile), 'utf8'), r.section)
    if (r.replaceArticle) text = replaceArticleBody(text, r.replaceArticle.no, r.replaceArticle.body)
    const rule = await db.registerRule({
      company, ruleType: r.type, title: r.title, versionNo: r.version, effectiveFrom: r.from, effectiveTo: r.to ?? null,
      parentRuleId: r.parent ? ruleIdByKey[r.parent] ?? null : null, documentId: r.document ? docIdByKey[r.document] ?? null : null,
      contentText: text, note: r.note ?? null, sourceKey: r.key,
    })
    ruleIdByKey[r.key] = rule.id
    created.push(`rule ${r.key} v${r.version} (${rule.articles.length} articles)`)
    log(`  + rule ${r.type} v${r.version}: ${rule.articles.length}조`)
  }

  if (manifest.profile) {
    const p = manifest.profile
    if (await db.getByKey('willow_corp_profiles', p.key)) skipped.push(`profile ${p.key}`)
    else {
      const facts = JSON.parse(readFileSync(join(dir, p.factsFile), 'utf8'))
      await db.snapshotProfile({ company, asOf: p.asOf, sourceDocumentId: p.source ? docIdByKey[p.source] ?? null : null, facts, sourceKey: p.key })
      created.push(`profile ${p.key}`)
    }
  }

  for (const a of manifest.actions ?? []) {
    if (await db.getByKey('willow_corp_actions', a.key)) { skipped.push(`action ${a.key}`); continue }
    await db.addAction({ company, documentId: a.document ? docIdByKey[a.document] ?? null : null, kind: a.kind, description: a.desc, dueAt: a.due ?? null, sourceKey: a.key })
    created.push(`action ${a.key}`)
  }

  return { created, skipped, docNos: docNoByKey }
}
