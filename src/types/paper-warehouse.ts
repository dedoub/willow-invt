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

/** 갱신 파이프라인 — 설계 문서의 다섯 단계를 확인된 사실로만 채운 것. */
export interface PaperPipelineCheck {
  table: string
  entity: string
  expected: number | null
  actual: number | null
  ok: boolean
}

export interface PaperPipeline {
  checked_at: string
  upstream: {
    snapshot: string | null
    works: { snapshot: string; records: number; files: number; bytes: number } | null
    authors: { snapshot: string; records: number; files: number; bytes: number } | null
  }
  our_snapshot: string | null
  /** 원본이 우리보다 새 스냅샷을 내놓았나 — 이번 분기 갱신을 시작할 신호. */
  behind: boolean
  staged: string[]
  tables_done: number
  tables_total: number
  checks: PaperPipelineCheck[]
}

export interface PaperWarehouseStatus {
  datasets: PaperDataset[]
  lastSync: PaperSyncMeta | null
  pipeline: PaperPipeline | null
}
