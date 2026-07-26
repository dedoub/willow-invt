# MonoR 프로젝트 페이지 분리 (VoiceCards / ReviewNotes 독립 페이지 + 섹션 카드화)

작성일: 2026-07-26
상태: 설계 확정 대기

## 목표

현재 `/monor` 한 페이지에 VoiceCards·ReviewNotes 두 앱 블록이 나란히(또는 1/2열 토글로) 렌더된다.
이를 **두 독립 페이지**(`/voicecards`, `/reviewnotes`)로 나누고, 각 페이지에서 앱의 하부 섹션을
**주요 섹션 단위 카드**로 분리한다.

## 확정 결정 (브레인스토밍)

1. **라우팅/네비**: 사이드바 독립 항목 2개 — `/voicecards`, `/reviewnotes`. 'MonoR Apps'(`/monor`) 제거.
2. **섹션 카드 단위**: 주요 섹션 단위. 현재 이름붙은 섹션마다 별도 카드.
   - VoiceCards 4카드: `인사이트(퍼널+파이+DAU)` / `가입 후 활동·매출 동인` / `사용자 테이블` / `비로그인 저니`
   - ReviewNotes 3카드: `인사이트(퍼널+파이+DAU+MRR)` / `콘텐츠·학습 지표` / `사용자 테이블`
3. **구현 접근 A(제자리 섹션 카드화)**: 블록 컴포넌트는 유지하되, 하나의 큰 `LCard` → 섹션마다 별도 `LCard`.
   섹션 간 공유 계산(대형 IIFE)은 그대로 둔다. 컴포넌트 파일 완전 추출(B)은 후속(YAGNI).
4. **cols-toggle 제거 + wide 모드 고정**: 단일 앱 페이지는 항상 wide(1열=splitLayout) 레이아웃.

## 현재 구조 (grounding)

- `src/app/(dashboard)/(linear)/monor/page.tsx` (294줄): 두 앱 상태·로더를 모두 소유하고 `VoicecardsBlock`,
  `ReviewnotesBlock`을 그리드로 렌더. `VoicecardsSettingsDialog` 포함.
  - 데이터 로딩이 이미 VC/RN로 깔끔히 분리됨: `loadVoicecards()`(users/events/revenue 3 API 병렬),
    `loadReviewnotes()`(1 API). `useAgentRefresh(['voicecards_','reviewnotes_'], refreshAll)` + 5분 자동새로고침.
- `_components/voicecards-block.tsx` (1998줄): `<LCard pad={0}>` 하나 안에 인사이트/가입후활동/사용자테이블/
  비로그인저니 섹션이 형제로 스택. 내부에서 `const dashCols = useDashCols()`, `splitLayout = !mobile && dashCols===1`.
  dashCols는 (a) splitLayout, (b) KPI 카드 그리드 밀도(2열→3/row, 1열→6/row)에 관여.
- `_components/reviewnotes-block.tsx` (958줄): 동일 패턴. 섹션: 인사이트 / 콘텐츠·학습 / 사용자 테이블.
- `_components/cols-toggle.tsx`: **공유 인프라** — layout.tsx + mgmt/invest/ryuha/valuechain/akros/email/etc/tensw/
  real-estate-block 등 11곳이 `@/app/(dashboard)/(linear)/monor/_components/cols-toggle`로 import.
- 권한: `user.permissions.includes(pagePath)` (경로 문자열, admin 우회). `AVAILABLE_PAGES`에 `/monor`(section:`monoRApps`).

## 아키텍처: 신규 파일 배치

```
src/app/(dashboard)/(linear)/
  voicecards/
    page.tsx                         # VC 데이터 로딩 + 섹션 카드 렌더 + 설정 다이얼로그
    _components/
      voicecards-block.tsx           # monor에서 이동, 섹션별 LCard로 리팩터
      voicecards-settings-dialog.tsx # monor에서 이동
  reviewnotes/
    page.tsx                         # RN 데이터 로딩 + 섹션 카드 렌더
    _components/
      reviewnotes-block.tsx          # monor에서 이동, 섹션별 LCard로 리팩터
  monor/
    page.tsx                         # → redirect('/voicecards') (서버 컴포넌트)
  _components (dashboard 레벨)/
    cols-toggle.tsx                  # monor/_components에서 이동 (공유 인프라 정위치)
```

공유 컴포넌트 `distribution-pie.tsx` 등 블록이 쓰는 것들은 import 경로만 조정.

## 상세 변경

### 1. cols-toggle 재배치 (기계적)
- `monor/_components/cols-toggle.tsx` → `src/app/(dashboard)/_components/cols-toggle.tsx`로 이동.
- import 경로 일괄 치환 (11곳): `@/app/(dashboard)/(linear)/monor/_components/cols-toggle`
  → `@/app/(dashboard)/_components/cols-toggle`.
  대상: layout.tsx, mgmt/page, invest/page, invest/_components/real-estate-block, ryuha/page,
  valuechain/page, akros/page, email/page, etc/page, tensw/page. (동작 변화 없음, 순수 이동.)

### 2. 블록: wide 모드 prop 주입 + cols-toggle 의존 제거
- 블록 내부 `const dashCols = useDashCols()` → **prop `cols: 1 | 2`** 로 대체 (기본값 없이 페이지가 주입).
  블록에서 `useDashCols`/cols-toggle import 제거 → 블록이 shared toggle과 완전 분리.
- 신규 페이지는 `cols={1}` 전달 → splitLayout=true, KPI 6/row = wide 레이아웃 고정.
- (모바일은 기존대로 `mobile` 분기에서 처리 — cols와 무관하게 세로 스택.)

### 3. 블록: 하나의 큰 LCard → 섹션별 LCard (접근 A 핵심)
- 현재 `return <LCard pad={0}>{인사이트}{가입후활동}{사용자테이블}{저니}</LCard>` 형태.
- 변경: `return <div stack> <LCard>{인사이트}</LCard> <LCard>{가입후활동}</LCard> <LCard>{사용자테이블}</LCard> <LCard>{저니}</LCard> </div>`.
  - 섹션 내부 로직·IIFE·로딩 스켈레톤은 그대로. 감싸는 래퍼만 교체.
  - 카드 간 간격은 페이지 스택 `gap`(디자인시스템 값)으로. 각 `LCard`는 기존 헤더/패딩 규칙 준수.
  - 섹션 헤더(예: "인사이트", "가입 후 활동 · 매출 동인")는 각 카드 안 상단 유지.
- ReviewNotes 동일: 인사이트 / 콘텐츠·학습 / 사용자테이블 3 LCard.
- **주의**: 섹션이 형제 JSX인지(중첩 IIFE 아닌지) 이동 전 확인. 형제면 래핑만으로 안전.

### 4. 페이지 신설
- `voicecards/page.tsx`: monor/page.tsx에서 VC 상태(`vc*`)·`loadVoicecards`·설정 다이얼로그·
  `useAgentRefresh(['voicecards_'], ...)`·5분 자동새로고침(VC만) 이관. `<VoicecardsBlock cols={1} .../>` +
  `<VoicecardsSettingsDialog/>` 렌더.
- `reviewnotes/page.tsx`: RN 상태(`rn*`)·`loadReviewnotes`·`useAgentRefresh(['reviewnotes_'], ...)` 이관.
  `<ReviewnotesBlock cols={1} .../>`.
- 두 페이지의 `UserStats`/`CombinedStats`/`AnonymousEventStats` 타입 정의(monor/page.tsx 상단)는 각 페이지로
  분배(또는 블록 파일에서 export해 재사용). 중복 최소화 위해 블록 옆 `types.ts`로 뽑는 것 허용.

### 5. 사이드바 (linear-sidebar.tsx)
- `CLIENTS`에서 `{ id:'monor', ... }` 제거 → 추가:
  - `{ id:'voicecards', name:'VoiceCards', tag:'Language', dot:'#2F8F5B' }`
  - `{ id:'reviewnotes', name:'ReviewNotes', tag:'Education', dot:'#3F93C6' }`
  (name/tag/dot는 CEO 조정 가능.)
- `CLIENT_HREF`: `monor` 제거 → `voicecards:'/voicecards'`, `reviewnotes:'/reviewnotes'` 추가.
- `orderClients`는 사라진 id 무시 + 신규 id 후미 추가라 localStorage 순서 마이그레이션 불필요.

### 6. layout.tsx (헤더 메타 + 토글 경로)
- `DashColsToggle` import 경로를 재배치된 cols-toggle로.
- PAGE_META: `'/monor'` 제거 → `'/voicecards': { group:'프로젝트', title:'VoiceCards' }`,
  `'/reviewnotes': { group:'프로젝트', title:'ReviewNotes' }`.
- `COLS_TOGGLE_PATHS`: `/monor` 제거. `/voicecards`·`/reviewnotes`는 **추가하지 않음**(토글 없이 wide 고정).

### 7. 권한 (api/admin/permissions/route.ts + DB 마이그레이션)
- `AVAILABLE_PAGES`: `/monor` 항목 제거 → 두 항목 추가(둘 다 `section:'monoRApps'`):
  - `{ path:'/voicecards', section:'monoRApps', name:'VoiceCards' }`
  - `{ path:'/reviewnotes', section:'monoRApps', name:'ReviewNotes' }`
- **DB 마이그레이션**: 기존 `permissions`에 `/monor`를 가진 유저에게 `/voicecards`+`/reviewnotes` 부여
  (`/monor`는 제거). admin(role)은 우회하므로 영향 없음. 대상 테이블·컬럼은 구현 시 확인.
- i18n `monoRApps` 라벨 키는 유지(그룹 라벨). 필요 시 각 페이지 title은 name으로 표기.

### 8. /monor 리다이렉트
- `monor/page.tsx`를 서버 컴포넌트로 교체: `import { redirect } from 'next/navigation'; export default function(){ redirect('/voicecards') }`.
- monor/_components는 비워짐(블록·다이얼로그·cols-toggle 모두 이동). 폴더에 page.tsx만 남음.

## 검증 (verification)

- 타입체크: `npx tsc --noEmit` 통과.
- 런타임: `/voicecards`, `/reviewnotes` 각각 로드 → 섹션이 개별 카드로 표시, wide 레이아웃(인사이트 퍼널-좌/DAU-우,
  KPI 6/row), 데이터가 기존 monor와 동일하게 채워짐. `/monor` 접속 시 `/voicecards`로 리다이렉트.
- 사이드바에 두 항목 표시·활성 하이라이트·드래그 정렬 정상.
- 회귀: cols-toggle을 쓰는 다른 페이지(mgmt/invest/ryuha 등) 토글 정상 동작(경로만 이동).
- 권한 비-admin 유저: 마이그레이션 후 두 페이지 접근 가능.

## 범위 밖 (YAGNI)

- 섹션의 컴포넌트 파일 완전 추출(접근 B). 필요 시 후속.
- 섹션 카드 세부 단위(인사이트 안 퍼널/파이/DAU 개별 카드화). 이번은 주요 섹션 단위만.
- 두 앱 데이터 통합 대시보드/비교 뷰.
- cols-toggle의 UX 변경. 순수 파일 이동만.
