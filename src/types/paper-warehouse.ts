// 논문 데이터 웨어하우스(biblo-paper-data-warehouse) 현황.
//
// 값은 사람이 적지 않는다. scripts/paper-warehouse-sync.mjs 가 AWS(Glue·S3·Athena)를
// 직접 보고 덮어쓴다 — 어떤 표가 있고(Glue), 얼마나 쌓였고(S3), 몇 행인가(Athena).

export type PaperDatasetStatus = 'done' | 'running' | 'todo' | 'failed'

export const PAPER_DATASET_STATUS_LABEL: Record<PaperDatasetStatus, string> = {
  done: '적재됨',
  running: '적재 중',
  todo: '없음',
  failed: '실패',
}

export interface PaperColumn {
  name: string
  type: string
}

export interface PaperDataset {
  id: number
  source: string
  snapshot: string | null
  table_name: string
  label: string | null
  location: string | null
  row_count: number | null
  bytes: number | null
  objects: number | null
  columns: PaperColumn[] | null
  status: PaperDatasetStatus
  note: string | null
  synced_at: string | null
  updated_at: string
}

/** 마지막 확인 — 언제 기준 숫자인지. 화면이 낡음을 스스로 말하게 한다. */
export interface PaperSyncMeta {
  at: string
  scanned_bytes: number
  ms: number
  tables: number
}

export interface PaperWarehouseStatus {
  datasets: PaperDataset[]
  lastSync: PaperSyncMeta | null
}
