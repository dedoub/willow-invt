"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // 기본 스타일 (border, shadow 없음 - 배경색으로 구분)
        "peer size-4 shrink-0 rounded-[4px] transition-colors outline-none",
        // 미체크 상태: 회색 배경
        "bg-slate-200 dark:bg-slate-600",
        // 체크 상태: primary 배경
        "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        // 포커스 시 배경색 변경
        "focus-visible:bg-slate-300 dark:focus-visible:bg-slate-500",
        // 에러 상태
        "aria-invalid:bg-red-100 dark:aria-invalid:bg-red-900/30",
        // 비활성화
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
