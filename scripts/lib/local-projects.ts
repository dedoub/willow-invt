import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { basename, dirname, join, resolve } from 'path'
import { execFileSync } from 'child_process'

interface TimedCache<T> {
  value: T
  updatedAt: number
}

export interface ConversationLikeMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LocalProjectDefinition {
  key: string
  displayName: string
  description: string
  path: string
  aliases: string[]
  handoffFiles?: string[]
  handoffNotes?: string[]
}

export interface LocalProjectSelection {
  project: LocalProjectDefinition
  matchedAlias: string
  matchSource: 'current_message' | 'recent_history' | 'direct_path' | 'folder_search_current' | 'folder_search_recent_history'
}

export interface ResolvedLocalProjectContext {
  registryText: string
  activeProject: LocalProjectSelection | null
  activeProjectText: string
  cwd: string
}

interface DirectoryCandidate {
  path: string
  root: string
  depth: number
}

const DEFAULT_PROJECT_KEY = 'willow-invt'
const SNAPSHOT_TTL_MS = 20 * 1000
const DIRECTORY_SEARCH_CACHE_TTL_MS = 2 * 60 * 1000
const DIRECTORY_SEARCH_MAX_DEPTH = 4
const DIRECTORY_SEARCH_MAX_MATCHES = 12
const DIRECTORY_SKIP_NAMES = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.turbo',
  '.vercel',
  '.yarn',
  '.pnpm-store',
  '.npm',
  '.cache',
  '.Trash',
  'Library',
  'Caches',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'tmp',
  'temp',
])
const COMMON_FOLDER_HINTS = new Set([
  'desktop',
  'documents',
  'downloads',
  'movies',
  'music',
  'pictures',
  'projects',
  'workspace',
  'workspaces',
  'app-dev',
])
const DIRECTORY_HINT_STOPWORDS = new Set([
  'claude',
  'codex',
  'willy',
  'rina',
  'telegram',
  'folder',
  'repo',
  'repository',
  'project',
  'workspace',
  'local',
  'drive',
])
const CONTINUATION_KEYWORDS = [
  '이어받',
  '이어서',
  '계속',
  '하던',
  '로컬',
  '레포',
  'repo',
  '프로젝트',
  'workspace',
  '워크스페이스',
  'claude',
  '클로드',
  'codex',
  '코덱스',
  '폴더',
  'folder',
  '디렉토리',
]

const LOCAL_PROJECTS: LocalProjectDefinition[] = [
  {
    key: 'willow-invt',
    displayName: 'WILLOW-INVT',
    description: '대표 업무 대시보드와 윌리/리나 텔레그램 봇을 운영하는 메인 Next.js 프로젝트',
    path: '/Volumes/PRO-G40/app-dev/willow-invt',
    aliases: ['willow-invt', 'willow invt', '윌로우', '윌로우인베스트먼트', '윌로우 대시보드'],
    handoffNotes: ['기본 작업 루트', '텔레그램 봇 및 대시보드 소스'],
  },
  {
    key: 'valuechain-wiki',
    displayName: 'valuechain-wiki',
    description: '밸류체인 위키와 LLM Wiki 확장용 로컬 연구 프로젝트',
    path: '/Volumes/PRO-G40/app-dev/valuechain-wiki',
    aliases: ['valuechain-wiki', 'valuechain wiki', 'valuechain.wiki', '밸류체인위키', '밸류체인 위키', 'llm wiki'],
    handoffFiles: [
      'docs/expansion-queue.md',
      'docs/node-maturity-process.md',
      'docs/node-search-flow.md',
      'eval/report.md',
    ],
    handoffNotes: ['Claude 로컬 스킬(.claude/skills/expand-node) 존재', '50노드 확장 큐와 노드 성숙도 프로세스 문서화'],
  },
]

// 프로젝트 키 → 정의 조회 (dispatch_command 등 외부에서 cwd 해석용)
export function getLocalProjectByKey(key: string): LocalProjectDefinition | null {
  const norm = (key || '').trim().toLowerCase()
  return LOCAL_PROJECTS.find(p =>
    p.key.toLowerCase() === norm ||
    p.displayName.toLowerCase() === norm ||
    p.aliases.some(a => a.toLowerCase() === norm)
  ) || null
}

const snapshotCache = new Map<string, TimedCache<string>>()
const directorySearchCache = new Map<string, TimedCache<string[]>>()

function normalizeText(value: string): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
}

function readTimedCache<T>(cache: TimedCache<T> | null, ttlMs: number): T | null {
  if (!cache) return null
  return Date.now() - cache.updatedAt < ttlMs ? cache.value : null
}

function writeTimedCache<T>(value: T): TimedCache<T> {
  return { value, updatedAt: Date.now() }
}

function truncate(value: string, max = 220): string {
  const flat = (value || '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}...` : flat
}

function uniqueExistingPaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const results: string[] = []

  for (const path of paths) {
    if (!path) continue
    const resolved = resolve(path)
    if (!existsSync(resolved) || seen.has(resolved)) continue
    seen.add(resolved)
    results.push(resolved)
  }

  return results
}

function getSearchRoots(): string[] {
  return uniqueExistingPaths([
    process.cwd(),
    dirname(process.cwd()),
    homedir(),
    '/Volumes',
  ])
}

function listKnownSkills(project: LocalProjectDefinition): string[] {
  const skillsDir = join(project.path, '.claude', 'skills')
  if (!existsSync(skillsDir)) return []

  try {
    return readdirSync(skillsDir)
      .filter(name => existsSync(join(skillsDir, name, 'SKILL.md')))
      .sort()
  } catch {
    return []
  }
}

function listTopLevelEntries(projectPath: string): string[] {
  if (!existsSync(projectPath)) return []

  try {
    return readdirSync(projectPath, { withFileTypes: true })
      .filter(entry => !DIRECTORY_SKIP_NAMES.has(entry.name))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .slice(0, 8)
      .map(entry => `${entry.isDirectory() ? '[D]' : '[F]'} ${entry.name}`)
  } catch {
    return []
  }
}

function summarizeTextFile(project: LocalProjectDefinition, relativePath: string): string {
  const filePath = join(project.path, relativePath)
  if (!existsSync(filePath)) return '파일 없음'

  try {
    const lines = readFileSync(filePath, 'utf-8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !/^(\|[- :|]+\|?|```)/.test(line))

    const picked: string[] = []
    for (const line of lines) {
      const cleaned = line.replace(/^#+\s*/, '').replace(/^\-\s*/, '').trim()
      if (!cleaned) continue
      if (!picked.includes(cleaned)) picked.push(cleaned)
      if (picked.length >= 3) break
    }

    return picked.length ? truncate(picked.join(' / '), 260) : '요약 가능한 내용 없음'
  } catch {
    return '미리보기 생성 실패'
  }
}

function runGit(projectPath: string, args: string[]): string {
  try {
    return execFileSync('git', ['-C', projectPath, ...args], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return ''
  }
}

function findProjectMatch(text: string): { project: LocalProjectDefinition; matchedAlias: string } | null {
  const normalized = normalizeText(text)
  if (!normalized) return null

  const candidates = LOCAL_PROJECTS.flatMap(project =>
    [project.key, project.displayName, ...project.aliases].map(alias => ({
      project,
      alias,
      normalizedAlias: normalizeText(alias),
    }))
  )
    .filter(candidate => candidate.normalizedAlias)
    .sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length)

  for (const candidate of candidates) {
    if (normalized.includes(candidate.normalizedAlias)) {
      return { project: candidate.project, matchedAlias: candidate.alias }
    }
  }

  return null
}

function looksNamedDirectoryHint(value: string): boolean {
  const trimmed = trimPathLikeToken(value)
  if (!trimmed) return false
  if (trimmed.startsWith('/') || trimmed.startsWith('~/') || trimmed === '~') return true
  if (/[\\/]/.test(trimmed)) return true

  const normalized = normalizeText(trimmed)
  if (!normalized || DIRECTORY_HINT_STOPWORDS.has(normalized)) return false
  if (COMMON_FOLDER_HINTS.has(normalized)) return true

  return /[-_.]/.test(trimmed) || /^[A-Z][A-Za-z0-9._-]{2,}$/.test(trimmed)
}

function trimPathLikeToken(value: string): string {
  return (value || '')
    .trim()
    .replace(/^["'`([{<]+/, '')
    .replace(/["'`)\]}>.,;:!?]+$/, '')
}

function resolveDirectoryPath(value: string): string | null {
  const trimmed = trimPathLikeToken(value)
  if (!trimmed) return null

  let candidate = trimmed.replace(/^file:\/\//, '')
  if (candidate === '~') {
    candidate = homedir()
  } else if (candidate.startsWith('~/')) {
    candidate = join(homedir(), candidate.slice(2))
  } else if (!candidate.startsWith('/')) {
    return null
  }

  const resolvedPath = resolve(candidate)
  if (!existsSync(resolvedPath)) return null

  try {
    const stat = statSync(resolvedPath)
    if (stat.isDirectory()) return resolvedPath
    if (stat.isFile()) return dirname(resolvedPath)
  } catch {
    return null
  }

  return null
}

function extractDirectoryHints(text: string): string[] {
  const hints = new Set<string>()
  const add = (value: string) => {
    const trimmed = trimPathLikeToken(value)
    if (!trimmed) return
    if (trimmed.length < 2) return
    hints.add(trimmed)
  }

  for (const match of text.matchAll(/(?:~\/|\/)[^\s"'`]+/g)) add(match[0])
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    if (looksNamedDirectoryHint(match[1])) add(match[1])
  }
  for (const match of text.matchAll(/"([^"]+)"/g)) {
    if (looksNamedDirectoryHint(match[1])) add(match[1])
  }
  for (const match of text.matchAll(/'([^']+)'/g)) {
    if (looksNamedDirectoryHint(match[1])) add(match[1])
  }
  for (const match of text.matchAll(/([^\s"'`]+)\s*(?:폴더|folder|디렉토리|directory|repo|repository|레포)\b/gi)) {
    add(match[1])
  }
  for (const match of text.matchAll(/\b([A-Za-z0-9][A-Za-z0-9._-]{2,})\b/g)) {
    if (looksNamedDirectoryHint(match[1])) add(match[1])
  }

  return Array.from(hints)
}

function isContinuationRequest(text: string): boolean {
  const normalized = normalizeText(text)
  return CONTINUATION_KEYWORDS.some(keyword => normalized.includes(normalizeText(keyword)))
}

function buildDynamicProjectDefinition(path: string, hint: string): LocalProjectDefinition {
  const name = basename(path) || path
  return {
    key: `path:${path}`,
    displayName: name,
    description: `사용자 지정 로컬 폴더 (${hint})`,
    path,
    aliases: [name, path, hint],
    handoffNotes: ['동적 폴더 선택', '필요 시 상위 구조와 git 상태부터 확인'],
  }
}

function findStaticProjectByPath(path: string): LocalProjectDefinition | null {
  const resolvedPath = resolve(path)
  return LOCAL_PROJECTS.find(project => resolve(project.path) === resolvedPath) || null
}

function collectDirectoryMatches(root: string, hint: string): DirectoryCandidate[] {
  if (!existsSync(root)) return []

  const normalizedHint = normalizeText(hint)
  if (!normalizedHint) return []

  const results: DirectoryCandidate[] = []
  const queue: Array<{ path: string; depth: number }> = [{ path: root, depth: 0 }]

  while (queue.length > 0 && results.length < DIRECTORY_SEARCH_MAX_MATCHES) {
    const current = queue.shift()!
    let entries: Array<{ name: string; isDirectory: () => boolean }>

    try {
      entries = readdirSync(current.path, { withFileTypes: true })
    } catch {
      continue
    }

    const childDirs = entries
      .filter(entry => entry.isDirectory())
      .filter(entry => !DIRECTORY_SKIP_NAMES.has(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of childDirs) {
      const childPath = join(current.path, entry.name)
      const normalizedName = normalizeText(entry.name)
      const normalizedPath = normalizeText(childPath)
      const isMatch = hint.includes('/')
        ? normalizedPath.endsWith(normalizedHint)
        : normalizedName === normalizedHint

      if (isMatch) {
        results.push({
          path: childPath,
          root,
          depth: current.depth + 1,
        })
        if (results.length >= DIRECTORY_SEARCH_MAX_MATCHES) break
      }

      if (current.depth + 1 < DIRECTORY_SEARCH_MAX_DEPTH) {
        queue.push({ path: childPath, depth: current.depth + 1 })
      }
    }
  }

  return results
}

function rankDirectoryCandidates(candidates: DirectoryCandidate[], hint: string): string[] {
  const normalizedHint = normalizeText(hint)
  const appRoot = resolve(dirname(process.cwd()))
  const userHome = resolve(homedir())

  return Array.from(new Map(candidates.map(candidate => [resolve(candidate.path), candidate])).values())
    .sort((a, b) => {
      const score = (candidate: DirectoryCandidate) => {
        const name = basename(candidate.path)
        let total = 0
        if (normalizeText(name) === normalizedHint) total += 100
        if (normalizeText(candidate.path).endsWith(normalizedHint)) total += 50
        if (candidate.path.startsWith(appRoot)) total += 20
        if (candidate.path.startsWith(userHome)) total += 10
        total -= candidate.depth
        return total
      }

      return score(b) - score(a)
    })
    .map(candidate => candidate.path)
}

function findDirectoryPathsByHint(hint: string): string[] {
  const cacheKey = normalizeText(hint)
  const cached = readTimedCache(directorySearchCache.get(cacheKey) || null, DIRECTORY_SEARCH_CACHE_TTL_MS)
  if (cached) return cached

  const results = rankDirectoryCandidates(
    getSearchRoots().flatMap(root => collectDirectoryMatches(root, hint)),
    hint
  )

  directorySearchCache.set(cacheKey, writeTimedCache(results))
  return results
}

function selectWorkspaceFromText(text: string, source: 'current_message' | 'recent_history'): LocalProjectSelection | null {
  const hints = extractDirectoryHints(text)

  for (const hint of hints) {
    const resolvedPath = resolveDirectoryPath(hint)
    if (!resolvedPath) continue

    const staticProject = findStaticProjectByPath(resolvedPath)
    if (staticProject) {
      return {
        project: staticProject,
        matchedAlias: hint,
        matchSource: 'direct_path',
      }
    }

    return {
      project: buildDynamicProjectDefinition(resolvedPath, hint),
      matchedAlias: hint,
      matchSource: 'direct_path',
    }
  }

  const directMatch = findProjectMatch(text)
  if (directMatch) {
    return {
      project: directMatch.project,
      matchedAlias: directMatch.matchedAlias,
      matchSource: source,
    }
  }

  for (const hint of hints) {
    if (hint.startsWith('/') || hint.startsWith('~/') || hint === '~') continue
    const [bestPath] = findDirectoryPathsByHint(hint)
    if (!bestPath) continue

    const staticProject = findStaticProjectByPath(bestPath)
    if (staticProject) {
      return {
        project: staticProject,
        matchedAlias: hint,
        matchSource: source === 'current_message' ? 'folder_search_current' : 'folder_search_recent_history',
      }
    }

    return {
      project: buildDynamicProjectDefinition(bestPath, hint),
      matchedAlias: hint,
      matchSource: source === 'current_message' ? 'folder_search_current' : 'folder_search_recent_history',
    }
  }

  return null
}

function selectProject(opts: {
  text: string
  history: ConversationLikeMessage[]
}): LocalProjectSelection | null {
  const currentMessageSelection = selectWorkspaceFromText(opts.text, 'current_message')
  if (currentMessageSelection) return currentMessageSelection

  if (!isContinuationRequest(opts.text)) return null

  const recentUserMessages = opts.history
    .filter(message => message.role === 'user')
    .slice(-8)
    .reverse()

  for (const message of recentUserMessages) {
    const historySelection = selectWorkspaceFromText(message.content, 'recent_history')
    if (historySelection) return historySelection
  }

  return null
}

function buildRegistryText(): string {
  const searchRoots = getSearchRoots()

  return [
    ...LOCAL_PROJECTS.map(project => {
      const aliasPreview = Array.from(new Set([project.key, ...project.aliases])).slice(0, 5).join(', ')
      const notePreview = (project.handoffNotes || []).join(' · ')
      return `- ${project.displayName} (${project.key})\n  path: ${project.path}\n  설명: ${project.description}\n  별칭: ${aliasPreview}${notePreview ? `\n  핸드오프 단서: ${notePreview}` : ''}`
    }),
    '',
    '동적 로컬 폴더 접근:',
    '- 메시지에 절대경로(`/Users/...`, `/Volumes/...`, `~/...`)가 있으면 그 경로를 그대로 작업 디렉토리로 사용하세요.',
    `- 이름만 말한 폴더는 다음 루트 아래에서 찾아봅니다: ${searchRoots.join(', ')}`,
    '- 폴더 이름이 겹칠 수 있으면 오동작을 피하려고 명시적 경로를 우선 사용하세요.',
    '- 활성 폴더가 정적 프로젝트가 아니어도, 상위 구조와 git 상태를 먼저 확인한 뒤 작업을 진행하세요.',
  ].join('\n')
}

function describeSelectionSource(selection: LocalProjectSelection): string {
  switch (selection.matchSource) {
    case 'current_message':
      return `현재 메시지에서 "${selection.matchedAlias}" 별칭 감지`
    case 'recent_history':
      return `최근 대화에서 "${selection.matchedAlias}" 별칭 감지`
    case 'direct_path':
      return `메시지에 포함된 경로 "${selection.matchedAlias}" 직접 사용`
    case 'folder_search_current':
      return `현재 메시지의 폴더 힌트 "${selection.matchedAlias}"로 로컬 검색`
    case 'folder_search_recent_history':
      return `최근 대화의 폴더 힌트 "${selection.matchedAlias}"로 로컬 검색`
    default:
      return selection.matchedAlias
  }
}

function buildProjectStateSummary(project: LocalProjectDefinition): string {
  const cached = readTimedCache(snapshotCache.get(project.key) || null, SNAPSHOT_TTL_MS)
  if (cached) return cached

  const lines: string[] = [
    `- Codex 작업 디렉토리: ${project.path}`,
    `- 설명: ${project.description}`,
  ]

  if (!existsSync(project.path)) {
    lines.push('- 상태: 로컬 경로가 없어 활성화할 수 없음')
    const text = lines.join('\n')
    snapshotCache.set(project.key, writeTimedCache(text))
    return text
  }

  const branch = runGit(project.path, ['branch', '--show-current'])
  const statusLines = runGit(project.path, ['status', '--short'])
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  const recentCommits = runGit(project.path, ['log', '--oneline', '-4'])
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (branch) {
    lines.push(`- git 브랜치: ${branch}`)
    lines.push(`- 워킹트리: ${statusLines.length ? `변경 ${statusLines.length}건` : 'clean'}`)
  } else {
    lines.push('- git: 저장소 아님 또는 브랜치 확인 실패')
  }

  if (statusLines.length) {
    lines.push('- 변경 파일 예시:')
    for (const line of statusLines.slice(0, 6)) lines.push(`  • ${line}`)
  }

  if (recentCommits.length) {
    lines.push('- 최근 커밋:')
    for (const commit of recentCommits) lines.push(`  • ${commit}`)
  }

  const claudeSettingsPath = join(project.path, '.claude', 'settings.local.json')
  lines.push(`- Claude 로컬 설정: ${existsSync(claudeSettingsPath) ? '있음 (.claude/settings.local.json)' : '없음'}`)

  const skills = listKnownSkills(project)
  if (skills.length) {
    lines.push(`- Claude 스킬: ${skills.join(', ')}`)
  }

  const handoffFiles = (project.handoffFiles || []).filter(relativePath => existsSync(join(project.path, relativePath)))
  if (handoffFiles.length) {
    lines.push('- 핸드오프 문서 요약:')
    for (const relativePath of handoffFiles.slice(0, 5)) {
      lines.push(`  • ${relativePath}: ${summarizeTextFile(project, relativePath)}`)
    }
  } else {
    const preview = listTopLevelEntries(project.path)
    if (preview.length) {
      lines.push('- 상위 항목 미리보기:')
      for (const item of preview) lines.push(`  • ${item}`)
    }
  }

  const text = lines.join('\n')
  snapshotCache.set(project.key, writeTimedCache(text))
  return text
}

function buildProjectSnapshot(selection: LocalProjectSelection): string {
  return [
    `- 프로젝트: ${selection.project.displayName} (${selection.project.key})`,
    `- 선택 근거: ${describeSelectionSource(selection)}`,
    buildProjectStateSummary(selection.project),
  ].join('\n')
}

export function resolveLocalProjectContext(opts: {
  text: string
  history: ConversationLikeMessage[]
}): ResolvedLocalProjectContext {
  const activeProject = selectProject(opts)
  const defaultProject = LOCAL_PROJECTS.find(project => project.key === DEFAULT_PROJECT_KEY) || LOCAL_PROJECTS[0]

  if (!activeProject) {
    return {
      registryText: buildRegistryText(),
      activeProject: null,
      activeProjectText: [
        `- 활성 프로젝트: ${defaultProject.displayName} (${defaultProject.key})`,
        `- Codex 작업 디렉토리: ${defaultProject.path}`,
        '- 별도 repo나 경로가 명시되지 않아 기본 작업 루트를 사용합니다.',
      ].join('\n'),
      cwd: defaultProject.path,
    }
  }

  return {
    registryText: buildRegistryText(),
    activeProject,
    activeProjectText: buildProjectSnapshot(activeProject),
    cwd: activeProject.project.path,
  }
}
