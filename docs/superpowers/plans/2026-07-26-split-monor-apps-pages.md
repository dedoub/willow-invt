# Split MonoR Apps into VoiceCards / ReviewNotes Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/monor`의 두 앱 블록(VoiceCards·ReviewNotes)을 독립 페이지 `/voicecards`·`/reviewnotes`로 나누고, 각 앱의 하부 섹션을 주요 섹션 단위 `LCard`로 쪼갠다.

**Architecture:** 접근 A — 블록 컴포넌트를 유지하되 하나의 큰 `LCard`를 섹션마다 별도 `LCard`로 감싼다. 블록의 `useDashCols()` 의존을 `cols` prop으로 대체해 페이지가 wide(=1) 고정. 데이터 로딩을 앱별 페이지로 분리. cols-toggle은 공유 인프라라 dashboard `_components`로 이동.

**Tech Stack:** Next.js App Router (client components), TypeScript, 프로젝트 자체 디자인시스템(linear-tokens `LCard`/`LSectionHead`).

## Global Constraints

- 검증 수단: 이 코드베이스는 페이지용 단위테스트 하네스가 없음 → 각 태스크 게이트는 **`npx tsc --noEmit` 통과** + (해당 시) **dev 서버 런타임 렌더 확인**. 단위테스트 신설하지 않음(YAGNI, 프로젝트 관행).
- 디자인시스템 준수(CLAUDE.md): border/shadow/ring 금지·색상으로 구분, `LCard` 기존 패딩/헤더 규칙, 숫자 `toLocaleString()`.
- 커밋 메시지 영어, 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 커밋/푸시 전 `git branch --show-current`로 브랜치 확인(공유 워킹트리).
- 각 태스크 종료 = tsc 통과 + 커밋. 앱은 매 커밋 시점에 동작 유지(중간에 깨지지 않게 순서 준수).

---

## File Structure

```
신규:
  src/app/(dashboard)/_components/cols-toggle.tsx            # 이동됨 (공유)
  src/app/(dashboard)/(linear)/voicecards/page.tsx
  src/app/(dashboard)/(linear)/voicecards/_components/voicecards-block.tsx        # 이동됨
  src/app/(dashboard)/(linear)/voicecards/_components/voicecards-settings-dialog.tsx  # 이동됨
  src/app/(dashboard)/(linear)/reviewnotes/page.tsx
  src/app/(dashboard)/(linear)/reviewnotes/_components/reviewnotes-block.tsx      # 이동됨
수정:
  src/app/(dashboard)/(linear)/monor/page.tsx               # → redirect
  src/app/(dashboard)/(linear)/layout.tsx                   # import 경로, PAGE_META, COLS_TOGGLE_PATHS
  src/app/(dashboard)/_components/linear-sidebar.tsx        # CLIENTS, CLIENT_HREF
  src/app/api/admin/permissions/route.ts                   # AVAILABLE_PAGES
  (cols-toggle import 쓰는 9개 페이지)                       # import 경로만
삭제:
  src/app/(dashboard)/(linear)/monor/_components/*          # 이동 후 제거
```

---

### Task 1: cols-toggle 공유 위치로 이동

**Files:**
- Create: `src/app/(dashboard)/_components/cols-toggle.tsx` (기존 `monor/_components/cols-toggle.tsx` 내용 그대로)
- Delete: `src/app/(dashboard)/(linear)/monor/_components/cols-toggle.tsx`
- Modify (import 경로 치환): `src/app/(dashboard)/(linear)/layout.tsx`, `.../mgmt/page.tsx`, `.../invest/page.tsx`, `.../invest/_components/real-estate-block.tsx`, `.../ryuha/page.tsx`, `.../valuechain/page.tsx`, `.../akros/page.tsx`, `.../email/page.tsx`, `.../etc/page.tsx`, `.../tensw/page.tsx`, `.../monor/_components/voicecards-block.tsx`, `.../monor/_components/reviewnotes-block.tsx`

**Interfaces:**
- Produces: `@/app/(dashboard)/_components/cols-toggle` — `useDashCols()`, `DashColsToggle`, `useMonorCols`, `MonorColsToggle`, `getMonorCols`, `useValuechainCols`, `ValuechainColsToggle`, `getValuechainCols` (모든 export 동일 유지).

- [ ] **Step 1: 파일 이동 (내용 무변경)**

```bash
git mv "src/app/(dashboard)/(linear)/monor/_components/cols-toggle.tsx" "src/app/(dashboard)/_components/cols-toggle.tsx"
```

- [ ] **Step 2: import 경로 일괄 치환**

`@/app/(dashboard)/(linear)/monor/_components/cols-toggle` → `@/app/(dashboard)/_components/cols-toggle` 를 전 파일에서 치환.

```bash
grep -rl "(linear)/monor/_components/cols-toggle" src | while read f; do
  perl -pi -e 's{\(dashboard\)/\(linear\)/monor/_components/cols-toggle}{(dashboard)/_components/cols-toggle}g' "$f"
done
grep -rn "monor/_components/cols-toggle" src   # 결과 0줄이어야 함
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 통과(에러 0). `monor/_components/cols-toggle` 참조 잔여 없음.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(dashboard): move shared cols-toggle out of monor/_components"
```

---

### Task 2: 블록의 dashCols를 `cols` prop으로 대체

**Files:**
- Modify: `src/app/(dashboard)/(linear)/monor/_components/voicecards-block.tsx` (5번째 줄 cols-toggle import 제거, `VoicecardsBlockProps`에 `cols` 추가, 508줄 `const dashCols = useDashCols()` 제거)
- Modify: `src/app/(dashboard)/(linear)/monor/_components/reviewnotes-block.tsx` (동일)
- Modify: `src/app/(dashboard)/(linear)/monor/page.tsx` (블록에 `cols={cols}` 전달)

**Interfaces:**
- Produces: `VoicecardsBlock`/`ReviewnotesBlock` props에 `cols: 1 | 2` 추가(필수). 내부에서 `const dashCols = cols`로 사용, `splitLayout = !mobile && cols === 1`.
- Consumes: `useDashCols` (Task 1의 새 경로) — 페이지에서만 호출.

- [ ] **Step 1: voicecards-block — import 제거 + prop 추가**

`import { useDashCols } from './cols-toggle'` (또는 Task1 후 새 경로) 줄 삭제.
`VoicecardsBlockProps` interface에 `cols: 1 | 2` 추가.
함수 구조분해 `({ ... }: VoicecardsBlockProps)`에 `cols` 추가.
508줄 `const dashCols = useDashCols()` → `const dashCols = cols` 로 교체. (513줄 `splitLayout = !mobile && dashCols === 1` 그대로 동작.)

- [ ] **Step 2: reviewnotes-block — 동일 적용**

import 제거, `ReviewnotesBlockProps`에 `cols: 1 | 2` 추가, 함수 시그니처에 `cols`, 282줄 `const dashCols = useDashCols()` → `const dashCols = cols`.

- [ ] **Step 3: monor/page.tsx — cols 전달**

이미 `const cols = useDashCols()` (136줄) 존재. 렌더의 `<VoicecardsBlock ...>`·`<ReviewnotesBlock ...>`에 `cols={cols}` 추가.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 통과. (블록이 cols-toggle 미의존, page가 cols 주입.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(monor): pass cols to app blocks via prop instead of useDashCols"
```

---

### Task 3: VoiceCards 블록 — 섹션별 LCard로 분리

**Files:**
- Modify: `src/app/(dashboard)/(linear)/monor/_components/voicecards-block.tsx` (return 구조: 단일 `<LCard pad={0}>`(650) → 섹션별 `<LCard>` 스택)

**Interfaces:**
- Produces: `VoicecardsBlock`가 여러 `LCard`를 세로 스택으로 반환(루트는 `<div>` 스택 컨테이너).

블록 return의 현재 구조(확인됨, 형제 섹션):
```
<LCard pad={0}>                         // 650
  <div padding paddingBottom:12>        // 651–1111: LSectionHead(VOICECARDS) + 인사이트
  {가입 후 활동 · 매출 동인}              // 1113–(사용자테이블 직전)  ← 스켈레톤 블록 + userStats 블록
  {사용자 테이블}                         // (가입후활동 직후)–1604
  {비로그인 저니}                         // 1605–1610
</LCard>                                 // 1611
```

- [ ] **Step 1: 스택 컨테이너로 교체**

루트 `<LCard pad={0}>`(650) + 닫는 `</LCard>`(1611)를 다음 스택으로 교체하고, 4개 섹션 그룹을 각각 `<LCard pad={0}>…</LCard>`로 감싼다:

```tsx
return (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    {/* 카드1: 헤더 + 인사이트 */}
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 12 }}>
        <LSectionHead eyebrow="VOICECARDS" title="보이스카드" action={/* 기존 settings/refresh */} />
        {/* 인사이트 스켈레톤 + 인사이트 IIFE — 기존 685–1110 내용 그대로 */}
      </div>
    </LCard>

    {/* 카드2: 가입 후 활동 · 매출 동인 — 기존 1113–(사용자테이블 직전) 내용 그대로 */}
    <LCard pad={0}>
      {/* 스켈레톤 블록 + userStats 블록 */}
    </LCard>

    {/* 카드3: 사용자 테이블 — 기존 내용 그대로 */}
    <LCard pad={0}>
      {/* 사용자 테이블 섹션 */}
    </LCard>

    {/* 카드4: 비로그인 저니 — 기존 1605–1610 내용 그대로 */}
    {anonymousStats?.journeys && anonymousStats.journeys.recentAnon.length > 0 && (
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad }}>
          <JourneyTable journeys={anonymousStats.journeys} />
        </div>
      </LCard>
    )}
  </div>
)
```

주의: 각 섹션의 내부 JSX·IIFE·스켈레톤·조건부 렌더는 **한 글자도 바꾸지 않고** 그대로 옮긴다. 여는/닫는 태그 짝만 재구성. 저니 카드는 조건이 false면 카드 자체를 렌더하지 않음(빈 카드 방지).

- [ ] **Step 2: 타입체크로 태그 짝 검증**

Run: `npx tsc --noEmit`
Expected: 통과. (JSX 태그 불일치 시 여기서 실패 → 경계 재확인.)

- [ ] **Step 3: 런타임 렌더 확인**

dev 서버(`npm run dev`)에서 `/monor` 접속, VoiceCards가 4개 개별 카드로 표시되고 데이터·레이아웃(wide: 퍼널-좌/DAU-우, KPI 6/row)·스켈레톤이 이전과 동일한지 눈으로 확인.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(voicecards): split block sections into separate cards"
```

---

### Task 4: ReviewNotes 블록 — 섹션별 LCard로 분리

**Files:**
- Modify: `src/app/(dashboard)/(linear)/monor/_components/reviewnotes-block.tsx` (return: 단일 `<LCard pad={0}>`(359) → 섹션별 `<LCard>` 스택, 닫힘 938)

**Interfaces:**
- Produces: `ReviewnotesBlock`가 3개 `LCard` 세로 스택 반환.

현재 구조(확인됨):
```
<LCard pad={0}>                         // 359
  {인사이트 (헤더 + 퍼널+파이+DAU+MRR)}   // 408–616
  {운영 지표 / 콘텐츠·학습 5카드}         // 617–745
  {사용자 테이블}                         // 746–937
</LCard>                                 // 938
```

- [ ] **Step 1: 스택 컨테이너로 교체**

```tsx
return (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <LCard pad={0}>{/* 인사이트: 기존 408–616 그대로 (헤더 LSectionHead 포함) */}</LCard>
    <LCard pad={0}>{/* 콘텐츠·학습: 기존 617–745 그대로 */}</LCard>
    <LCard pad={0}>{/* 사용자 테이블: 기존 746–937 그대로 */}</LCard>
  </div>
)
```

RN 블록도 최상단에 VOICECARDS처럼 `LSectionHead`(REVIEWNOTES) 헤더가 있으면 인사이트 카드 안에 유지. 내부 JSX 무변경, 태그 짝만 재구성.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 통과.

- [ ] **Step 3: 런타임 렌더 확인**

`/monor`에서 ReviewNotes가 3개 개별 카드로, 데이터·레이아웃 동일 확인.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(reviewnotes): split block sections into separate cards"
```

---

### Task 5: `/voicecards`·`/reviewnotes` 페이지 신설 (블록은 아직 monor/_components에서 import)

**Files:**
- Create: `src/app/(dashboard)/(linear)/voicecards/page.tsx`
- Create: `src/app/(dashboard)/(linear)/reviewnotes/page.tsx`
- Reference: `monor/page.tsx` (상태/로더/타입 원본)

**Interfaces:**
- Consumes: `VoicecardsBlock`(`cols:1|2`), `VoicecardsSettingsDialog`, `ReviewnotesBlock`(`cols:1|2`) — 현재 위치 `../monor/_components/...`에서 import (Task 8에서 이동 후 경로 갱신).

- [ ] **Step 1: voicecards/page.tsx 작성**

`monor/page.tsx`에서 VoiceCards 관련만 이관: 타입(`CombinedStats`/`UserStats`/`AnonymousEventStats`), 상태(`vc*`, `settingsOpen`), `loadVoicecards`, `useEffect(loadVoicecards)`, `useAgentRefresh(['voicecards_'], () => loadVoicecards(true))`, 5분 자동새로고침(VC만). 렌더는 `<VoicecardsBlock cols={1} ... />` + `<VoicecardsSettingsDialog .../>`. 블록·다이얼로그는 `@/app/(dashboard)/(linear)/monor/_components/...`에서 import. 페이지 루트는 블록이 이미 스택을 반환하므로 감싸는 그리드 불필요(단순 `<>{block}{dialog}</>`).

- [ ] **Step 2: reviewnotes/page.tsx 작성**

`monor/page.tsx`에서 RN 관련만 이관: 타입(`ReviewNotesStats` 등 import), 상태(`rn*`), `loadReviewnotes`, `useEffect`, `useAgentRefresh(['reviewnotes_'], () => loadReviewnotes(true))`, 5분 자동새로고침(RN만). 렌더 `<ReviewnotesBlock cols={1} ... />`.

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 통과.

- [ ] **Step 4: 런타임 확인**

dev에서 `/voicecards`·`/reviewnotes` 직접 접속(주소창) → 각 앱이 wide 섹션 카드로 정상 렌더·데이터 로드. (사이드바 링크는 Task 6.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(monor): add standalone /voicecards and /reviewnotes pages"
```

---

### Task 6: 네비/메타 갱신 + `/monor` 리다이렉트

**Files:**
- Modify: `src/app/(dashboard)/_components/linear-sidebar.tsx` (CLIENTS, CLIENT_HREF)
- Modify: `src/app/(dashboard)/(linear)/layout.tsx` (PAGE_META, COLS_TOGGLE_PATHS)
- Replace: `src/app/(dashboard)/(linear)/monor/page.tsx` (→ redirect)

- [ ] **Step 1: 사이드바 CLIENTS/HREF**

`linear-sidebar.tsx` CLIENTS에서 `{ id:'monor', ... }` 제거 → 추가:
```ts
{ id: 'voicecards',  name: 'VoiceCards',  tag: 'Language',  dot: '#2F8F5B' },
{ id: 'reviewnotes', name: 'ReviewNotes', tag: 'Education', dot: '#3F93C6' },
```
CLIENT_HREF: `monor: '/monor'` 제거 → `voicecards: '/voicecards', reviewnotes: '/reviewnotes'` 추가.

- [ ] **Step 2: layout PAGE_META + COLS_TOGGLE_PATHS**

`PAGE_META`에서 `'/monor'` 제거 → `'/voicecards': { group:'프로젝트', title:'VoiceCards' }`, `'/reviewnotes': { group:'프로젝트', title:'ReviewNotes' }`.
`COLS_TOGGLE_PATHS`에서 `'/monor'` 제거 (신규 두 경로는 미추가 — wide 고정, 토글 없음).

- [ ] **Step 3: monor/page.tsx → redirect (서버 컴포넌트)**

파일 전체를 교체:
```tsx
import { redirect } from 'next/navigation'
export default function MonorPage() {
  redirect('/voicecards')
}
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 통과.

- [ ] **Step 5: 런타임 확인**

사이드바 프로젝트에 VoiceCards·ReviewNotes 2항목 표시, 클릭 시 각 페이지 이동·활성 하이라이트 정상, 헤더 타이틀 표기 정상, `/monor` 접속 시 `/voicecards`로 리다이렉트.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(nav): replace MonoR Apps with VoiceCards/ReviewNotes entries, redirect /monor"
```

---

### Task 7: 권한 갱신 + 기존 monor 권한 마이그레이션

**Files:**
- Modify: `src/app/api/admin/permissions/route.ts` (AVAILABLE_PAGES)
- DB: 유저 권한 저장소(구현 시 확인 — `getServiceSupabase()`가 읽는 테이블/컬럼)

**Interfaces:**
- Consumes: 권한 판정 `user.permissions.includes(pagePath)` (auth-context.tsx:152), admin(role) 우회.

- [ ] **Step 1: AVAILABLE_PAGES 갱신**

`route.ts`의 `{ path:'/monor', section:'monoRApps', name:'MonoR Apps' }` 제거 → 추가:
```ts
{ path: '/voicecards',  section: 'monoRApps', name: 'VoiceCards' },
{ path: '/reviewnotes', section: 'monoRApps', name: 'ReviewNotes' },
```

- [ ] **Step 2: 권한 저장 구조 확인**

권한이 담긴 테이블/컬럼 확인:
```bash
grep -rn "permissions" src/lib/auth.ts src/app/api/admin/permissions/route.ts | head
```
Expected: 유저 permissions 배열이 저장된 supabase 테이블/컬럼 파악.

- [ ] **Step 3: 마이그레이션 (기존 /monor 권한 보유자 → 두 경로 부여)**

확인한 테이블에서 `permissions`에 `/monor`를 가진 non-admin 유저에게 `/voicecards`,`/reviewnotes` 추가하고 `/monor` 제거. (mcp__supabase__execute_sql, 메인 DB `axcfvieqsaphhvbkyzzv`. admin은 우회라 대상 아님.) 실제 SQL은 Step 2에서 확인한 스키마에 맞춰 작성하고, 먼저 SELECT로 영향 유저 수 확인 후 UPDATE.

- [ ] **Step 4: 타입체크 + 확인**

Run: `npx tsc --noEmit`
Expected: 통과. `/admin/users` 권한 UI에 VoiceCards·ReviewNotes 항목 노출 확인.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(permissions): split monor page permission into voicecards/reviewnotes"
```

---

### Task 8: 블록/다이얼로그 파일을 신규 페이지 _components로 이동, monor/_components 제거

**Files:**
- Move: `monor/_components/voicecards-block.tsx` → `voicecards/_components/voicecards-block.tsx`
- Move: `monor/_components/voicecards-settings-dialog.tsx` → `voicecards/_components/voicecards-settings-dialog.tsx`
- Move: `monor/_components/reviewnotes-block.tsx` → `reviewnotes/_components/reviewnotes-block.tsx`
- Modify: `voicecards/page.tsx`, `reviewnotes/page.tsx` (import 경로 `../monor/_components/*` → `./_components/*`)
- Delete: `monor/_components/` 잔여(있다면)

- [ ] **Step 1: 파일 이동**

```bash
mkdir -p "src/app/(dashboard)/(linear)/voicecards/_components" "src/app/(dashboard)/(linear)/reviewnotes/_components"
git mv "src/app/(dashboard)/(linear)/monor/_components/voicecards-block.tsx" "src/app/(dashboard)/(linear)/voicecards/_components/voicecards-block.tsx"
git mv "src/app/(dashboard)/(linear)/monor/_components/voicecards-settings-dialog.tsx" "src/app/(dashboard)/(linear)/voicecards/_components/voicecards-settings-dialog.tsx"
git mv "src/app/(dashboard)/(linear)/monor/_components/reviewnotes-block.tsx" "src/app/(dashboard)/(linear)/reviewnotes/_components/reviewnotes-block.tsx"
```

- [ ] **Step 2: 신규 페이지 import 경로 갱신**

`voicecards/page.tsx`: `../monor/_components/voicecards-block` → `./_components/voicecards-block`, 설정 다이얼로그 동일.
`reviewnotes/page.tsx`: `../monor/_components/reviewnotes-block` → `./_components/reviewnotes-block`.

- [ ] **Step 3: 이동한 블록의 내부 상대 import 점검**

블록이 쓰는 상대 import(`./cols-toggle`은 Task1·2에서 이미 제거됨; `@/...` 절대경로 공용 컴포넌트는 무영향) 확인:
```bash
grep -n "from './" "src/app/(dashboard)/(linear)/voicecards/_components/voicecards-block.tsx" "src/app/(dashboard)/(linear)/reviewnotes/_components/reviewnotes-block.tsx"
```
남은 상대 import가 있으면(예: `./distribution-pie`) 해당 공용 컴포넌트도 함께 이동하거나 절대경로로 조정. (distribution-pie 등은 `@/`로 참조되는지 확인.)

- [ ] **Step 4: monor/_components 잔여 제거 확인**

```bash
ls "src/app/(dashboard)/(linear)/monor/_components" 2>/dev/null   # 비어있거나 없어야 함(AppleDouble ._ 파일 제외)
grep -rn "monor/_components" src   # 결과 0줄
```

- [ ] **Step 5: 타입체크 + 런타임**

Run: `npx tsc --noEmit`
Expected: 통과. dev에서 `/voicecards`·`/reviewnotes` 정상 렌더(이동 후에도 동일).

- [ ] **Step 6: Commit + 푸시**

```bash
git branch --show-current   # main 확인
git add -A && git commit -m "refactor(monor): relocate app blocks into their page _components; retire monor/_components"
git push origin main
```

---

## Self-Review

- **Spec 커버리지**: 라우트분리(T5,6,8) / 섹션카드(T3,4) / wide-cols prop(T2) / cols-toggle 이동(T1) / 사이드바(T6) / layout 메타·토글(T6) / 권한+마이그레이션(T7) / monor 리다이렉트(T6) — 스펙 전 항목 태스크 매핑됨.
- **플레이스홀더**: T7 Step3의 마이그레이션 SQL은 스키마 확인(Step2) 후 작성 — 스키마가 코드에 없어 런타임 확인 필요한 정당한 미결. 나머지 스텝은 구체 명령/코드 포함.
- **순서 안전성**: 블록 이동(T8)은 리다이렉트(T6) 이후라 monor/page가 블록을 참조하지 않는 상태 → 매 커밋 빌드 유지.
- **타입 일관성**: `cols: 1 | 2` prop 이름/타입 T2에서 정의, T5에서 `cols={1}`로 소비 일치.
