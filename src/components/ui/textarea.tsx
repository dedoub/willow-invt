import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // 기본 스타일 (border, shadow 없음 - 배경색으로 구분)
        "!border-0 placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full rounded-md px-3 py-2 text-base transition-colors outline-none",
        "bg-slate-100 dark:bg-slate-700",
        // 포커스 시 배경색 변경 (흰색 대신 slate-50으로 구분 유지)
        "focus-visible:bg-slate-50 dark:focus-visible:bg-slate-600",
        // 에러 상태
        "aria-invalid:bg-red-50 dark:aria-invalid:bg-red-900/20",
        // 비활성화
        "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
