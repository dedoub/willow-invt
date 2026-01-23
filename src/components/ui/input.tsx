import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // 기본 스타일 (border, shadow 없음 - 배경색으로 구분)
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
        "!border-0 h-9 w-full min-w-0 rounded-md bg-slate-100 dark:bg-slate-700 px-3 py-1 text-base transition-colors outline-none",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        // 포커스 시 배경색 변경 (흰색 대신 slate-50으로 구분 유지)
        "focus-visible:bg-slate-50 dark:focus-visible:bg-slate-600",
        // 에러 상태
        "aria-invalid:bg-red-50 dark:aria-invalid:bg-red-900/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
