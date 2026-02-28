# Willow Dashboard MCP Server

## Overview

Willow Dashboard는 자체 MCP (Model Context Protocol) 서버를 내장하고 있습니다.
Claude Desktop 등 MCP 클라이언트에서 OAuth 2.1 인증 후 대시보드의 데이터에 접근할 수 있습니다.

- **Server Name**: `willow-dashboard`
- **Transport**: Streamable HTTP (Vercel 서버리스 호환)
- **Endpoint**: `/api/mcp` (POST)
- **Auth**: OAuth 2.1 + PKCE

## Architecture

```
src/lib/mcp/
├── server.ts           # McpServer 생성 (per-request)
├── auth.ts             # OAuth 토큰 검증, 코드/토큰 발급
├── permissions.ts      # Role-Scope 권한 매트릭스
├── audit.ts            # 감사 로그
├── tools/
│   ├── index.ts        # 모든 도구 등록
│   ├── wiki.ts         # 업무위키
│   ├── projects.ts     # 프로젝트 (읽기 전용, 레거시)
│   ├── invoices.ts     # ETF/Etc 인보이스
│   ├── etf.ts          # Akros + Etc ETF 상품/통계
│   ├── email-analysis.ts # 이메일 AI 분석 & 후속조치
│   ├── dashboard.ts    # 대시보드 요약
│   ├── ryuha.ts        # 류하 학습관리
│   ├── willow-mgmt.ts  # 윌로우 경영관리
│   └── tensw-mgmt.ts   # 텐소프트웍스 경영관리
└── resources/
    └── index.ts        # MCP 리소스 (위키, 프로필, 프로젝트)

src/app/api/mcp/
├── route.ts            # MCP 메인 엔드포인트 (Streamable HTTP)
└── oauth/
    ├── authorize/route.ts   # OAuth 인증 시작
    ├── callback/route.ts    # 로그인 처리 + 코드 발급
    ├── token/route.ts       # 토큰 발급/갱신
    ├── register/route.ts    # 클라이언트 등록
    └── revoke/route.ts      # 토큰 폐기

src/app/mcp/
└── authorize/page.tsx  # OAuth 로그인 UI
```

## OAuth Flow

1. 클라이언트가 `/api/mcp/oauth/authorize`로 리다이렉트
2. 사용자가 `/mcp/authorize` 페이지에서 로그인
3. `/api/mcp/oauth/callback`에서 인증 코드 발급
4. 클라이언트가 `/api/mcp/oauth/token`에서 코드 → 토큰 교환
5. 이후 MCP 요청에 Bearer 토큰 사용

## Scopes

| Scope | 설명 |
|-------|------|
| `wiki:read` / `wiki:write` | 업무위키 |
| `projects:read` / `projects:write` | 프로젝트 |
| `schedules:read` / `schedules:write` | 일정 |
| `invoices:read` / `invoices:write` | 인보이스 |
| `etf:read` | ETF 데이터 (Akros + Etc + 분석/TODO) |
| `dashboard:read` | 대시보드 |
| `ryuha:read` / `ryuha:write` | 류하 학습관리 |
| `willow:read` / `willow:write` | 윌로우 경영관리 |
| `tensw:read` / `tensw:write` | 텐소프트웍스 경영관리 |
| `admin:read` / `admin:write` | 관리자 |

> 로그인 시 역할(role)에 따라 모든 해당 스코프가 자동 부여됩니다.

## Roles

| Role | 설명 |
|------|------|
| `admin` | 모든 권한 (읽기/쓰기/삭제) |
| `editor` | 읽기/쓰기 (삭제 제한) |
| `viewer` | 읽기 전용 |

---

## Tools (총 88개)

### 대시보드 (1개)
| Tool | Scope | 설명 |
|------|-------|------|
| `get_dashboard` | `dashboard:read` | 전체 요약 (프로젝트, 일정, 위키, 인보이스) |

### 업무위키 (5개)
| Tool | Scope | 설명 |
|------|-------|------|
| `list_wiki_notes` | `wiki:read` | 노트 목록 (section 필터) |
| `get_wiki_note` | `wiki:read` | 노트 상세 |
| `create_wiki_note` | `wiki:write` | 노트 생성 |
| `update_wiki_note` | `wiki:write` | 노트 수정 |
| `delete_wiki_note` | `wiki:write` | 노트 삭제 |

### 프로젝트 - 레거시 읽기전용 (6개)
| Tool | Scope | 설명 |
|------|-------|------|
| `list_clients` | `projects:read` | 클라이언트 목록 |
| `list_projects` | `projects:read` | 프로젝트 목록 |
| `get_project` | `projects:read` | 프로젝트 상세 (마일스톤 포함) |
| `list_milestones` | `projects:read` | 마일스톤 목록 |
| `list_schedules` | `schedules:read` | 스케줄 목록 |
| `list_tasks` | `projects:read` | 태스크 목록 |

### Akros ETF (8개)
| Tool | Scope | 설명 |
|------|-------|------|
| `akros_list_products` | `etf:read` | Akros 상품 목록 (AUM, ARR) |
| `akros_get_aum_data` | `etf:read` | 특정 상품 AUM 히스토리 |
| `akros_get_exchange_rates` | `etf:read` | 환율 정보 |
| `akros_get_time_series` | `etf:read` | 전체 AUM/ARR 시계열 |
| `akros_list_tax_invoices` | `etf:read` | 세금계산서 목록 |
| `akros_create_tax_invoice` | `etf:read` | 세금계산서 생성 (admin) |
| `akros_update_tax_invoice` | `etf:read` | 세금계산서 수정 (admin) |
| `akros_delete_tax_invoice` | `etf:read` | 세금계산서 삭제 (admin) |

### ETF/Etc (5개)
| Tool | Scope | 설명 |
|------|-------|------|
| `etc_list_products` | `etf:read` | ETF 상품 목록 (수수료 구조) |
| `etc_create_product` | `etf:read` | 상품 생성 |
| `etc_update_product` | `etf:read` | 상품 수정 |
| `etc_delete_product` | `etf:read` | 상품 삭제 (admin) |
| `etc_get_stats` | `etf:read` | 전체 통계 (AUM, 월수수료, 잔여수수료) |

### ETF/Etc 인보이스 (3개)
| Tool | Scope | 설명 |
|------|-------|------|
| `etc_list_invoices` | `invoices:read` | 인보이스 목록 |
| `etc_get_invoice` | `invoices:read` | 인보이스 상세 |
| `etc_create_invoice` | `invoices:write` | 인보이스 생성 (admin) |

### 이메일 AI 분석 - Akros (4개)
| Tool | Scope | 설명 |
|------|-------|------|
| `akros_get_analysis` | `etf:read` | AI 분석 결과 + TODO 목록 |
| `akros_list_todos` | `etf:read` | 후속조치 목록 (완료 필터) |
| `akros_toggle_todo` | `etf:read` | 후속조치 완료 토글 |
| `akros_delete_todo` | `etf:read` | 후속조치 삭제 (admin) |

### 이메일 AI 분석 - Etc (4개)
| Tool | Scope | 설명 |
|------|-------|------|
| `etc_get_analysis` | `etf:read` | AI 분석 결과 + TODO 목록 |
| `etc_list_todos` | `etf:read` | 후속조치 목록 (완료 필터) |
| `etc_toggle_todo` | `etf:read` | 후속조치 완료 토글 |
| `etc_delete_todo` | `etf:read` | 후속조치 삭제 (admin) |

### 류하 학습관리 (18개)
| Tool | Scope | 설명 |
|------|-------|------|
| `ryuha_list_subjects` | `ryuha:read` | 과목 목록 |
| `ryuha_create_subject` | `ryuha:write` | 과목 생성 |
| `ryuha_update_subject` | `ryuha:write` | 과목 수정 |
| `ryuha_delete_subject` | `ryuha:write` | 과목 삭제 |
| `ryuha_list_textbooks` | `ryuha:read` | 교재 목록 |
| `ryuha_create_textbook` | `ryuha:write` | 교재 생성 |
| `ryuha_update_textbook` | `ryuha:write` | 교재 수정 |
| `ryuha_delete_textbook` | `ryuha:write` | 교재 삭제 |
| `ryuha_list_chapters` | `ryuha:read` | 단원 목록 |
| `ryuha_create_chapter` | `ryuha:write` | 단원 생성 |
| `ryuha_update_chapter` | `ryuha:write` | 단원 수정 |
| `ryuha_delete_chapter` | `ryuha:write` | 단원 삭제 |
| `ryuha_list_schedules` | `ryuha:read` | 학습일정 목록 |
| `ryuha_create_schedule` | `ryuha:write` | 학습일정 생성 |
| `ryuha_update_schedule` | `ryuha:write` | 학습일정 수정 |
| `ryuha_delete_schedule` | `ryuha:write` | 학습일정 삭제 |
| `ryuha_list_homework` | `ryuha:read` | 숙제 목록 |
| `ryuha_create_homework` | `ryuha:write` | 숙제 생성 |
| `ryuha_update_homework` | `ryuha:write` | 숙제 수정 |
| `ryuha_delete_homework` | `ryuha:write` | 숙제 삭제 |
| `ryuha_list_memos` | `ryuha:read` | 메모 목록 |
| `ryuha_upsert_memo` | `ryuha:write` | 메모 추가/수정 |
| `ryuha_delete_memo` | `ryuha:write` | 메모 삭제 |
| `ryuha_list_body_records` | `ryuha:read` | 신체기록 목록 |
| `ryuha_create_body_record` | `ryuha:write` | 신체기록 생성 |
| `ryuha_update_body_record` | `ryuha:write` | 신체기록 수정 |
| `ryuha_delete_body_record` | `ryuha:write` | 신체기록 삭제 |

### 윌로우 경영관리 (18개)
| Tool | Scope | 설명 |
|------|-------|------|
| `willow_list_clients` | `willow:read` | 클라이언트 목록 |
| `willow_create_client` | `willow:write` | 클라이언트 생성 |
| `willow_update_client` | `willow:write` | 클라이언트 수정 |
| `willow_delete_client` | `willow:write` | 클라이언트 삭제 |
| `willow_list_projects` | `willow:read` | 프로젝트 목록 |
| `willow_create_project` | `willow:write` | 프로젝트 생성 |
| `willow_update_project` | `willow:write` | 프로젝트 수정 |
| `willow_delete_project` | `willow:write` | 프로젝트 삭제 |
| `willow_list_milestones` | `willow:read` | 마일스톤 목록 |
| `willow_create_milestone` | `willow:write` | 마일스톤 생성 |
| `willow_update_milestone` | `willow:write` | 마일스톤 수정 |
| `willow_delete_milestone` | `willow:write` | 마일스톤 삭제 |
| `willow_list_schedules` | `willow:read` | 일정 목록 |
| `willow_create_schedule` | `willow:write` | 일정 생성 |
| `willow_update_schedule` | `willow:write` | 일정 수정 |
| `willow_delete_schedule` | `willow:write` | 일정 삭제 |
| `willow_toggle_schedule_date` | `willow:write` | 일정 날짜 토글 |
| `willow_list_tasks` | `willow:read` | 태스크 목록 |
| `willow_create_task` | `willow:write` | 태스크 생성 |
| `willow_update_task` | `willow:write` | 태스크 수정 |
| `willow_delete_task` | `willow:write` | 태스크 삭제 |
| `willow_list_memos` | `willow:read` | 메모 목록 |
| `willow_upsert_memo` | `willow:write` | 메모 추가/수정 |
| `willow_delete_memo` | `willow:write` | 메모 삭제 |
| `willow_list_invoices` | `willow:read` | 인보이스 목록 |
| `willow_create_invoice` | `willow:write` | 인보이스 생성 (admin) |
| `willow_update_invoice` | `willow:write` | 인보이스 수정 (admin) |
| `willow_delete_invoice` | `willow:write` | 인보이스 삭제 (admin) |

### 텐소프트웍스 경영관리 (18개)
| Tool | Scope | 설명 |
|------|-------|------|
| `tensw_list_clients` | `tensw:read` | 클라이언트 목록 |
| `tensw_create_client` | `tensw:write` | 클라이언트 생성 |
| `tensw_update_client` | `tensw:write` | 클라이언트 수정 |
| `tensw_delete_client` | `tensw:write` | 클라이언트 삭제 |
| `tensw_list_projects` | `tensw:read` | 프로젝트 목록 |
| `tensw_get_project` | `tensw:read` | 프로젝트 상세 |
| `tensw_create_project` | `tensw:write` | 프로젝트 생성 |
| `tensw_update_project` | `tensw:write` | 프로젝트 수정 |
| `tensw_delete_project` | `tensw:write` | 프로젝트 삭제 |
| `tensw_list_milestones` | `tensw:read` | 마일스톤 목록 |
| `tensw_create_milestone` | `tensw:write` | 마일스톤 생성 |
| `tensw_update_milestone` | `tensw:write` | 마일스톤 수정 |
| `tensw_delete_milestone` | `tensw:write` | 마일스톤 삭제 |
| `tensw_list_schedules` | `tensw:read` | 일정 목록 |
| `tensw_create_schedule` | `tensw:write` | 일정 생성 |
| `tensw_update_schedule` | `tensw:write` | 일정 수정 |
| `tensw_delete_schedule` | `tensw:write` | 일정 삭제 |
| `tensw_toggle_schedule_date` | `tensw:write` | 일정 날짜 토글 |
| `tensw_list_tasks` | `tensw:read` | 태스크 목록 |
| `tensw_create_task` | `tensw:write` | 태스크 생성 |
| `tensw_update_task` | `tensw:write` | 태스크 수정 |
| `tensw_delete_task` | `tensw:write` | 태스크 삭제 |
| `tensw_list_memos` | `tensw:read` | 메모 목록 |
| `tensw_upsert_memo` | `tensw:write` | 메모 추가/수정 |
| `tensw_delete_memo` | `tensw:write` | 메모 삭제 |
| `tensw_list_invoices` | `tensw:read` | 인보이스 목록 |
| `tensw_create_invoice` | `tensw:write` | 인보이스 생성 (admin) |
| `tensw_update_invoice` | `tensw:write` | 인보이스 수정 (admin) |
| `tensw_delete_invoice` | `tensw:write` | 인보이스 삭제 (admin) |

---

## Resources (3개)

| Resource | URI | 설명 |
|----------|-----|------|
| `wiki-notes` | `willow://wiki/notes` | 위키 노트 목록 (최근 50개) |
| `user-profile` | `willow://users/me` | 현재 사용자 프로필 + 스코프 |
| `projects-by-section` | `willow://projects/{section}` | 섹션별 프로젝트 (tensw, willow) |

---

## Database 매핑

### Willow DB (experiment-apps)
| 테이블 | 용도 | 관련 도구 |
|--------|------|-----------|
| `work_wiki` | 업무위키 | `list_wiki_notes`, `create_wiki_note` 등 |
| `willow_invoices` | ETF/Etc 인보이스 | `etc_list_invoices` 등 |
| `etf_products` | ETF 상품 메타 | `etc_list_products` 등 |
| `akros_tax_invoices` | Akros 세금계산서 | `akros_list_tax_invoices` 등 |
| `email_analysis` | 이메일 AI 분석 | `akros_get_analysis`, `etc_get_analysis` |
| `email_todos` | 이메일 후속조치 | `akros_list_todos`, `etc_list_todos` 등 |
| `willow_users` | 사용자 | OAuth 인증 |
| `mcp_oauth_tokens` | OAuth 토큰 | 토큰 검증 |
| `mcp_oauth_codes` | OAuth 코드 | 인증 코드 |
| `mcp_oauth_clients` | OAuth 클라이언트 | 클라이언트 검증 |
| `mcp_audit_logs` | 감사 로그 | 모든 도구 호출 기록 |
| `willow_mgmt_*` | 윌로우 경영관리 | `willow_*` 도구 |
| `tensw_mgmt_*` | 텐소프트웍스 경영관리 | `tensw_*` 도구 |
| `ryuha_*` | 류하 학습관리 | `ryuha_*` 도구 |

### Akros DB (project-supernova)
| 테이블 | 용도 | 관련 도구 |
|--------|------|-----------|
| `product_meta` | 상품 메타 | `akros_list_products` |
| `product_figures` | AUM/Flow 데이터 | `akros_get_aum_data` |
| `exchange_rates` | 환율 | `akros_get_exchange_rates` |
| `time_series_data` | 시계열 데이터 | `akros_get_time_series` |

---

## 새 도구 추가 가이드

### 1. 도구 파일 작성/수정

`src/lib/mcp/tools/` 에 파일 생성 또는 기존 파일에 추가:

```typescript
server.registerTool('tool_name', {
  description: '[카테고리] 설명',
  inputSchema: z.object({ ... }),
}, async (input, { authInfo }) => {
  // 1. 인증 확인
  const user = getUserFromAuthInfo(authInfo)
  if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

  // 2. 권한 확인
  const perm = checkToolPermission('tool_name', user, authInfo?.scopes || [])
  if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

  // 3. 비즈니스 로직
  const supabase = getServiceSupabase()
  // ...

  // 4. 감사 로그
  await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tool_name', inputParams: input })
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
})
```

### 2. 권한 등록

`src/lib/mcp/permissions.ts`의 `TOOL_PERMISSIONS`에 추가:

```typescript
tool_name: { roles: ['admin', 'editor'], scopes: ['scope:read'] },
```

### 3. 도구 등록

새 파일인 경우 `src/lib/mcp/tools/index.ts`에서 import + register:

```typescript
import { registerMyTools } from './my-tools'
// ...
registerMyTools(server)
```

### 4. 네이밍 규칙

- **Akros 도구**: `akros_` 접두사 (예: `akros_list_products`)
- **ETF/Etc 도구**: `etc_` 접두사 (예: `etc_list_products`)
- **윌로우 도구**: `willow_` 접두사 (예: `willow_list_clients`)
- **텐소프트웍스 도구**: `tensw_` 접두사 (예: `tensw_list_projects`)
- **류하 도구**: `ryuha_` 접두사 (예: `ryuha_list_subjects`)
- **공통 도구**: 접두사 없음 (예: `get_dashboard`, `list_wiki_notes`)
