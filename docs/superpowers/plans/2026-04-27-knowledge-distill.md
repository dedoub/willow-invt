# Knowledge Distillation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily pipeline that extracts entities, relations, and insights from emails, Telegram conversations, stock trades, and research into the Knowledge Graph.

**Architecture:** A single TypeScript script (`scripts/knowledge-distill.ts`) processes four data sources in sequence: emails and trades via direct mapping, research and Telegram via Claude CLI analysis. A tracking table (`knowledge_distill_log`) prevents reprocessing. Scheduled via launchd at 06:00 daily.

**Tech Stack:** TypeScript (tsx), Supabase JS client, Claude CLI (spawn), launchd

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `scripts/knowledge-distill.ts` | Main distillation script with all source processors |
| Create | `scripts/run-knowledge-distill.sh` | Shell wrapper for launchd |
| Create | `com.willow.knowledge-distill.plist` | launchd schedule config |
| Create | `supabase/migrations/20260427_knowledge_distill_log.sql` | Tracking table migration |

---

### Task 1: Create tracking table migration

**Files:**
- Create: `supabase/migrations/20260427_knowledge_distill_log.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260427_knowledge_distill_log.sql
CREATE TABLE IF NOT EXISTS knowledge_distill_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  entities_created INTEGER DEFAULT 0,
  relations_created INTEGER DEFAULT 0,
  insights_created INTEGER DEFAULT 0,
  distilled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_distill_log_source ON knowledge_distill_log(source_type, source_id);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Run: Use `mcp__supabase__execute_sql` with project_id `axcfvieqsaphhvbkyzzv` to execute the SQL above.

Verify: Query `SELECT count(*) FROM knowledge_distill_log;` — should return 0.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260427_knowledge_distill_log.sql
git commit -m "feat: add knowledge_distill_log tracking table"
```

---

### Task 2: Create script with infrastructure and KG helpers

**Files:**
- Create: `scripts/knowledge-distill.ts`

- [ ] **Step 1: Write the base infrastructure**

```typescript
// scripts/knowledge-distill.ts
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'
import { writeFileSync, unlinkSync, existsSync } from 'fs'

const LOG_PREFIX = '[knowledge-distill]'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

function log(msg: string) {
  console.log(`${LOG_PREFIX} [${new Date().toISOString()}] ${msg}`)
}

// ============ Claude CLI ============

function askClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete (env as Record<string, string | undefined>).CLAUDECODE

    const args = ['-p', '--output-format', 'json']
    const proc = spawn('claude', args, {
      cwd: process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })

    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else { log(`Claude CLI error (code ${code}): ${stderr.slice(0, 500)}`); reject(new Error(`Claude exited ${code}`)) }
    })
    proc.on('error', (err) => reject(new Error(`Failed to spawn claude: ${err.message}`)))

    const timeout = setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('Claude CLI timeout (60s)')) }, 60_000)
    proc.on('close', () => clearTimeout(timeout))

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

function parseClaudeJson(raw: string): { entities: Array<{ name: string; type: string; description?: string }>; relations: Array<{ subject: string; predicate: string; object: string }>; insights: Array<{ content: string; type: string; context?: string; entity_names?: string[] }> } {
  try {
    const parsed = JSON.parse(raw)
    // Claude --output-format json wraps in { result: "..." } — the result is stringified JSON
    const inner = typeof parsed.result === 'string' ? JSON.parse(parsed.result) : parsed
    return {
      entities: Array.isArray(inner.entities) ? inner.entities : [],
      relations: Array.isArray(inner.relations) ? inner.relations : [],
      insights: Array.isArray(inner.insights) ? inner.insights : [],
    }
  } catch {
    log(`Failed to parse Claude JSON output: ${raw.slice(0, 300)}`)
    return { entities: [], relations: [], insights: [] }
  }
}
```

- [ ] **Step 2: Add KG write helpers**

Append to `scripts/knowledge-distill.ts`:

```typescript
// ============ KG Write Helpers ============

async function upsertEntity(
  name: string, entityType: string, description?: string,
  properties?: Record<string, unknown>, tags?: string[]
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('knowledge_entities').select('id, properties, tags')
    .eq('name', name).limit(1).single()

  if (existing) {
    const merged: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (description) merged.description = description
    if (entityType) merged.entity_type = entityType
    if (properties) merged.properties = { ...(existing.properties || {}), ...properties }
    if (tags) merged.tags = [...new Set([...(existing.tags || []), ...tags])]
    await supabase.from('knowledge_entities').update(merged).eq('id', existing.id)
    return existing.id
  }

  const { data, error } = await supabase.from('knowledge_entities')
    .insert({ name, entity_type: entityType, description: description || '', properties: properties || {}, tags: tags || [], source: 'distill' })
    .select('id').single()
  if (error) { log(`Entity insert error for "${name}": ${error.message}`); return null }
  return data.id
}

async function createRelation(subjectName: string, predicate: string, objectName: string): Promise<boolean> {
  const resolveId = async (n: string) => {
    const { data } = await supabase.from('knowledge_entities').select('id').eq('name', n).limit(1).single()
    if (data) return data.id
    const { data: created } = await supabase.from('knowledge_entities')
      .insert({ name: n, entity_type: 'concept', source: 'auto' }).select('id').single()
    return created?.id
  }
  const [sId, oId] = await Promise.all([resolveId(subjectName), resolveId(objectName)])
  if (!sId || !oId) return false

  // Skip if relation already exists
  const { data: existing } = await supabase.from('knowledge_relations')
    .select('id').eq('subject_id', sId).eq('predicate', predicate).eq('object_id', oId).limit(1).single()
  if (existing) return false

  const { error } = await supabase.from('knowledge_relations')
    .insert({ subject_id: sId, predicate, object_id: oId, properties: {}, source: 'distill' })
  if (error) { log(`Relation error: ${error.message}`); return false }
  return true
}

async function createInsight(content: string, insightType: string, entityNames: string[], context?: string): Promise<boolean> {
  const entityIds: string[] = []
  for (const name of entityNames) {
    const { data } = await supabase.from('knowledge_entities').select('id').eq('name', name).limit(1).single()
    if (data) entityIds.push(data.id)
  }

  // Skip duplicate insights (same content)
  const { data: dup } = await supabase.from('knowledge_insights')
    .select('id').eq('content', content).limit(1).single()
  if (dup) return false

  const { error } = await supabase.from('knowledge_insights')
    .insert({ content, insight_type: insightType, entity_ids: entityIds, context: context || '', status: 'active' })
  if (error) { log(`Insight error: ${error.message}`); return false }
  return true
}
```

- [ ] **Step 3: Add distill log helpers**

Append to `scripts/knowledge-distill.ts`:

```typescript
// ============ Distill Log ============

async function isAlreadyDistilled(sourceType: string, sourceId: string, sourceUpdatedAt?: string): Promise<boolean> {
  const { data } = await supabase.from('knowledge_distill_log')
    .select('source_updated_at').eq('source_type', sourceType).eq('source_id', sourceId).limit(1).single()
  if (!data) return false
  // For telegram: re-process if conversation updated since last distill
  if (sourceUpdatedAt && data.source_updated_at) {
    return new Date(data.source_updated_at) >= new Date(sourceUpdatedAt)
  }
  return true
}

async function markDistilled(
  sourceType: string, sourceId: string,
  counts: { entities: number; relations: number; insights: number },
  sourceUpdatedAt?: string
): Promise<void> {
  await supabase.from('knowledge_distill_log').upsert({
    source_type: sourceType,
    source_id: sourceId,
    source_updated_at: sourceUpdatedAt || null,
    entities_created: counts.entities,
    relations_created: counts.relations,
    insights_created: counts.insights,
    distilled_at: new Date().toISOString(),
  }, { onConflict: 'source_type,source_id' })
}
```

- [ ] **Step 4: Verify infrastructure compiles**

Run: `npx tsx --eval "import './scripts/knowledge-distill.ts'" 2>&1 | head -5`
Expected: No syntax/import errors (will fail at runtime since no main() yet, but should compile).

- [ ] **Step 5: Commit**

```bash
git add scripts/knowledge-distill.ts
git commit -m "feat: add knowledge-distill script infrastructure and KG helpers"
```

---

### Task 3: Implement email distillation

**Files:**
- Modify: `scripts/knowledge-distill.ts`

- [ ] **Step 1: Add the distillEmails function**

Append before the `// ============ Main` section:

```typescript
// ============ Source: Emails ============

// Map common ETF industry email domains to company names
const DOMAIN_COMPANY_MAP: Record<string, string> = {
  'exchangetradedconcepts.com': 'Exchange Traded Concepts',
  'ustreas.gov': 'US Treasury',
  'sec.gov': 'SEC',
  'nasdaq.com': 'Nasdaq',
  'nyse.com': 'NYSE',
  'ishares.com': 'iShares',
  'vanguard.com': 'Vanguard',
  'ssga.com': 'State Street Global Advisors',
  'dtcc.com': 'DTCC',
  'bfrg.com': 'BetterShares',
}

async function distillEmails(): Promise<{ entities: number; relations: number; insights: number }> {
  const counts = { entities: 0, relations: 0, insights: 0 }

  // Fetch analyzed emails not yet distilled (last 90 days)
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
  const { data: emails, error } = await supabase
    .from('email_metadata')
    .select('gmail_message_id, from_email, from_name, subject, entities, topics, action_items, summary, category')
    .eq('is_analyzed', true)
    .gte('date', since)
    .order('date', { ascending: false })
    .limit(200)
  if (error || !emails) { log(`Email fetch error: ${error?.message}`); return counts }

  for (const email of emails) {
    if (await isAlreadyDistilled('email', email.gmail_message_id)) continue

    const itemCounts = { entities: 0, relations: 0, insights: 0 }
    const ent = (email.entities || {}) as {
      people?: string[]; companies?: string[]; products?: string[]; tickers?: string[]
    }

    // Extract people
    for (const person of ent.people || []) {
      if (person.length < 2 || person.length > 100) continue
      if (await upsertEntity(person, 'person')) itemCounts.entities++
    }

    // Extract companies
    for (const company of ent.companies || []) {
      if (company.length < 2 || company.length > 100) continue
      if (await upsertEntity(company, 'company')) itemCounts.entities++
    }

    // Extract tickers as market entities
    for (const ticker of ent.tickers || []) {
      if (await upsertEntity(ticker, 'market', undefined, { ticker })) itemCounts.entities++
    }

    // Person→Company relation from email domain
    if (email.from_email && email.from_name) {
      const domain = email.from_email.split('@')[1]?.toLowerCase()
      const company = domain ? DOMAIN_COMPANY_MAP[domain] : null
      if (company && email.from_name.length >= 2) {
        if (await createRelation(email.from_name, 'works_at', company)) itemCounts.relations++
      }
    }

    // Action items → decision insights
    const actions = email.action_items as Array<{ task: string; priority?: string; owner?: string }> | null
    if (actions) {
      for (const action of actions) {
        if (!action.task || action.task.length < 5) continue
        const relatedEntities = [...(ent.companies || []), ...(ent.tickers || [])].slice(0, 5)
        if (await createInsight(action.task, 'decision', relatedEntities, `From email: ${email.subject}`)) itemCounts.insights++
      }
    }

    await markDistilled('email', email.gmail_message_id, itemCounts)
    counts.entities += itemCounts.entities
    counts.relations += itemCounts.relations
    counts.insights += itemCounts.insights
  }

  return counts
}
```

- [ ] **Step 2: Test email distillation in isolation**

Add a temporary test block at the bottom of the file:

```typescript
// Temporary test
async function testEmails() {
  log('Testing email distillation...')
  const result = await distillEmails()
  log(`Email result: ${JSON.stringify(result)}`)
}
testEmails().catch(e => { log(`Test error: ${e.message}`); process.exit(1) })
```

Run: `cd /Volumes/PRO-G40/app-dev/willow-invt && npx tsx scripts/knowledge-distill.ts`

Expected: Log lines showing emails processed, entities/relations/insights created. Verify in Supabase that `knowledge_entities` has new entries with `source = 'distill'` and `knowledge_distill_log` has entries with `source_type = 'email'`.

- [ ] **Step 3: Remove temporary test block**

Remove the `testEmails()` block added in Step 2.

- [ ] **Step 4: Commit**

```bash
git add scripts/knowledge-distill.ts
git commit -m "feat: add email distillation to knowledge pipeline"
```

---

### Task 4: Implement trade distillation

**Files:**
- Modify: `scripts/knowledge-distill.ts`

- [ ] **Step 1: Add the distillTrades function**

Append after the email section:

```typescript
// ============ Source: Stock Trades ============

async function distillTrades(): Promise<{ entities: number; relations: number; insights: number }> {
  const counts = { entities: 0, relations: 0, insights: 0 }

  const { data: trades, error } = await supabase
    .from('stock_trades')
    .select('ticker, company_name, market, trade_type, quantity, price, total_amount, currency, trade_date')
    .order('trade_date', { ascending: true })
  if (error || !trades) { log(`Trades fetch error: ${error?.message}`); return counts }

  // Aggregate by ticker
  const tickerMap = new Map<string, {
    company: string; market: string; currency: string
    buys: number; sells: number; totalBought: number; totalSold: number
    avgBuyPrice: number; lastTradeDate: string
  }>()

  for (const t of trades) {
    const key = t.ticker.replace('.KS', '')
    const prev = tickerMap.get(key) || {
      company: t.company_name, market: t.market, currency: t.currency,
      buys: 0, sells: 0, totalBought: 0, totalSold: 0, avgBuyPrice: 0, lastTradeDate: '',
    }
    const amt = t.total_amount ?? t.quantity * Number(t.price)
    if (t.trade_type === 'buy') { prev.buys += t.quantity; prev.totalBought += amt }
    else { prev.sells += t.quantity; prev.totalSold += amt }
    if (t.trade_date > prev.lastTradeDate) prev.lastTradeDate = t.trade_date
    tickerMap.set(key, prev)
  }

  for (const [ticker, agg] of tickerMap) {
    if (await isAlreadyDistilled('trade', ticker, agg.lastTradeDate)) continue

    const itemCounts = { entities: 0, relations: 0, insights: 0 }

    // Entity: stock
    if (await upsertEntity(
      agg.company || ticker, 'market',
      `${ticker} (${agg.market})`,
      { ticker, market: agg.market, currency: agg.currency },
      [agg.market === 'US' ? 'US Stock' : 'KR Stock']
    )) itemCounts.entities++

    // Insight: trading pattern
    const netQty = agg.buys - agg.sells
    if (netQty > 0) {
      const avgBuy = agg.totalBought / agg.buys
      const trancheCount = Math.ceil(agg.totalBought / (agg.currency === 'USD' || agg.currency === 'US' ? 5000 : 5000000))
      const content = `${agg.company || ticker}: ${trancheCount}트랜치 매수, 평균단가 ${agg.currency === 'USD' || agg.currency === 'US' ? '$' : '₩'}${Math.round(avgBuy).toLocaleString()}, 보유수량 ${netQty}주`
      if (await createInsight(content, 'pattern', [agg.company || ticker], `Stock trade summary for ${ticker}`)) itemCounts.insights++
    }

    await markDistilled('trade', ticker, itemCounts, agg.lastTradeDate)
    counts.entities += itemCounts.entities
    counts.relations += itemCounts.relations
    counts.insights += itemCounts.insights
  }

  return counts
}
```

- [ ] **Step 2: Test trade distillation in isolation**

Add temporary test:

```typescript
async function testTrades() {
  log('Testing trade distillation...')
  const result = await distillTrades()
  log(`Trade result: ${JSON.stringify(result)}`)
}
testTrades().catch(e => { log(`Test error: ${e.message}`); process.exit(1) })
```

Run: `cd /Volumes/PRO-G40/app-dev/willow-invt && npx tsx scripts/knowledge-distill.ts`

Expected: Log showing trades aggregated by ticker, entities and insights created. Verify `knowledge_entities` has market-type entries.

- [ ] **Step 3: Remove temporary test, commit**

Remove test block.

```bash
git add scripts/knowledge-distill.ts
git commit -m "feat: add trade distillation to knowledge pipeline"
```

---

### Task 5: Implement research distillation (Claude CLI)

**Files:**
- Modify: `scripts/knowledge-distill.ts`

- [ ] **Step 1: Add the distillResearch function**

Append after the trades section:

```typescript
// ============ Source: Stock Research ============

async function distillResearch(): Promise<{ entities: number; relations: number; insights: number }> {
  const counts = { entities: 0, relations: 0, insights: 0 }

  const { data: research, error } = await supabase
    .from('stock_research')
    .select('id, ticker, company_name, market, sector, structural_thesis, notes, verdict, track, sector_tags, scan_date')
    .order('scan_date', { ascending: false })
    .limit(50)
  if (error || !research) { log(`Research fetch error: ${error?.message}`); return counts }

  // Batch research items that need Claude CLI analysis
  const toAnalyze: typeof research = []
  for (const r of research) {
    if (await isAlreadyDistilled('research', r.id)) continue
    if (r.structural_thesis || r.notes) toAnalyze.push(r)
    else {
      // No thesis/notes — just create entity
      if (await upsertEntity(
        r.company_name || r.ticker, 'market',
        `${r.ticker} — ${r.sector || 'unknown sector'}`,
        { ticker: r.ticker, market: r.market, sector: r.sector, track: r.track, verdict: r.verdict },
        r.sector_tags || []
      )) counts.entities++
      await markDistilled('research', r.id, { entities: 1, relations: 0, insights: 0 })
    }
  }

  // Process items with thesis/notes via Claude CLI (batch of up to 10)
  for (const r of toAnalyze.slice(0, 10)) {
    const thesisText = [r.structural_thesis, r.notes].filter(Boolean).join('\n')
    const prompt = `You are a knowledge extraction assistant. Extract structured knowledge from this stock research.

Stock: ${r.company_name} (${r.ticker}), Market: ${r.market}, Sector: ${r.sector || 'unknown'}
Track: ${r.track || 'unknown'}, Verdict: ${r.verdict || 'unknown'}

Research content:
${thesisText}

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "entities": [{"name": "entity name", "type": "company|market|technology|strategy", "description": "one sentence"}],
  "relations": [{"subject": "entity name", "predicate": "uses_technology|serves_market|competes_with|part_of", "object": "entity name"}],
  "insights": [{"content": "one-sentence insight about the stock", "type": "observation|pattern", "context": "source context"}]
}`

    try {
      const raw = await askClaude(prompt)
      const extracted = parseClaudeJson(raw)

      // Write entities
      if (await upsertEntity(
        r.company_name || r.ticker, 'market',
        `${r.ticker} — ${r.sector || 'unknown'}`,
        { ticker: r.ticker, market: r.market, sector: r.sector, track: r.track, verdict: r.verdict },
        r.sector_tags || []
      )) counts.entities++

      for (const e of extracted.entities) {
        if (e.name && e.name !== r.company_name) {
          if (await upsertEntity(e.name, e.type || 'concept', e.description)) counts.entities++
        }
      }

      for (const rel of extracted.relations) {
        if (await createRelation(rel.subject, rel.predicate, rel.object)) counts.relations++
      }

      for (const ins of extracted.insights) {
        const entityNames = [r.company_name || r.ticker, ...(ins.entity_names || [])].filter(Boolean)
        if (await createInsight(ins.content, ins.type || 'observation', entityNames, ins.context)) counts.insights++
      }

      await markDistilled('research', r.id, counts)
      log(`Research distilled: ${r.ticker} (${extracted.entities.length}E, ${extracted.relations.length}R, ${extracted.insights.length}I)`)
    } catch (err) {
      log(`Research ${r.ticker} failed: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  return counts
}
```

- [ ] **Step 2: Test research distillation**

Add temporary test, run, verify Claude CLI is invoked and KG entries appear. Remove test block after.

Run: `cd /Volumes/PRO-G40/app-dev/willow-invt && npx tsx scripts/knowledge-distill.ts`

- [ ] **Step 3: Commit**

```bash
git add scripts/knowledge-distill.ts
git commit -m "feat: add research distillation with Claude CLI analysis"
```

---

### Task 6: Implement Telegram conversation distillation (Claude CLI)

**Files:**
- Modify: `scripts/knowledge-distill.ts`

- [ ] **Step 1: Add the distillTelegram function**

Append after the research section:

```typescript
// ============ Source: Telegram Conversations ============

async function distillTelegram(): Promise<{ entities: number; relations: number; insights: number }> {
  const counts = { entities: 0, relations: 0, insights: 0 }

  // Only CEO conversations (not ryuha)
  const { data: conversations, error } = await supabase
    .from('telegram_conversations')
    .select('chat_id, bot_type, messages, updated_at')
    .eq('bot_type', 'ceo')
  if (error || !conversations) { log(`Telegram fetch error: ${error?.message}`); return counts }

  for (const conv of conversations) {
    const sourceId = `chat:${conv.chat_id}`
    const updatedAt = conv.updated_at || new Date().toISOString()
    if (await isAlreadyDistilled('telegram', sourceId, updatedAt)) continue

    const messages = (conv.messages || []) as Array<{ role: string; content: string; timestamp?: string }>
    if (messages.length < 3) continue // Skip very short conversations

    // Take last 30 messages for analysis (avoid context overflow)
    const recent = messages.slice(-30)
    const transcript = recent.map(m => `[${m.role}] ${m.content.slice(0, 500)}`).join('\n')

    const prompt = `You are a knowledge extraction assistant. Analyze this Telegram conversation between a CEO and their AI assistant. Extract decisions made, key observations, and entities discussed.

Conversation (most recent messages):
${transcript}

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "entities": [{"name": "entity name", "type": "person|company|market|project|strategy|concept", "description": "one sentence"}],
  "relations": [{"subject": "entity name", "predicate": "manages|invested_in|uses_technology|collaborates_with|leads", "object": "entity name"}],
  "insights": [{"content": "one-sentence decision, observation, or pattern", "type": "decision|observation|pattern", "context": "brief context from conversation", "entity_names": ["related entity names"]}]
}

Focus on:
- Business decisions made by the CEO
- Investment observations or strategy changes
- Key people, companies, or stocks discussed
- Patterns in CEO's thinking or preferences
Skip routine greetings, system messages, and trivial exchanges.`

    try {
      const raw = await askClaude(prompt)
      const extracted = parseClaudeJson(raw)

      for (const e of extracted.entities) {
        if (e.name && e.name.length >= 2) {
          if (await upsertEntity(e.name, e.type || 'concept', e.description)) counts.entities++
        }
      }

      for (const rel of extracted.relations) {
        if (await createRelation(rel.subject, rel.predicate, rel.object)) counts.relations++
      }

      for (const ins of extracted.insights) {
        const entityNames = ins.entity_names || []
        if (await createInsight(ins.content, ins.type || 'observation', entityNames, ins.context || 'Telegram CEO conversation')) counts.insights++
      }

      await markDistilled('telegram', sourceId, counts, updatedAt)
      log(`Telegram distilled: chat ${conv.chat_id} (${extracted.entities.length}E, ${extracted.relations.length}R, ${extracted.insights.length}I)`)
    } catch (err) {
      log(`Telegram chat ${conv.chat_id} failed: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  return counts
}
```

- [ ] **Step 2: Test Telegram distillation**

Add temporary test, run, verify. Remove test block after.

Run: `cd /Volumes/PRO-G40/app-dev/willow-invt && npx tsx scripts/knowledge-distill.ts`

Expected: Claude CLI called with conversation transcript. Knowledge entities and insights created from CEO conversation.

- [ ] **Step 3: Commit**

```bash
git add scripts/knowledge-distill.ts
git commit -m "feat: add telegram conversation distillation with Claude CLI"
```

---

### Task 7: Implement main orchestrator and test end-to-end

**Files:**
- Modify: `scripts/knowledge-distill.ts`

- [ ] **Step 1: Add the main function**

Append at the bottom of the file:

```typescript
// ============ Main ============

async function main() {
  log('=== Knowledge Distillation Started ===')
  const startTime = Date.now()

  const results: Record<string, { entities: number; relations: number; insights: number }> = {}

  // Phase 1: Direct mapping (no Claude CLI)
  try {
    log('Phase 1: Email distillation...')
    results.email = await distillEmails()
    log(`Email done: ${JSON.stringify(results.email)}`)
  } catch (err) {
    log(`Email phase failed: ${err instanceof Error ? err.message : 'unknown'}`)
    results.email = { entities: 0, relations: 0, insights: 0 }
  }

  try {
    log('Phase 1: Trade distillation...')
    results.trade = await distillTrades()
    log(`Trade done: ${JSON.stringify(results.trade)}`)
  } catch (err) {
    log(`Trade phase failed: ${err instanceof Error ? err.message : 'unknown'}`)
    results.trade = { entities: 0, relations: 0, insights: 0 }
  }

  // Phase 2: Claude CLI analysis
  try {
    log('Phase 2: Research distillation...')
    results.research = await distillResearch()
    log(`Research done: ${JSON.stringify(results.research)}`)
  } catch (err) {
    log(`Research phase failed: ${err instanceof Error ? err.message : 'unknown'}`)
    results.research = { entities: 0, relations: 0, insights: 0 }
  }

  try {
    log('Phase 2: Telegram distillation...')
    results.telegram = await distillTelegram()
    log(`Telegram done: ${JSON.stringify(results.telegram)}`)
  } catch (err) {
    log(`Telegram phase failed: ${err instanceof Error ? err.message : 'unknown'}`)
    results.telegram = { entities: 0, relations: 0, insights: 0 }
  }

  // Summary
  const totals = Object.values(results).reduce(
    (acc, r) => ({ entities: acc.entities + r.entities, relations: acc.relations + r.relations, insights: acc.insights + r.insights }),
    { entities: 0, relations: 0, insights: 0 }
  )
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  log(`=== Done in ${elapsed}s ===`)
  log(`Total: ${totals.entities} entities, ${totals.relations} relations, ${totals.insights} insights`)
  log(`By source: ${JSON.stringify(results)}`)
}

main().catch(err => {
  log(`Fatal: ${err instanceof Error ? err.message : 'unknown'}`)
  process.exit(1)
})
```

- [ ] **Step 2: Run full end-to-end test**

Run: `cd /Volumes/PRO-G40/app-dev/willow-invt && npx tsx scripts/knowledge-distill.ts`

Expected:
1. Email phase runs first (fast, direct mapping)
2. Trade phase runs (fast, direct mapping)
3. Research phase runs (Claude CLI calls)
4. Telegram phase runs (Claude CLI calls)
5. Summary printed with totals

Verify in Supabase:
- `knowledge_entities` has new entries with `source = 'distill'` or `source = 'auto'`
- `knowledge_relations` has new entries
- `knowledge_insights` has new entries
- `knowledge_distill_log` has entries for processed sources

- [ ] **Step 3: Run again to verify idempotency**

Run: `cd /Volumes/PRO-G40/app-dev/willow-invt && npx tsx scripts/knowledge-distill.ts`

Expected: All sources skipped (already distilled). Totals should be 0/0/0.

- [ ] **Step 4: Commit**

```bash
git add scripts/knowledge-distill.ts
git commit -m "feat: add main orchestrator for knowledge distillation pipeline"
```

---

### Task 8: Create shell wrapper and launchd schedule

**Files:**
- Create: `scripts/run-knowledge-distill.sh`
- Create: `com.willow.knowledge-distill.plist`

- [ ] **Step 1: Create the shell wrapper**

```bash
#!/bin/bash
# Knowledge Distillation Pipeline — daily at 06:00

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$SCRIPT_DIR/logs/knowledge-distill.log"

mkdir -p "$SCRIPT_DIR/logs"
cd "$PROJECT_DIR" || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.claude/local/bin:$PATH"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Knowledge distillation started" >> "$LOG_FILE"
npx tsx scripts/knowledge-distill.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Complete (exit: $EXIT_CODE)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

exit $EXIT_CODE
```

- [ ] **Step 2: Make shell script executable**

Run: `chmod +x /Volumes/PRO-G40/app-dev/willow-invt/scripts/run-knowledge-distill.sh`

- [ ] **Step 3: Create the launchd plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.willow.knowledge-distill</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Volumes/PRO-G40/app-dev/willow-invt/scripts/run-knowledge-distill.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Volumes/PRO-G40/app-dev/willow-invt</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>6</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/knowledge-distill.log</string>
    <key>StandardErrorPath</key>
    <string>/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/knowledge-distill.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
```

- [ ] **Step 4: Register with launchd**

Run:
```bash
cp /Volumes/PRO-G40/app-dev/willow-invt/com.willow.knowledge-distill.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.willow.knowledge-distill.plist
launchctl list | grep knowledge-distill
```

Expected: `com.willow.knowledge-distill` appears in launchctl list.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-knowledge-distill.sh com.willow.knowledge-distill.plist
git commit -m "feat: add launchd schedule for knowledge distillation (daily 06:00)"
```
