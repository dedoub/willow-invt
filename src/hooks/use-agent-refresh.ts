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
export function useAgentRefresh(prefixes: string[], onRefresh: () => void) {
  useEffect(() => {
    const handler = (e: Event) => {
      const { tables } = (e as CustomEvent<AgentDataChangedDetail>).detail
      const isRelevant = tables.some(table =>
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
