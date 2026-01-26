# 디자인 원칙

## 제1 원칙

> **테두리(border)와 그림자(shadow)를 사용하지 않고, 색상(color)으로 컴포넌트를 구분한다**

---

## 금지 패턴

```
❌ border border-gray-200
❌ shadow-md / shadow-lg
❌ ring-1 ring-gray-200
❌ outline outline-gray-200
```

> `globals.css`의 base layer에서 모든 요소의 기본 border가 제거되어 있음

---

## 올바른 패턴

```
✅ 페이지 배경: bg-muted/30
✅ 카드 배경: bg-slate-100 dark:bg-slate-800
✅ 내부 영역: bg-white dark:bg-slate-700
✅ 상태별 색상: bg-{color}-50/100 dark:bg-{color}-900/30
```

---

## 배경색 계층

| 계층 | Light Mode | Dark Mode |
|------|------------|-----------|
| 페이지 배경 | `bg-slate-50` | `dark:bg-slate-900` |
| 카드 배경 | `bg-slate-100` | `dark:bg-slate-800` |
| 내부 영역 | `bg-white` | `dark:bg-slate-700` |
| 폼 필드 | `bg-slate-100` | `dark:bg-slate-700` |
| 폼 필드 포커스 | `bg-slate-50` | `dark:bg-slate-600` |

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
