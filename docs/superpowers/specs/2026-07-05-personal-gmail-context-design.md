# 개인 지메일 context 추가 설계

**날짜**: 2026-07-05
**상태**: 승인됨 (구현 계획 대기)

## 목표

윌로우 대시보드 Gmail 연동에 개인 지메일(dwkim.august@gmail.com)을 4번째 context(`personal`)로
추가해, 기존 업무 계정 3개(default/willow/tensoftworks)와 나란히 한 앱에서 병행 관리한다.

앱은 이미 `gmail_tokens` 테이블에 `(user_id, context)` 단위로 여러 계정 토큰을 저장하고,
모든 Gmail 라우트/컴포넌트가 `?context=` 파라미터로 동작하는 제네릭 구조라 대부분 재사용한다.

## 범위 (Scope)

- 개인 받은편지함 조회·검색·스레드 상세·답장/작성
- 개인 메일 AI 요약 분석
- **범위 외**: 개인용 규칙 기반 자동라벨(auto-label). 초기엔 생략, 실사용하며 나중에 축적 (YAGNI).
  업무 페이지의 인보이스/위키 등 비즈니스 기능도 개인엔 미적용.

## 아키텍처

### 1. 백엔드 / OAuth (`src/lib/gmail-server.ts`)

- `GmailContext` 타입에 `'personal'` 추가
  - 현재: `'default' | 'tensoftworks' | 'willow'`
  - 변경: `'default' | 'tensoftworks' | 'willow' | 'personal'`
- `getOAuth2Client(context)`에 personal 분기 추가
  - personal → `GOOGLE_CLIENT_ID_PERSONAL` / `GOOGLE_CLIENT_SECRET_PERSONAL`
  - redirect URI는 기존 공유값 그대로
- `getAuthUrl` / `saveTokens` / `getTokens` / `deleteTokens` / `getGmailClient`는
  이미 context 제네릭 → 변경 없음
- 콜백(`src/app/api/gmail/callback/route.ts`)은 state 파라미터로 context 처리 → 변경 없음

### 2. AI 분석 라우트 (`src/app/api/gmail/analyze/route.ts`)

현재 유일하게 context 미파라미터화된 지점:
- 47번 `getGmailClient()` → default 고정
- 176번 `analyzeEmails(...)` 대상이 default 인박스

수정: 요청에서 `context`(기본 `default`) 받아 `getGmailClient(context)`로 전달.
AI 호출은 기존 `@/lib/gemini-server`의 `analyzeEmails` 그대로 재사용 (신규 AI 도입 없음).

### 3. 변경 불필요 라우트 (이미 제네릭)

`auth` / `status` / `emails` / `send` / `auto-label` / `scheduled` / `attachments`
— 전부 `searchParams.get('context')` 처리 이미 존재. 코드 변경 없음.

### 4. UI 새 페이지 `/personal`

- 대시보드 `(linear)` 그룹에 `personal/page.tsx` 신규 생성 + 사이드바 네비 "개인 메일" 항목 추가
- **미연결 상태**: "개인 Gmail 연결" 버튼 → `/api/gmail/auth?context=personal`로 이동
  (사용자가 개인 계정 선택·승인 → 콜백이 gmail_tokens에 context=personal 저장)
- **연결 상태**:
  - 받은편지함 목록 (`/api/gmail/emails?context=personal&label=INBOX`)
  - 검색 (`/api/gmail/search?context=personal`)
  - 스레드 상세 + 답장/작성 → 기존 `email-detail-dialog` / `compose-email-dialog` 재사용, context=personal 전달
  - AI 요약 섹션 → `/api/gmail/analyze` (context=personal)

### 5. GCP OAuth 세팅 (사용자 콘솔 작업, 단계별 가이드 제공)

개인 gmail.com은 org 계정이 아니므로 동의화면이 **External**이어야 함
(기존 willowinvt/tensw 프로젝트는 Internal → 403 org_internal 발생).

1. 새 GCP 프로젝트 `willow-personal-gmail` 생성
2. OAuth 동의화면: User Type = **External**, 테스트 사용자에 `dwkim.august@gmail.com` 등록
   (테스트 모드 100명 미만이라 Google 검증 불필요)
3. Gmail API 활성화
4. OAuth 2.0 Web 클라이언트 생성
   - Authorized redirect URI: `https://willow-invt.vercel.app/api/gmail/callback` (기존 공유값)
   - Scopes: gmail.readonly, gmail.send, gmail.labels (기존과 동일)
5. 발급된 Client ID/Secret → Vercel env 추가 (`printf`로, echo 금지 — \n 방지):
   - `GOOGLE_CLIENT_ID_PERSONAL`
   - `GOOGLE_CLIENT_SECRET_PERSONAL`

## 데이터 흐름

```
[/personal 페이지]
   미연결 → "연결" 버튼 → /api/gmail/auth?context=personal
      → Google OAuth (External 동의) → /api/gmail/callback (state=personal)
      → saveTokens: gmail_tokens (user_id, context=personal)
   연결됨 → /api/gmail/status?context=personal (연결 확인)
      → /api/gmail/emails?context=personal (목록)
      → email-detail-dialog / compose-email-dialog (context=personal)
      → /api/gmail/analyze (context=personal) → gemini analyzeEmails
```

## 에러 처리

- 미연결 / 토큰 만료: status 라우트가 감지 → UI에서 "연결" 버튼 노출
- refresh token revoked: 기존 `getGmailClient`가 deleteTokens 후 재연결 유도 (기존 로직 재사용)
- 403 org_internal (GCP 설정 미비): 연결 실패 메시지 + 가이드. External 동의화면·테스트 사용자 등록 확인

## 디자인 시스템 준수

CLAUDE.md 규칙 엄수:
- border/shadow/ring/outline 금지 → 배경색 계층으로 구분 (page slate-50, card slate-100, 내부 white/slate-700)
- 배지·버튼 slate 색상, size="sm"
- 기존 mgmt/etc 페이지의 이메일 UI 패턴 재사용

## 검증

- 개인 계정 OAuth 연결 → gmail_tokens에 context=personal 행 생성 확인
- 받은편지함 실제 메일 로드 확인
- 답장/작성 발송 확인
- AI 요약 동작 확인
- 업무 3개 context 기존 동작 회귀 없음(personal 추가가 기존 분기 영향 없음) 확인

## 미해결 / 후속

- 개인용 규칙 자동라벨: 실사용 메일 관찰 후 규칙 축적 (별도 작업)
