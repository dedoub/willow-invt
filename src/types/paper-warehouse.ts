// 논문 데이터 웨어하우스(biblo-paper-data-warehouse) 적재 현황.
//
// 진짜 상태는 AWS(Glue·S3·Athena)에 있다. 대시보드에는 AWS 자격증명이 없고
// (브라우저 로그인이 필요해 에이전트가 대신 못 돌린다) 웨어하우스 세션에는 화면이 없다.
// 그래서 그 세션이 scripts/paper-warehouse-report.mjs 로 적어 두고 이 화면이 읽는다.

export type PaperWarehouseStageStatus = 'done' | 'running' | 'todo' | 'blocked'
export type PaperWarehouseLoadStatus = 'done' | 'running' | 'todo' | 'failed'

export const PAPER_STAGE_STATUS_LABEL: Record<PaperWarehouseStageStatus, string> = {
  done: '완료',
  running: '진행 중',
  todo: '미착수',
  blocked: '막힘',
}

export const PAPER_LOAD_STATUS_LABEL: Record<PaperWarehouseLoadStatus, string> = {
  done: '완료',
  running: '적재 중',
  todo: '대기',
  failed: '실패',
}

export interface PaperWarehouseStage {
  key: string
  seq: number
  title: string
  status: PaperWarehouseStageStatus
  note: string | null
  updated_at: string
}

export interface PaperWarehouseLoad {
  id: number
  source: string
  table_name: string
  label: string | null
  snapshot: string | null
  status: PaperWarehouseLoadStatus
  row_count: number | null
  scanned_gb: number | null
  seconds: number | null
  cost_usd: number | null
  note: string | null
  sort_order: number
  updated_at: string
}

export interface PaperWarehouseStatus {
  stages: PaperWarehouseStage[]
  loads: PaperWarehouseLoad[]
}
