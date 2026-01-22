# Willow Dashboard

## Project Overview
Next.js 기반 대시보드 애플리케이션. ETF 관리, 업무 관리 등 다양한 기능 제공.

## Supabase Projects

### experiment-apps (주 프로젝트)
- **Project ID**: `axcfvieqsaphhvbkyzzv`
- **Region**: ap-southeast-1
- **URL**: https://axcfvieqsaphhvbkyzzv.supabase.co
- **용도**:
  - Wiki (업무위키) - `wiki_notes` 테이블
  - Tensoftworks 프로젝트 관리
  - CEO 문서 관리

#### Storage Buckets
| Bucket | Public | 용도 |
|--------|--------|------|
| `wiki-attachments` | Yes | 업무위키 첨부파일 |
| `etf-documents` | No | ETF 문서 |
| `tensw-project-docs` | Yes | 텐소프트웍스 프로젝트 문서 |
| `ceo-docs` | Yes | CEO 관련 문서 |

### project-supernova (Akros DB)
- **Project ID**: `iiicccnrnwdfawsvbacu`
- **Region**: ap-northeast-2
- **URL**: https://iiicccnrnwdfawsvbacu.supabase.co
- **용도**: Akros ETF 관련 데이터

## Environment Variables
```
# Main Supabase (experiment-apps)
NEXT_PUBLIC_SUPABASE_URL=https://axcfvieqsaphhvbkyzzv.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=... (service_role)

# Akros DB (Supernova)
AKROS_SUPABASE_URL=https://iiicccnrnwdfawsvbacu.supabase.co
AKROS_SUPABASE_SERVICE_KEY=...
```

## Key Pages & Features

### ETF/Akros Page (`/etf/akros`)
- 업무위키 (Work Wiki) - 파일 첨부 지원
- 인보이스 관리
- Gmail 연동
- API: `/api/wiki`, `/api/wiki/upload`, `/api/wiki/[id]`

### Tensoftworks Management (`/tensoftworks/management`)
- 프로젝트 관리
- 계약/결제 관리
- 일정 관리

## API Routes

### Wiki API
- `GET /api/wiki` - 위키 노트 목록 조회
- `POST /api/wiki` - 새 노트 생성
- `PUT /api/wiki/[id]` - 노트 수정
- `DELETE /api/wiki/[id]` - 노트 삭제
- `POST /api/wiki/upload` - 파일 업로드 (wiki-attachments 버킷)

### Gmail API
- `/api/gmail/auth` - OAuth 인증
- `/api/gmail/emails` - 이메일 목록
- `/api/gmail/send` - 이메일 발송

## Authentication
커스텀 JWT 인증 사용 (`auth_token` 쿠키)

## Notes
- 파일 업로드 시 service_role 키 사용 (RLS 우회)
- wiki-attachments 버킷은 public으로 설정됨
