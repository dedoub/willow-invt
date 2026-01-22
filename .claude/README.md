# .claude 디렉토리 사용 가이드

이 디렉토리는 Claude Code에서 일관된 UI를 생성하도록 도와주는 디자인 시스템 문서와 템플릿을 포함합니다.

## 구조

```
.claude/
├── README.md              # 이 파일
├── design-system.md       # 디자인 시스템 규칙
└── templates/
    ├── page-template.tsx  # 페이지 템플릿
    ├── card-template.tsx  # 카드 템플릿 모음
    ├── form-template.tsx  # 폼 템플릿 모음
    └── table-template.tsx # 테이블 템플릿
```

## 사용법

### Claude에게 작업 요청 시

```
.claude/templates/page-template.tsx 복사해서
[기능] 페이지 만들어줘.

.claude/design-system.md 규칙 엄수할 것
```

### 예시 프롬프트

**새 페이지 생성:**
```
.claude/templates/page-template.tsx 복사해서
인보이스 목록 페이지 만들어줘.

테이블 필드:
- 인보이스 번호
- 고객명
- 금액 (천단위 콤마)
- 상태 (배지로 표시)
- 발행일

.claude/design-system.md 규칙 엄수할 것
```

**카드 추가:**
```
.claude/templates/card-template.tsx의 ColorStatsGrid 패턴으로
대시보드에 통계 카드 4개 추가해줘.

- 신규 주문
- 처리 중
- 배송 완료
- 취소

.claude/design-system.md 규칙 엄수할 것
```

**폼 추가:**
```
.claude/templates/form-template.tsx의 ModalForm 패턴으로
고객 추가 모달 만들어줘.

필드:
- 고객명 (필수)
- 이메일 (필수)
- 전화번호
- 메모

.claude/design-system.md 규칙 엄수할 것
```

## 핵심 규칙

### 제1 원칙
> **테두리(border)와 그림자(shadow)를 사용하지 않고, 색상(color)으로 컴포넌트를 구분한다**

### 금지 패턴
- `border border-gray-200`
- `shadow-md` / `shadow-lg`
- `ring-1 ring-gray-200`
- `outline outline-gray-200`

### 올바른 패턴
- 카드 배경: `bg-slate-100 dark:bg-slate-800`
- 내부 영역: `bg-white dark:bg-slate-700`
- 상태별 색상: `bg-{color}-50/100 dark:bg-{color}-900/30`

## 전체 UI 가이드

더 자세한 예시는 앱에서 확인:
- URL: `/admin/ui-guide`
- 파일: `src/app/admin/ui-guide/page.tsx`
