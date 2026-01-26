# 테이블 (Table)

## 기본 테이블 구조

> **border 없이 배경색 교차로 행 구분**

```tsx
<div className="overflow-x-auto">
  <table className="w-full min-w-max">
    <thead>
      <tr className="bg-slate-200 dark:bg-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
        <th className="py-2 px-3 font-medium first:rounded-l-lg">Column 1</th>
        <th className="py-2 px-3 font-medium">Column 2</th>
        <th className="py-2 px-3 font-medium last:rounded-r-lg">Column 3</th>
      </tr>
    </thead>
    <tbody>
      {data.map((item, index) => (
        <tr
          key={item.id}
          className={`whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
            index % 2 === 1 ? 'bg-slate-50 dark:bg-slate-700/30' : ''
          }`}
        >
          <td className="py-3 px-3">{item.col1}</td>
          <td className="py-3 px-3">{item.col2}</td>
          <td className="py-3 px-3">{item.col3}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

---

## 스타일 클래스

### 헤더

| 요소 | 클래스 |
|------|--------|
| thead tr | `bg-slate-200 dark:bg-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap` |
| th | `py-2 px-3 font-medium` |
| 첫번째 th | `first:rounded-l-lg` |
| 마지막 th | `last:rounded-r-lg` |

### 행

| 요소 | 클래스 |
|------|--------|
| 홀수 행 | `whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-700/50` |
| 짝수 행 | `bg-slate-50 dark:bg-slate-700/30` |
| td | `py-3 px-3` |

---

## 액션 버튼 열

> **수정 아이콘만 표시 - 삭제는 수정 모달 내에서만**

```tsx
<td className="py-3 px-3 text-right">
  <button
    onClick={() => handleEdit(item.id)}
    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600"
  >
    <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-400" />
  </button>
</td>
```

---

## 상태 배지 포함 테이블

```tsx
<td className="py-3 px-3">
  {/* 상태 배지: rounded-full */}
  <span className={`text-sm px-2.5 py-1 rounded-full ${getStatusColor(item.status)}`}>
    {item.status}
  </span>
</td>

<td className="py-3 px-3">
  {/* 우선순위 배지: rounded */}
  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(item.priority)}`}>
    {item.priority}
  </span>
</td>
```

---

## 특수 셀 스타일

```tsx
// 모노스페이스 (코드, 심볼)
<td className="py-3 px-3 font-mono font-medium">{item.symbol}</td>

// 최소 너비
<td className="py-3 px-3 text-sm min-w-[220px]">{item.description}</td>

// 우측 정렬
<td className="py-3 px-3 text-right">{item.amount}</td>

// 숫자 포맷
<td className="py-3 px-3 font-medium">${item.value.toLocaleString()}</td>
```

---

## 카드 내 테이블

```tsx
<Card className="bg-slate-100 dark:bg-slate-800">
  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
    <div>
      <CardTitle className="text-lg">목록</CardTitle>
    </div>
  </CardHeader>
  <CardContent className="pt-0">
    <div className="overflow-x-auto">
      <table className="w-full min-w-max">
        {/* ... */}
      </table>
    </div>
  </CardContent>
</Card>
```

---

## 반응형 처리

```tsx
// 스크롤 가능한 테이블
<div className="overflow-x-auto">
  <table className="w-full min-w-max">
    {/* ... */}
  </table>
</div>
```
