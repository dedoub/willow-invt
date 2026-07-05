# 개인 지메일 context 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 윌로우 대시보드 Gmail 연동에 개인 지메일을 4번째 context(`personal`)로 추가해 전용 `/personal` 페이지에서 조회·검색·답장·AI 요약한다.

**Architecture:** 기존 Gmail 라우트/컴포넌트가 전부 `?context=` 제네릭이라 대부분 재사용. `gmail-server.ts`에 personal 분기, `analyze` 라우트 context 파라미터화, `EmailBlock`에 연결 버튼 추가, `/personal` 페이지 신규(기존 EmailBlock/EmailDetailDialog/ComposeEmailDialog 재사용). GCP는 개인 gmail.com용 External 동의화면 새 프로젝트.

**Tech Stack:** Next.js App Router (TS), googleapis, Supabase(gmail_tokens), Vercel env, 인라인 스타일 + linear-tokens 디자인 시스템.

## Global Constraints

- 디자인 시스템 준수(CLAUDE.md): border/shadow/ring/outline 금지 → 색상 계층으로 구분. 기존 linear-tokens(`t`) 사용. 신규 UI는 기존 페이지 패턴 복제.
- AI 호출은 기존 `@/lib/gemini-server`의 `analyzeEmails`만 재사용. 신규 AI(claude -p / Anthropic SDK) 도입 금지.
- Vercel env 추가는 반드시 `printf`(echo 금지 — `\n` 유발로 invalid_client).
- 테스트 프레임워크 없음. 각 태스크 검증 = `npx tsc --noEmit`(타입) + `npm run lint`(해당 파일) + 필요 시 수동 브라우저 확인.
- 커밋 메시지는 영어. 각 태스크 끝에 커밋.
- redirect URI는 기존 공유값 그대로: `https://willow-invt.vercel.app/api/gmail/callback`
- Gmail 스코프 기존과 동일: gmail.readonly, gmail.send, gmail.labels

---

### Task 1: `personal` context 백엔드 지원 (타입 + OAuth 클라이언트)

**Files:**
- Modify: `src/lib/gmail-server.ts:17` (GmailContext 타입), `src/lib/gmail-server.ts:40-48` (getOAuth2Client)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type GmailContext = 'default' | 'tensoftworks' | 'willow' | 'personal'`
  - `getOAuth2Client('personal')` → `GOOGLE_CLIENT_ID_PERSONAL` / `GOOGLE_CLIENT_SECRET_PERSONAL` 사용하는 OAuth2 클라이언트

- [ ] **Step 1: GmailContext 타입에 personal 추가**

`src/lib/gmail-server.ts` 17번 줄:
```ts
export type GmailContext = 'default' | 'tensoftworks' | 'willow' | 'personal'
```

- [ ] **Step 2: getOAuth2Client에 personal 분기 추가**

`src/lib/gmail-server.ts` 40-48번 줄의 `getOAuth2Client`를 아래로 교체. 기존 `isTensw` 삼항을 context별 자격증명 선택 함수로 확장(default/willow는 기존 GOOGLE_CLIENT_ID 공유, tensoftworks는 _TENSW, personal은 _PERSONAL):
```ts
// OAuth2 클라이언트 생성 (context별 GCP 프로젝트 분리)
export function getOAuth2Client(context: GmailContext = 'default') {
  const creds =
    context === 'tensoftworks'
      ? { id: process.env.GOOGLE_CLIENT_ID_TENSW, secret: process.env.GOOGLE_CLIENT_SECRET_TENSW }
      : context === 'personal'
        ? { id: process.env.GOOGLE_CLIENT_ID_PERSONAL, secret: process.env.GOOGLE_CLIENT_SECRET_PERSONAL }
        : { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET }
  return new google.auth.OAuth2(creds.id, creds.secret, process.env.GOOGLE_REDIRECT_URI)
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (personal 추가로 인한 union 관련 에러 없음 — gmailContext는 string, 라우트들은 `as GmailContext` 캐스팅이라 영향 없음)

- [ ] **Step 4: 커밋**

```bash
git add src/lib/gmail-server.ts
git commit -m "feat(gmail): add personal context to OAuth client"
```

---

### Task 2: analyze 라우트 context 파라미터화

**Files:**
- Modify: `src/app/api/gmail/analyze/route.ts:44-66` (body 파싱을 getGmailClient 앞으로 이동, context 적용)

**Interfaces:**
- Consumes: `getGmailClient(context)`, `GmailContext` (Task 1)
- Produces: `POST /api/gmail/analyze` 가 body의 `context`(기본 `'default'`)를 받아 해당 인박스를 분석

- [ ] **Step 1: 현재 코드 확인**

`src/app/api/gmail/analyze/route.ts` 47번은 `const gmail = await getGmailClient()` (context 없음, default 고정), body는 59번에서야 파싱됨. context를 body에서 받으려면 body 파싱을 gmail 클라이언트 생성 앞으로 옮겨야 한다.

- [ ] **Step 2: import에 GmailContext 추가**

`src/app/api/gmail/analyze/route.ts` 2번 줄:
```ts
import { getGmailClient, parseEmail, GmailContext } from '@/lib/gmail-server'
```

- [ ] **Step 3: body 선파싱 + context로 getGmailClient 호출**

47번 줄 `const gmail = await getGmailClient()` 부터 60번 줄 `const label = body.label || 'INBOX'` 까지의 순서를 조정한다. 아래처럼 body를 먼저 읽고 context를 뽑아 gmail 클라이언트를 생성하도록 교체:
```ts
    const body = await request.json()
    const context = (body.context || 'default') as GmailContext

    const gmail = await getGmailClient(context)

    if (!gmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // AI 컨텍스트 설정 조회
    const contextSettings = await getAIContextSettings()
    const customContext = contextSettings?.is_enabled && contextSettings?.context_text
      ? contextSettings.context_text
      : undefined

    const label = body.label || 'INBOX'
```
주의: 기존에 `const body = await request.json()`가 아래쪽(59번 부근)에 이미 있으므로 **중복 선언이 되지 않도록** 기존 body 파싱 줄을 제거하고 위 블록으로 일원화한다. `body.daysBack` 등 이후 참조는 그대로 유지된다.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. 특히 `body` 중복 선언(`Cannot redeclare block-scoped variable 'body'`) 에러가 없어야 한다 — 있으면 기존 body 파싱 줄이 남아있는 것이니 제거.

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/gmail/analyze/route.ts
git commit -m "feat(gmail): parameterize analyze route by context"
```

---

### Task 3: EmailBlock에 연결 버튼(onConnect) 추가

**Files:**
- Modify: `src/app/(dashboard)/(linear)/mgmt/_components/email-block.tsx:10-17` (Props), `:83-85` (구조분해), `:256-261` (미연결 블록)

**Interfaces:**
- Consumes: 없음
- Produces: `EmailBlock`에 옵셔널 `onConnect?: () => void` prop. 전달 시 미연결 상태에서 "Gmail 연결" 버튼 노출. 미전달 시 기존 동작(안내 문구만) 유지 → mgmt/etc/akros 회귀 없음.

- [ ] **Step 1: EmailBlockProps에 onConnect 추가**

`email-block.tsx` 10-17번 인터페이스:
```ts
interface EmailBlockProps {
  emails: FullEmail[]
  connected: boolean
  onSelectEmail: (email: FullEmail) => void
  onSync: () => void
  onCompose: () => void
  isSyncing?: boolean
  onConnect?: () => void
}
```

- [ ] **Step 2: 구조분해에 onConnect 추가**

83-85번 함수 시그니처의 구조분해:
```ts
  emails, connected, onSelectEmail, onSync, onCompose, isSyncing, onConnect,
}: EmailBlockProps) {
```

- [ ] **Step 3: 미연결 블록에 연결 버튼 렌더**

256-261번 `{!connected && (...)}` 블록을 아래로 교체(디자인 시스템: border 없음, 배경색으로 구분, brand 색상 버튼):
```tsx
        {!connected && (
          <div style={{
            padding: '20px 16px', textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle,
          }}>
            <div>Gmail 연결이 필요합니다</div>
            {onConnect && (
              <button
                onClick={onConnect}
                style={{
                  padding: '6px 14px', borderRadius: t.radius.pill, border: 'none',
                  cursor: 'pointer', fontSize: 'calc(12px * var(--fz, 1))',
                  fontFamily: t.font.sans, fontWeight: t.weight.medium,
                  background: t.brand[100], color: t.brand[700],
                }}
              >Gmail 연결</button>
            )}
          </div>
        )}
```

- [ ] **Step 4: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint -- src/app/\(dashboard\)/\(linear\)/mgmt/_components/email-block.tsx`
Expected: 에러 없음. 기존 EmailBlock 사용처(mgmt/etc/akros)는 onConnect 미전달이라 옵셔널로 통과.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(dashboard)/(linear)/mgmt/_components/email-block.tsx"
git commit -m "feat(gmail): add optional connect button to EmailBlock"
```

---

### Task 4: `/personal` 페이지 + 사이드바 네비

**Files:**
- Create: `src/app/(dashboard)/(linear)/personal/page.tsx`
- Modify: `src/app/(dashboard)/_components/linear-sidebar.tsx:10-16` (NAV_ITEMS)

**Interfaces:**
- Consumes: `EmailBlock`(+onConnect, Task 3), `EmailDetailDialog`, `ComposeEmailDialog`, `FullEmail`(mgmt/_components), `analyze/emails/status` 라우트(context=personal), `getOAuth2Client` personal(Task 1)
- Produces: `/personal` 라우트 페이지

- [ ] **Step 1: 사이드바에 개인 메일 항목 추가**

`linear-sidebar.tsx` 10-16번 `NAV_ITEMS` 배열에 항목 추가(mail 아이콘은 linear-icons에 이미 존재):
```ts
const NAV_ITEMS = [
  { key: 'mgmt',       href: '/mgmt',       label: '사업관리',    icon: 'briefcase' },
  { key: 'wiki',       href: '/wiki',       label: '업무위키',    icon: 'book' },
  { key: 'invest',     href: '/invest',     label: '주식투자',     icon: 'trending' },
  { key: 'realestate', href: '/realestate', label: '부동산리서치', icon: 'building' },
  { key: 'ryuha',      href: '/ryuha',      label: '류하일정',    icon: 'calendar' },
  { key: 'personal',   href: '/personal',   label: '개인 메일',   icon: 'mail' },
]
```

- [ ] **Step 2: /personal 페이지 생성**

`src/app/(dashboard)/(linear)/personal/page.tsx` 신규 작성. etc 페이지의 이메일 섹션만 추출한 단일 컬럼 레이아웃. context='personal', label='INBOX', 미연결 시 onConnect로 `/api/gmail/auth?context=personal` 이동:
```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { EmailBlock } from '@/app/(dashboard)/(linear)/mgmt/_components/email-block'
import { EmailDetailDialog, FullEmail } from '@/app/(dashboard)/(linear)/mgmt/_components/email-detail-dialog'
import { ComposeEmailDialog } from '@/app/(dashboard)/(linear)/mgmt/_components/compose-email-dialog'

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

export default function PersonalPage() {
  const [emails, setEmails] = useState<FullEmail[]>([])
  const [emailConnected, setEmailConnected] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState<FullEmail | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<ComposeMode>('new')
  const [composeOriginal, setComposeOriginal] = useState<FullEmail | null>(null)

  const fetchEmails = useCallback(async () => {
    try {
      const statusRes = await fetch('/api/gmail/status?context=personal')
      if (!statusRes.ok) return
      const statusData = await statusRes.json()
      setEmailConnected(statusData.isConnected)
      if (statusData.isConnected) {
        const emailRes = await fetch('/api/gmail/emails?context=personal&label=INBOX&maxResults=50&daysBack=30&autoAnalyze=false')
        if (emailRes.ok) {
          const emailData = await emailRes.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setEmails((emailData.emails || []).map((e: any) => ({
            id: e.id,
            from: e.from || '',
            fromName: e.fromName || undefined,
            to: e.to || '',
            subject: e.subject || '(제목 없음)',
            date: e.date || new Date().toISOString(),
            body: e.body || undefined,
            snippet: e.snippet || undefined,
            direction: e.direction || 'inbound',
            category: e.category || null,
            attachments: e.attachments || undefined,
            unread: !e.isRead,
            sourceLabel: 'INBOX',
            gmailContext: 'personal',
          })))
        }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchEmails() }, [fetchEmails])

  const handleConnect = () => { window.location.href = '/api/gmail/auth?context=personal' }
  const handleSyncEmails = async () => {
    setIsSyncing(true)
    try { await fetchEmails() } finally { setIsSyncing(false) }
  }
  const handleReply = (email: FullEmail) => { setComposeMode('reply'); setComposeOriginal(email); setComposeOpen(true) }
  const handleForward = (email: FullEmail) => { setComposeMode('forward'); setComposeOriginal(email); setComposeOpen(true) }
  const handleCompose = () => { setComposeMode('new'); setComposeOriginal(null); setComposeOpen(true) }

  return (
    <>
      <div style={{ maxWidth: 720 }}>
        <EmailBlock
          emails={emails}
          connected={emailConnected}
          onSelectEmail={setSelectedEmail}
          onSync={handleSyncEmails}
          onCompose={handleCompose}
          isSyncing={isSyncing}
          onConnect={handleConnect}
        />
      </div>

      <EmailDetailDialog
        email={selectedEmail}
        onClose={() => setSelectedEmail(null)}
        onReply={handleReply}
        onForward={handleForward}
      />
      <ComposeEmailDialog
        open={composeOpen}
        mode={composeMode}
        originalEmail={composeOriginal}
        gmailContext={composeOriginal?.gmailContext || 'personal'}
        onClose={() => { setComposeOpen(false); setComposeOriginal(null) }}
        onSent={() => { fetchEmails() }}
      />
    </>
  )
}
```

- [ ] **Step 3: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 없음.

- [ ] **Step 4: 빌드 확인(라우트 생성)**

Run: `npm run build`
Expected: 빌드 성공, 출력 라우트 목록에 `/personal` 포함.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(dashboard)/(linear)/personal/page.tsx" "src/app/(dashboard)/_components/linear-sidebar.tsx"
git commit -m "feat(gmail): add personal mail page and sidebar nav"
```

---

### Task 5: GCP OAuth 세팅 + Vercel env + 엔드투엔드 검증

**Files:**
- 코드 변경 없음. GCP 콘솔 작업(사용자) + Vercel env + 실연결 검증.

**Interfaces:**
- Consumes: Task 1의 `GOOGLE_CLIENT_ID_PERSONAL` / `GOOGLE_CLIENT_SECRET_PERSONAL` 참조
- Produces: 프로덕션에서 개인 계정 OAuth 연결 동작

- [ ] **Step 1: GCP 프로젝트 + OAuth 클라이언트 생성 (사용자 콘솔)**

console.cloud.google.com 에서:
1. 새 프로젝트 `willow-personal-gmail` 생성
2. "API 및 서비스 → OAuth 동의 화면": User Type = **External** 선택, 앱 이름/지원 이메일 입력, "테스트 사용자"에 `dwkim.august@gmail.com` 추가(테스트 모드 유지 → Google 검증 불필요)
3. "API 및 서비스 → 라이브러리": **Gmail API** 활성화
4. "API 및 서비스 → 사용자 인증 정보 → OAuth 2.0 클라이언트 ID 만들기": 유형 = 웹 애플리케이션
   - 승인된 리디렉션 URI: `https://willow-invt.vercel.app/api/gmail/callback`
5. 발급된 **클라이언트 ID / 클라이언트 보안 비밀** 확보

- [ ] **Step 2: Vercel env 추가 (printf 필수)**

발급값을 프로덕션 env에 추가. echo 금지(`\n` 유발 → invalid_client):
```bash
printf 'PASTE_CLIENT_ID' | npx vercel env add GOOGLE_CLIENT_ID_PERSONAL production
printf 'PASTE_CLIENT_SECRET' | npx vercel env add GOOGLE_CLIENT_SECRET_PERSONAL production
```
로컬 개발도 쓸 거면 `.env.local`에도 동일 키 추가(선택).

- [ ] **Step 3: 배포**

main 푸시 = 프로덕션 자동배포(수동 `vercel --prod` 불필요). Task 1-4 커밋을 push:
```bash
git push origin main
```
Vercel 배포 완료까지 대기.

- [ ] **Step 4: 엔드투엔드 연결 검증 (수동)**

1. 프로덕션 `/personal` 접속 → "Gmail 연결" 버튼 클릭
2. Google 동의화면에서 `dwkim.august@gmail.com` 선택·승인 (테스트 앱 경고 나오면 "계속" → 등록된 테스트 사용자라 통과)
3. 콜백 후 `/personal`로 돌아와 "연결됨" + 받은편지함 목록 표시 확인
4. Supabase `gmail_tokens`에 `context='personal'` 행 생성 확인 (SQL: `select user_id, context, gmail_email from gmail_tokens where context = 'personal'`)

- [ ] **Step 5: 기능 검증 (수동)**

- 스레드 상세 열림 확인
- 답장/새 메일 작성·발송 확인(개인 계정에서 실제 발송)
- 업무 3개 context(mgmt/etc/akros) 이메일 정상 동작(회귀 없음) 확인

- [ ] **Step 6: 실패 시 트러블슈팅 참조**

- 403 org_internal: 동의화면이 External 아님 → Step 1-2 재확인
- 403 access_denied: 테스트 사용자 미등록 → dwkim.august@gmail.com 추가
- 401 invalid_client: env에 `\n` 등 이물질 → printf로 재등록
- 연결 성공 메시지 후 미연결: Gmail API 미활성화 → Step 1-3 확인

---

## Self-Review

**Spec coverage:**
- 백엔드 personal context(spec §1) → Task 1 ✅
- analyze context 파라미터화(spec §2) → Task 2 ✅
- 변경 불필요 라우트(spec §3) → 태스크 없음(의도적, 코드 변경 없음) ✅
- UI 새 페이지 + 연결/목록/검색/답장/AI(spec §4) → Task 3(연결 버튼)+Task 4(페이지). 검색은 EmailBlock 내장 필터/검색 재사용, AI 요약은 analyze(context=personal) 라우트로 후속 연결 가능 — 페이지에 요약 버튼은 최소범위상 미포함(EmailBlock 재사용), 필요 시 후속. ⚠️ 아래 주석 참조
- GCP 세팅(spec §5) → Task 5 ✅
- 자동라벨 생략(spec 범위 외) → 태스크 없음(의도적) ✅

**AI 요약 UI 관련 주석:** spec §4는 "AI 요약 섹션"을 포함했으나, EmailBlock 재사용 범위에는 요약 버튼이 없다. analyze 라우트는 Task 2에서 personal 지원되므로 백엔드는 준비됨. 요약 트리거 UI는 실제 개인 인박스를 보고 필요 형태를 정하는 게 나아 최소구현에서 제외하고, 연결·조회·발송 검증 후 별도 추가한다(YAGNI). Task 5 검증 통과 후 CEO 확인.

**Placeholder scan:** TBD/TODO/"적절히 처리" 없음. 모든 코드 스텝에 실제 코드 포함.

**Type consistency:** `GmailContext`(Task1) ← analyze(Task2)에서 `as GmailContext` 캐스팅으로 일관. `gmailContext`는 컴포넌트에서 `string`이라 'personal' 추가 영향 없음. `onConnect?: () => void`(Task3) ← Task4에서 `handleConnect: () => void`로 전달, 시그니처 일치. `fetchEmails`/`handleSyncEmails`/`handleReply`/`handleForward`/`handleCompose` 네이밍 etc 페이지와 동일.
