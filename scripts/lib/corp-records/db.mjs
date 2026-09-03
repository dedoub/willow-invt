import { createClient } from '@supabase/supabase-js'
import { BUCKET, GENESIS_HASH, DOC_TYPES, CATEGORIES, RULE_TYPES, VERSION_KINDS, ACTION_KINDS } from './constants.mjs'
import { computeEventHash, verifyChain } from './hash-chain.mjs'
import { sha256Hex, buildStoragePath, nextVersionNo, assertNewVersionAllowed } from './versions.mjs'
import { maskResidentNumbers, parseArticles } from './articles-parser.mjs'

function assertIn(list, value, label) {
  if (!list.includes(value)) throw new Error(`${label} must be one of ${list.join(', ')} (got ${value})`)
}

function unwrap({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

export function createCorpDb({ url, key, actor = 'cli' }) {
  if (!url || !key) throw new Error('supabase url/key required (.env.local NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY)')
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  async function ensureBucket() {
    const { data } = await sb.storage.getBucket(BUCKET)
    if (data) return data
    unwrap(await sb.storage.createBucket(BUCKET, { public: false }), 'createBucket')
    return (await sb.storage.getBucket(BUCKET)).data
  }

  async function nextRefNo(company, kind, year) {
    return unwrap(await sb.rpc('willow_corp_next_ref_no', { p_company: company, p_kind: kind, p_year: year }), 'next_ref_no')
  }

  async function appendEvent({ company = 'willow', entityType, entityId, event, payload = {} }) {
    const last = unwrap(await sb.from('willow_corp_events').select('hash').eq('company', company).order('id', { ascending: false }).limit(1), 'last event')
    const prevHash = last[0]?.hash ?? GENESIS_HASH
    const at = new Date().toISOString()
    const hash = computeEventHash({ prevHash, entityType, entityId, event, payload, at })
    const res = await sb.from('willow_corp_events').insert({
      company, entity_type: entityType, entity_id: entityId, event, actor, payload, prev_hash: prevHash, hash, at,
    }).select()
    // (company, prev_hash) 유니크 인덱스 위반 = 다른 쓰기가 같은 끝에 이어 붙였다는 뜻. 체인이 갈라지는 대신 여기서 멈춘다.
    if (res.error && (res.error.code === '23505' || `${res.error.message ?? ''}`.includes('willow_corp_events_company_prev_hash_uidx'))) {
      throw new Error('event chain conflict: another writer appended concurrently; retry the operation')
    }
    const rows = unwrap(res, 'insert event')
    return rows[0]
  }

  async function getDocumentByKey(sourceKey) {
    const rows = unwrap(await sb.from('willow_corp_documents').select('*').eq('source_key', sourceKey).limit(1), 'document by key')
    return rows[0] ?? null
  }

  async function getDocument(docNo) {
    const rows = unwrap(await sb.from('willow_corp_documents').select('*').eq('doc_no', docNo).limit(1), 'document')
    if (!rows[0]) throw new Error(`document not found: ${docNo}`)
    return rows[0]
  }

  async function listDocuments({ company = 'willow', docType } = {}) {
    let q = sb.from('willow_corp_documents').select('*, current:willow_corp_document_versions!willow_corp_documents_current_version_fk(version_no, kind, sha256, created_at)').eq('company', company).order('created_at')
    if (docType) q = q.eq('doc_type', docType)
    return unwrap(await q, 'list documents')
  }

  async function createDocument(input) {
    const { company = 'willow', docType, category = 'other', title, decisionId = null, issuedBy = null, issuedAt = null, validFrom = null, validTo = null, counterparty = null, contractStart = null, contractEnd = null, tags = [], sourceKey = null } = input
    assertIn(DOC_TYPES, docType, 'doc_type')
    assertIn(CATEGORIES, category, 'category')
    if (!title) throw new Error('title required')
    const year = new Date(issuedAt ?? Date.now()).getUTCFullYear()
    const docNo = await nextRefNo(company, 'document', year)
    const rows = unwrap(await sb.from('willow_corp_documents').insert({
      company, doc_no: docNo, doc_type: docType, category, title, decision_id: decisionId, issued_by: issuedBy, issued_at: issuedAt,
      valid_from: validFrom, valid_to: validTo, counterparty, contract_start: contractStart, contract_end: contractEnd, tags, source_key: sourceKey,
    }).select(), 'insert document')
    const doc = rows[0]
    await appendEvent({ company, entityType: 'document', entityId: doc.doc_no, event: 'created', payload: { doc_type: docType, title, source_key: sourceKey } })
    return doc
  }

  async function listVersions(documentId) {
    return unwrap(await sb.from('willow_corp_document_versions').select('*').eq('document_id', documentId).order('version_no'), 'list versions')
  }

  async function addVersion({ docNo, kind, buffer, mime, contentText = null, note = null, generatedBy = 'upload' }) {
    assertIn(VERSION_KINDS, kind, 'kind')
    const doc = await getDocument(docNo)
    const existing = await listVersions(doc.id)
    const sha256 = sha256Hex(buffer)
    assertNewVersionAllowed(existing, { sha256, kind })
    const versionNo = nextVersionNo(existing)
    const storagePath = buildStoragePath({ company: doc.company, docNo, versionNo, sha256, mime })
    await ensureBucket()
    const up = await sb.storage.from(BUCKET).upload(storagePath, buffer, { contentType: mime, upsert: false })
    if (up.error) {
      // 앞선 실행이 업로드까지만 하고 죽었을 수 있다. 같은 경로에 같은 내용이면 올린 셈 치고 진행한다.
      if (!/already exists|Duplicate|409/i.test(`${up.error.message ?? ''}`)) throw new Error(`upload: ${up.error.message}`)
      const stored = unwrap(await sb.storage.from(BUCKET).download(storagePath), `download ${storagePath}`)
      if (sha256Hex(Buffer.from(await stored.arrayBuffer())) !== sha256) {
        throw new Error(`storage object exists with different content: ${storagePath}`)
      }
    }
    const rows = unwrap(await sb.from('willow_corp_document_versions').insert({
      document_id: doc.id, version_no: versionNo, kind, storage_path: storagePath, mime, size_bytes: buffer.length,
      sha256, content_text: contentText ? maskResidentNumbers(contentText) : null, generated_by: generatedBy, note, created_by: actor,
    }).select(), 'insert version')
    const version = rows[0]
    const status = kind === 'draft' ? doc.status : 'final'
    const updated = unwrap(await sb.from('willow_corp_documents').update({ current_version_id: version.id, status }).eq('id', doc.id).select(), 'update current version')
    await appendEvent({ company: doc.company, entityType: 'document', entityId: docNo, event: 'version_added', payload: { version_no: versionNo, kind, sha256, storage_path: storagePath } })
    return { version, document: updated[0] }
  }

  async function signedUrl(docNo, versionNo, expiresSec = 3600) {
    const doc = await getDocument(docNo)
    const versions = await listVersions(doc.id)
    const v = versionNo ? versions.find(x => x.version_no === Number(versionNo)) : versions.at(-1)
    if (!v) throw new Error(`no version for ${docNo}`)
    const data = unwrap(await sb.storage.from(BUCKET).createSignedUrl(v.storage_path, expiresSec), 'signed url')
    return data.signedUrl
  }

  async function getRuleByKey(sourceKey) {
    const rows = unwrap(await sb.from('willow_corp_rules').select('*').eq('source_key', sourceKey).limit(1), 'rule by key')
    return rows[0] ?? null
  }

  async function listRules(company = 'willow') {
    return unwrap(await sb.from('willow_corp_rules').select('id, rule_type, title, version_no, effective_from, effective_to, parent_rule_id, document_id, source_key, note').eq('company', company).order('rule_type').order('version_no'), 'list rules')
  }

  async function rulesEffectiveAt(company, date) {
    return unwrap(await sb.rpc('willow_corp_rules_effective_at', { p_company: company, p_at: date }), 'rules effective at')
  }

  async function registerRule(input) {
    const { company = 'willow', ruleType, title, versionNo, effectiveFrom, effectiveTo = null, parentRuleId = null, documentId = null, contentText, note = null, sourceKey = null } = input
    assertIn(RULE_TYPES, ruleType, 'rule_type')
    if (!contentText) throw new Error('contentText required')
    const masked = maskResidentNumbers(contentText)
    const articles = parseArticles(masked)
    // 열려 있는 이전 버전을 먼저 읽고 검증한다. insert 뒤에 실패하면 이벤트 체인에 되돌릴 수 없는 행이 남는다.
    const prevRows = unwrap(await sb.from('willow_corp_rules').select('id, version_no, effective_from, effective_to').eq('company', company).eq('rule_type', ruleType).is('effective_to', null).order('version_no', { ascending: false }).limit(1), 'previous rule')
    const prev = prevRows[0] ?? null
    let closeAt = null
    if (prev) {
      if (versionNo <= prev.version_no) throw new Error(`version_no must exceed the open version ${prev.version_no}`)
      const d = new Date(effectiveFrom)
      d.setUTCDate(d.getUTCDate() - 1)
      closeAt = d.toISOString().slice(0, 10)
      if (closeAt < prev.effective_from) throw new Error('effective_from must be after the previous version effective_from')
    }
    const rows = unwrap(await sb.from('willow_corp_rules').insert({
      company, rule_type: ruleType, title, version_no: versionNo, effective_from: effectiveFrom, effective_to: effectiveTo,
      parent_rule_id: parentRuleId, document_id: documentId, content_text: masked, articles, note, source_key: sourceKey,
    }).select(), 'insert rule')
    const rule = rows[0]
    if (prev) unwrap(await sb.from('willow_corp_rules').update({ effective_to: closeAt }).eq('id', prev.id), 'close previous rule')
    await appendEvent({ company, entityType: 'rule', entityId: rule.id, event: 'rule_registered', payload: { rule_type: ruleType, version_no: versionNo, effective_from: effectiveFrom, effective_to: effectiveTo, articles: articles.length } })
    return rule
  }

  async function snapshotProfile({ company = 'willow', asOf, sourceDocumentId = null, facts, sourceKey = null }) {
    if (!facts || typeof facts !== 'object') throw new Error('facts object required')
    const rows = unwrap(await sb.from('willow_corp_profiles').insert({ company, as_of: asOf, source_document_id: sourceDocumentId, facts, source_key: sourceKey }).select(), 'insert profile')
    await appendEvent({ company, entityType: 'profile', entityId: rows[0].id, event: 'profile_snapshot', payload: { as_of: asOf, directors: facts.directors?.length ?? 0, shareholders: facts.shareholders?.length ?? 0 } })
    return rows[0]
  }

  async function latestProfile(company = 'willow') {
    const rows = unwrap(await sb.from('willow_corp_profiles').select('*').eq('company', company).order('as_of', { ascending: false }).limit(1), 'latest profile')
    return rows[0] ?? null
  }

  async function getByKey(table, sourceKey) {
    const rows = unwrap(await sb.from(table).select('id').eq('source_key', sourceKey).limit(1), `${table} by key`)
    return rows[0] ?? null
  }

  async function addAction({ company = 'willow', decisionId = null, documentId = null, kind, description, dueAt = null, sourceKey = null }) {
    assertIn(ACTION_KINDS, kind, 'kind')
    const rows = unwrap(await sb.from('willow_corp_actions').insert({ company, decision_id: decisionId, document_id: documentId, kind, description, due_at: dueAt, source_key: sourceKey }).select(), 'insert action')
    await appendEvent({ company, entityType: 'action', entityId: rows[0].id, event: 'created', payload: { kind, description, due_at: dueAt } })
    return rows[0]
  }

  async function listActions({ company = 'willow', status = 'pending' } = {}) {
    let q = sb.from('willow_corp_actions').select('*').eq('company', company).order('due_at', { ascending: true, nullsFirst: false })
    if (status) q = q.eq('status', status)
    return unwrap(await q, 'list actions')
  }

  async function doneAction(id, result = null) {
    // pending인 행만 닫는다. 이미 done인 액션을 다시 닫으면 이벤트만 중복으로 쌓인다.
    const rows = unwrap(await sb.from('willow_corp_actions').update({ status: 'done', done_at: new Date().toISOString(), result }).eq('id', id).eq('status', 'pending').select(), 'done action')
    if (!rows[0]) {
      const found = unwrap(await sb.from('willow_corp_actions').select('status').eq('id', id).limit(1), 'action status')
      if (!found[0]) throw new Error(`action not found: ${id}`)
      throw new Error(`action ${id} is ${found[0].status}, not pending`)
    }
    await appendEvent({ company: rows[0].company, entityType: 'action', entityId: id, event: 'action_done', payload: { result } })
    return rows[0]
  }

  async function verifyChainFor(company = 'willow') {
    const rows = unwrap(await sb.from('willow_corp_events').select('id, prev_hash, hash, entity_type, entity_id, event, payload, at').eq('company', company).order('id'), 'events')
    return verifyChain(rows)
  }

  async function verifyStoredVersions(company = 'willow') {
    const docs = await listDocuments({ company })
    const out = []
    for (const doc of docs) {
      for (const v of await listVersions(doc.id)) {
        const file = unwrap(await sb.storage.from(BUCKET).download(v.storage_path), `download ${v.storage_path}`)
        const buf = Buffer.from(await file.arrayBuffer())
        out.push({ docNo: doc.doc_no, versionNo: v.version_no, ok: sha256Hex(buf) === v.sha256 })
      }
    }
    return out
  }

  // 버킷을 회사 폴더 → 문서 폴더 2단으로 훑는다(스토리지에는 재귀 list가 없다).
  async function listStorageFiles(company) {
    const out = []
    const folders = unwrap(await sb.storage.from(BUCKET).list(company, { limit: 1000 }), `list ${company}`)
    for (const folder of folders) {
      if (folder.name.startsWith('.')) continue
      if (folder.id) { out.push(`${company}/${folder.name}`); continue }
      const files = unwrap(await sb.storage.from(BUCKET).list(`${company}/${folder.name}`, { limit: 1000 }), `list ${company}/${folder.name}`)
      for (const f of files) {
        if (!f.id || f.name.startsWith('.')) continue
        out.push(`${company}/${folder.name}/${f.name}`)
      }
    }
    return out
  }

  // 스토리지와 version 행을 양방향으로 대조한다. orphan = 행 없는 파일, missing = 파일 없는 행.
  async function verifyOrphans(company = 'willow') {
    const known = new Set()
    for (const doc of await listDocuments({ company })) {
      for (const v of await listVersions(doc.id)) known.add(v.storage_path)
    }
    const stored = new Set(await listStorageFiles(company))
    return {
      orphans: [...stored].filter(p => !known.has(p)).sort(),
      missing: [...known].filter(p => !stored.has(p)).sort(),
    }
  }

  // 모든 문서·버전·규정이 이벤트 체인에 실제로 기록됐는지 확인한다.
  async function verifyChainCoverage(company = 'willow') {
    const events = unwrap(await sb.from('willow_corp_events').select('entity_type, entity_id, event, payload').eq('company', company), 'events')
    const docCreated = new Set(events.filter(e => e.entity_type === 'document' && e.event === 'created').map(e => e.entity_id))
    const versionAdded = new Set(events.filter(e => e.entity_type === 'document' && e.event === 'version_added').map(e => `${e.entity_id}#${e.payload?.version_no}`))
    const ruleRegistered = new Set(events.filter(e => e.entity_type === 'rule' && e.event === 'rule_registered').map(e => e.entity_id))
    const unchained = []
    for (const doc of await listDocuments({ company })) {
      if (!docCreated.has(doc.doc_no)) unchained.push(`document ${doc.doc_no}`)
      for (const v of await listVersions(doc.id)) {
        if (!versionAdded.has(`${doc.doc_no}#${v.version_no}`)) unchained.push(`version ${doc.doc_no} v${v.version_no}`)
      }
    }
    for (const r of await listRules(company)) {
      if (!ruleRegistered.has(r.id)) unchained.push(`rule ${r.id}`)
    }
    return { unchained }
  }

  return {
    client: sb, ensureBucket, nextRefNo, appendEvent,
    getDocumentByKey, getDocument, listDocuments, createDocument, listVersions, addVersion, signedUrl,
    getRuleByKey, listRules, rulesEffectiveAt, registerRule,
    snapshotProfile, latestProfile, getByKey,
    addAction, listActions, doneAction,
    verifyChain: verifyChainFor, verifyStoredVersions, verifyOrphans, verifyChainCoverage,
  }
}
