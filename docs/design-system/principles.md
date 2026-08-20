# 디자인 원칙

## 제1 원칙

> **운영 대시보드는 현재 코드에서 검증된 `linear-tokens`와 `linear-*` 컴포넌트를 단일 기준으로 사용한다**

`/(dashboard)/(linear)` 아래 신규 UI는 먼저 `docs/design-system/current-elements.md`의 공식 컴포넌트에 매핑한다.
새 컴포넌트는 기존 요소로 표현할 수 없고 3곳 이상 반복될 때만 만든다.

---

## 제2 원칙

> **표면 구분은 색상 계층으로 하고, 선과 그림자는 최소화한다**

---

## 금지 패턴

```
❌ border border-gray-200
❌ shadow-md / shadow-lg
❌ ring-1 ring-gray-200
❌ outline outline-gray-200
❌ 신규 dashboard UI의 gradient/glass/shadow 카드
❌ shadcn Card/Button/Table을 linear 페이지에 새로 확산
```

> `globals.css`의 base layer에서 모든 요소의 기본 border가 제거되어 있음

---

## 올바른 패턴

```
✅ 페이지 배경: t.neutrals.page
✅ 카드 배경: t.neutrals.card
✅ 내부 영역: t.neutrals.inner
✅ 구조선: t.neutrals.line
✅ 상태별 색상: tonePalettes 또는 t.accent
```

구조선은 금지 대상이 아니다. 다만 상단바 하단, 표 푸터, 편집기 툴바처럼 실제 경계를 만들어야 하는 곳에만 `t.neutrals.line`으로 쓴다.

---

## 배경색 계층

| 계층 | Light Mode | Dark Mode |
|------|------------|-----------|
| 페이지 배경 | `bg-slate-50` | `dark:bg-slate-900` |
| 카드 배경 | `bg-slate-100` | `dark:bg-slate-800` |
| 내부 영역 | `bg-white` | `dark:bg-slate-700` |
| 폼 필드 | `bg-slate-100` | `dark:bg-slate-700` |
| 폼 필드 포커스 | `bg-slate-50` | `dark:bg-slate-600` |

linear 대시보드에서는 Tailwind class 대신 다음 토큰을 우선한다.

| 계층 | Token |
|------|-------|
| 페이지 | `t.neutrals.page` |
| 카드 | `t.neutrals.card` |
| 내부 영역/행 | `t.neutrals.inner` |
| 구조선 | `t.neutrals.line` |
| 본문 | `t.neutrals.text` |
| 보조 | `t.neutrals.muted` |
| 약한 라벨 | `t.neutrals.subtle` |

---

## 삭제 버튼 규칙

- **삭제 아이콘(Trash) 단독 사용 금지**
- **삭제는 수정 모달/인라인 내에서만 가능**
- **삭제 버튼 위치: 모달 좌측 하단**

---

## 모달/인라인 폼 버튼 규칙

- 모든 모달 버튼: `size="sm"` 필수
- 생성 모드: 삭제 버튼 없음
- 수정 모드: 삭제 버튼 좌측

linear 대시보드에서는 버튼을 `LBtn size="sm"`으로 맞춘다. 레거시 shadcn 모달에서는 기존 `Button size="sm"` 규칙을 유지한다.
