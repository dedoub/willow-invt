// Hook: listen for agent data mutations and trigger page-level refetch
// The chat panel dispatches 'agent-data-changed' with affected table names.
// Each page uses this hook with its relevant table prefixes.

import { useEffect } from 'react'

export interface AgentDataChangedDetail {
  tables: string[]  // e.g. ['willow_mgmt_cash', 'willow_mgmt_schedules']
}

export const AGENT_DATA_CHANGED = 'agent-data-changed'

/** Dispatch from chat panel after mutation tool calls */
export function notifyAgentDataChange(tables: string[]) {
  window.dispatchEvent(
    new CustomEvent<AgentDataChangedDetail>(AGENT_DATA_CHANGED, {
      detail: { tables },
    })
  )
}

/**
 * Listen for agent data mutations and call `onRefresh` when relevant tables change.
 * @param prefixes - table name prefixes this page cares about (e.g. ['willow_mgmt', 'work_wiki'])
 * @param onRefresh - callback to refetch data
 */
// 와일드카드 — 모든 useAgentRefresh 핸들러를 강제 실행 (예: 헤더의 수동 새로고침 버튼)
export const REFRESH_ALL = '__all__'

/** 전체 페이지 데이터 새로고침 트리거 */
export function refreshAllData() {
  notifyAgentDataChange([REFRESH_ALL])
}

export function useAgentRefresh(prefixes: string[], onRefresh: () => void) {
  useEffect(() => {
    const handler = (e: Event) => {
      const { tables } = (e as CustomEvent<AgentDataChangedDetail>).detail
      const isRelevant = tables.includes(REFRESH_ALL) || tables.some(table =>
        prefixes.some(prefix => table.startsWith(prefix))
      )
      if (isRelevant) {
        onRefresh()
      }
    }

    window.addEventListener(AGENT_DATA_CHANGED, handler)
    return () => window.removeEventListener(AGENT_DATA_CHANGED, handler)
  }, [prefixes, onRefresh])
}
