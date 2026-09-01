import { join } from 'node:path'

export type ProductCeoReportKey = 'reviewnotes' | 'scripta'

export type ProductCeoReportConfig = {
  key: ProductCeoReportKey
  label: 'ReviewNotes' | 'Scripta'
  projectId: string
  threadProject: 'review-notes' | 'scripta'
  promptPath: string
  logDir: string
  scheduleMinute: 10 | 20
}

const ROOT = '/Volumes/PRO-G40/app-dev/willow-invt'
const USER_LOG_ROOT = '/Users/dongwookkim/logs'

const CONFIGS: Record<ProductCeoReportKey, ProductCeoReportConfig> = {
  reviewnotes: {
    key: 'reviewnotes',
    label: 'ReviewNotes',
    projectId: 'kumaqaizejnjrvfqhahu',
    threadProject: 'review-notes',
    promptPath: join(ROOT, 'scripts', 'reviewnotes-ceo-report-prompt.md'),
    logDir: join(USER_LOG_ROOT, 'reviewnotes-ceo-report'),
    scheduleMinute: 10,
  },
  scripta: {
    key: 'scripta',
    label: 'Scripta',
    projectId: 'xmlbtykkgozxmjkyshfz',
    threadProject: 'scripta',
    promptPath: join(ROOT, 'scripts', 'scripta-ceo-report-prompt.md'),
    logDir: join(USER_LOG_ROOT, 'scripta-ceo-report'),
    scheduleMinute: 20,
  },
}

export function getProductCeoReportConfig(key: string): ProductCeoReportConfig {
  if (key !== 'reviewnotes' && key !== 'scripta') {
    throw new Error(`지원하지 않는 CEO 리포트 앱: ${key || '(없음)'}`)
  }
  return CONFIGS[key]
}
