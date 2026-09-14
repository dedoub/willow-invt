// 영작 연습 대상(프로필) 목록.
//
// 여기 한 줄을 더하면 상단 토글·큐·채점 기준·보이스카드 덱이 함께 따라온다. 예전에는 같은
// 값이 lib/english.ts(타입·덱)·english-profile.tsx(토글)·english/page.tsx(문구) 세 곳에
// 흩어져 있어, 대상을 하나 늘리려면 세 곳을 같이 고쳐야 했다. 실제로 ryuha_written 문항
// 39개가 DB에 남아 있는데 화면에서는 사라진 채였다(CEO 2026-09-14).
//
// 문항은 전부 손으로 써서 `scripts/seed-english-essays.ts` 로 넣는다. 모델 생성은 쓰지 않는다 —
// 공용 프록시가 thinking 을 끈 flash 에 묶여 있어 원하는 수준이 나오지 않았다(CEO 2026-09-14).
//
// id 는 DB `english_practice_items.profile` 값이다. **한 번 정하면 바꾸지 않는다** —
// 쌓인 문항과 시도 기록이 전부 이 값으로 묶여 있어서, 바꾸면 과거 학습이 통째로 사라진다.

/** 구어(말하듯) / 문어(전문적인 글). 생성 프롬프트와 채점 기준이 갈리는 축이다. */
export type Register = 'spoken' | 'written'

/**
 * 문제 소재를 어디서 길어 오나. 생성 API 가 이 값으로 소스 풀을 고른다.
 * `general` 은 끌어올 표가 없다 — 경영학 주제 목록에서 돌려 가며 만든다.
 * 에세이 연습은 내 업무 기록이 아니라 논증 자체가 대상이기 때문이다(CEO 2026-09-14).
 */
export type SourcePool = 'wiki' | 'ryuha_notes' | 'general'

export interface PracticeTarget {
  id: string
  /** 상단 토글에 뜨는 짧은 이름 */
  label: string
  /** 누구의 연습인가 — 같은 사람의 대상끼리 토글에서 붙여 보여 준다 */
  learner: string
  title: string
  meta: string
  note: string
  /** 오늘 목표 문장 수 (지표의 /N 표기) */
  dailyGoal: number
  /** 소재를 설명하는 짧은 라벨 — 빈 상태·버튼 툴팁 문구에 쓴다 */
  sourceLabel: string
  register: Register
  source: SourcePool
  /**
   * 처음 열었을 때의 입력 방식. 류하는 손으로 쓰는 연습이 목적이고, 아빠는 실제로
   * 타자로 쓰는 글이 목적이다. 예전에는 `profile === 'ceo'` 로 갈랐는데, 대상이 넷이
   * 되면서 아빠 에세이가 손글씨로 열렸다(2026-09-14).
   */
  defaultInput: 'type' | 'draw'
  /**
   * 문어 대상의 문장 길이 하한(낱말). 이보다 짧은 것은 생성 단계에서 버린다.
   * 길이는 모델에게 부탁해서 얻어지지 않아서 코드가 바닥을 잡는다(2026-09-14).
   */
  minWords?: number
  /** 보이스카드 내보내기 대상 시트 */
  deck: { spreadsheetId: string; gid?: number; tabTitle?: string }
}

const CEO_DECK = { spreadsheetId: '1igjdCEgPeKDzcuYiDvHyct3bmE4KplsmJROwhvisrcs', gid: 1079541785 }
const RYUHA_DECK = { spreadsheetId: '1ThEDOoNDdS7HcUhAR36JACM6A1VpBgt7xG34Fy7xTzs', tabTitle: 'Voice Cards' }

export const PRACTICE_TARGETS: PracticeTarget[] = [
  {
    id: 'ceo',
    label: '구어',
    learner: '아빠',
    title: '영작 연습 · 구어',
    meta: '업무위키·이메일 소재 · 미국식 구어체',
    note: '한글 청킹(영어어순)을 보고 영어로 쓰면 AI가 즉시 채점 · 합격 80점',
    dailyGoal: 20,
    sourceLabel: '위키·이메일',
    register: 'spoken',
    source: 'wiki',
    defaultInput: 'type',
    deck: CEO_DECK,
  },
  {
    id: 'ceo_written',
    label: '에세이',
    learner: '아빠',
    title: '영작 연습 · 비즈니스 에세이',
    meta: '경영학 주제 · The Box · 밸류체인 · 제로 투 원 수준',
    note: '보고가 아니라 논증. 사실을 적는 문장이 아니라 주장하고 따지는 문장을 쓴다 · 합격 80점',
    dailyGoal: 10,
    sourceLabel: '경영학 주제',
    register: 'written',
    source: 'general',
    // The Box 수준을 목표로 한다 — 종속절 둘이 들어가면 스무 낱말 아래로 내려가지 않는다.
    minWords: 20,
    defaultInput: 'type',
    deck: CEO_DECK,
  },
  {
    id: 'ryuha',
    label: '구어',
    learner: '류하',
    title: '류하 영작 연습 · 구어',
    meta: '류하 노트·ISEB 문항 소재 · 영국식 구어체',
    note: '인터뷰에서 실제로 말할 문장을 한글 청킹(영어어순)으로 보고 영어로 쓰면 AI가 즉시 채점 · 합격 80점',
    dailyGoal: 20,
    sourceLabel: '류하 노트',
    register: 'spoken',
    source: 'ryuha_notes',
    defaultInput: 'draw',
    deck: RYUHA_DECK,
  },
  {
    id: 'ryuha_written',
    label: '문어',
    learner: '류하',
    title: '류하 영작 연습 · 문어',
    meta: '류하 노트 소재 · 영국식 학교 글쓰기',
    note: '학교에 낼 글에 쓸 문장. 말할 때보다 갖춰 쓴다 · 합격 80점',
    dailyGoal: 10,
    sourceLabel: '류하 노트',
    register: 'written',
    source: 'ryuha_notes',
    defaultInput: 'draw',
    deck: RYUHA_DECK,
  },
]

export const DEFAULT_TARGET_ID = 'ceo'

export function findTarget(id: unknown): PracticeTarget {
  const hit = typeof id === 'string' ? PRACTICE_TARGETS.find(x => x.id === id) : undefined
  return hit ?? PRACTICE_TARGETS[0]
}

/** 사람별로 묶은 목록 — 토글이 "아빠 구어·문어 / 류하 구어·문어"로 줄을 나눌 때 쓴다. */
export function targetsByLearner(): { learner: string; targets: PracticeTarget[] }[] {
  const out: { learner: string; targets: PracticeTarget[] }[] = []
  for (const target of PRACTICE_TARGETS) {
    const row = out.find(g => g.learner === target.learner)
    if (row) row.targets.push(target)
    else out.push({ learner: target.learner, targets: [target] })
  }
  return out
}
