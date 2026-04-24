# 업무위키 Linear 페이지 설계

## 목표

4개 섹션(Akros, ETC, 윌로우, 텐소프트웍스)의 업무위키 노트를 하나의 Linear 스타일 페이지에서 통합 관리한다. 기존 API와 DB를 그대로 활용하며, 새 UI만 구현한다.

## 아키텍처

- **경로**: `/willow-investment/wiki` (Linear 레이아웃 내)
- **데이터 소스**: 기존 `/api/wiki` API + `work_wiki` Supabase 테이블
- **스타일**: Linear 토큰(`t`) 기반 인라인 스타일 (Tailwind 미사용)
- **패턴**: 투자관리/사업관리 페이지와 동일한 컴포넌트 구조

## 데이터 모델

기존 `work_wiki` 테이블을 그대로 사용:

```
work_wiki {
  id: UUID (PK)
  user_id: VARCHAR(255)
  section: VARCHAR(50)  -- 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'
  title: VARCHAR(255)
  content: TEXT
  category: VARCHAR(50)  -- 현재 미사용, 향후 확장용
  is_pinned: BOOLEAN
  attachments: JSONB     -- [{name, url, size, type}]
  created_at: TIMESTAMPTZ
  updated_at: TIMESTAMPTZ
}
```

## API

모두 기존 API 그대로 사용:

| 메서드 | 엔드포인트 | 용도 |
|--------|-----------|------|
| GET | `/api/wiki?section=` | 노트 목록 (section 빈값이면 전체) |
| POST | `/api/wiki` | 노트 생성 |
| PATCH | `/api/wiki/[id]` | 노트 수정 |
| DELETE | `/api/wiki/[id]` | 노트 삭제 |
| POST | `/api/wiki/upload` | 파일 업로드 |

**전체 조회 변경**: 현재 GET API는 section 파라미터가 필수(기본값 'etf-etc'). 전체 섹션 조회를 위해 section 파라미터 없으면 전체 반환하도록 API 수정 필요.

## 페이지 구조

### 헤더 영역
- 페이지 타이틀: "업무위키"
- 부제: "전사 업무 지식 베이스"
- LinearHeader의 breadcrumb: "윌로우인베스트먼트 > 업무위키"

### 필터 바
- 좌측: 세그먼트 컨트롤 (전체 | Akros | ETC | 윌로우 | 텐소프트)
  - 투자관리 holdings-block의 시장 필터와 동일한 스타일
  - `padding: '4px 10px', fontSize: 11, borderRadius: 4`
- 우측: 검색 입력 + "새 노트" 버튼
  - 검색: 돋보기 아이콘 + 텍스트 인풋 (클라이언트 사이드 제목+내용 필터)
  - 새 노트: LBtn primary, 아이콘 `plus`

### 노트 리스트
- 배경: `t.neutrals.card` (흰색)
- 각 행 높이: `t.density.rowH` (34px) 기본, 내용에 따라 유동
- 행 구성: `핀 아이콘 | 제목 | 섹션 배지 | 업데이트 날짜`
- 핀된 노트 먼저, 그 다음 updated_at 내림차순
- 행 hover: `t.neutrals.inner` 배경
- 행 사이 구분: 없음 (배경색 차이로만)

### 섹션 배지 색상

| 섹션 | 배경 | 텍스트 |
|------|------|--------|
| akros | `tonePalettes.brand` | brand fg |
| etf-etc | `tonePalettes.info` | info fg |
| willow-mgmt | `tonePalettes.done` | done fg |
| tensw-mgmt | `tonePalettes.warn` | warn fg |

### 인라인 확장 (노트 클릭 시)

클릭한 행이 아래로 펼쳐지며 노트 전체 내용 표시:

- 배경: `t.neutrals.inner`
- 내용 영역: `fontSize: 13, lineHeight: 1.7, color: t.neutrals.text`
- 첨부파일: 파일명 배지 목록 (클릭 시 새 탭에서 열기)
- 액션 바: 편집 버튼 | 핀 토글 | (하단 우측)
- 닫기: 행을 다시 클릭하거나 다른 행 클릭

### 인라인 폼 (새 노트 / 편집)

**새 노트**: "새 노트" 버튼 클릭 → 리스트 상단에 폼 펼침

- 배경: `t.neutrals.card`
- 필드:
  - 섹션 선택: 세그먼트 컨트롤 (Akros | ETC | 윌로우 | 텐소프트) — 필수
  - 제목: 텍스트 입력
  - 내용: 텍스트에어리어 (3~6줄)
  - 파일 첨부: 파일 선택 + 드래그앤드롭 영역
- 버튼: 취소 (secondary) | 저장 (primary) — 우측 정렬
- 유효성: 제목 또는 내용 중 하나 이상 입력 필요

**편집**: 확장된 노트 내에서 "편집" 클릭 → 읽기 뷰가 편집 폼으로 전환

- 동일한 폼 필드
- 기존 첨부파일 표시 + 새 파일 추가 가능
- 버튼: 삭제 (danger, 좌측) | 취소 (secondary) | 저장 (primary)

### 페이지네이션
- 페이지당 10개 노트
- 하단 우측: "1-10 / 24" 표시 + 이전/다음 화살표
- 스타일: 투자관리 trade-log와 동일

## 파일 구조

```
src/app/willow-investment/(linear)/wiki/
  page.tsx                          -- 메인 페이지 (데이터 로딩, 상태 관리)
  _components/
    wiki-list.tsx                   -- 필터 바 + 노트 리스트 + 페이지네이션
    wiki-note-row.tsx               -- 노트 행 (축소/확장/읽기/편집 모드)
    wiki-note-form.tsx              -- 새 노트 인라인 폼 (파일 업로드 포함)
```

## 사이드바 연결

기존 `linear-sidebar.tsx`에 wiki 링크가 이미 등록되어 있음. `layout.tsx`의 `PAGE_TITLES`에 `'/willow-investment/wiki': '업무위키'` 추가 필요.

## 스코프 외

- 카테고리 태그 필터 (향후 필요 시 추가)
- 마크다운 렌더링 (plain text로 표시)
- 실시간 동기화 (새로고침으로 해결)
- 노트 간 링크/참조
