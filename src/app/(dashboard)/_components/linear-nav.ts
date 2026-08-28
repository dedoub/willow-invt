// 좌측 사이드바 메뉴 트리 — 단일 진실원.
// 사이드바 렌더와 상단바 breadcrumb이 모두 여기서 읽는다.
// (예전엔 레이아웃에 PAGE_INFO를 따로 두다가 그룹명이 사이드바와 갈라졌다)

export interface NavItem {
  id: string
  href: string
  label: string
  icon?: string   // 아이콘 메뉴(윌로우/관리자)
  dot?: string    // 서비스 색. 네이비 면 위에서 읽히는 라이트 톤.
  /**
   * 서비스 로고 파일. 있으면 이 색으로 실루엣을 찍고, 없으면 이름 첫 글자를
   * 같은 색으로 쓴다. 14px 자리라 정사각 단색 마크만 넣는다 — 리뷰노트 로고는
   * 가로로 긴 두 색 워드마크라 이 크기에서 뭉개져 글자를 쓴다.
   */
  mark?: string
  tag?: string
}

export interface NavGroup {
  key: string
  label: string
  items: NavItem[]
  orderKey?: string   // 있으면 드래그로 순서 변경 + localStorage 저장(기기별)
  adminOnly?: boolean
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'willow',
    label: '윌로우인베스트먼트',
    items: [
      { id: 'mgmt',       href: '/mgmt',       label: '사업관리',  icon: 'briefcase' },
      { id: 'email',      href: '/email',      label: '이메일',    icon: 'mail' },
      { id: 'wiki',       href: '/wiki',       label: '업무위키',  icon: 'book' },
      { id: 'invest',     href: '/invest',     label: '주식투자',  icon: 'trending' },
      { id: 'realestate', href: '/realestate', label: '부동산',    icon: 'building' },
      { id: 'ryuha',      href: '/ryuha',      label: '류하일정',  icon: 'calendar' },
      { id: 'english',    href: '/english',    label: '영작연습',  icon: 'pencil' },
    ],
  },
  {
    // 앱서비스(통합) — 앱 하나가 아니라 네 앱에 걸쳐 보는 화면들. 앱 안 1:1
    // 문의가 여기 모이고(자체 관리자 화면이 없는 보이스카드·포틀은 이곳이
    // 유일한 답변 창구다), 크레딧 요율도 같은 판매가를 쓰는 앱들을 나란히
    // 놓고 본다. 고객 문의 본문이 걸린 자리라 관리자에게만 보인다
    // (화면도 서버에서 따로 잠근다).
    key: 'inquiries',
    label: '앱서비스 - 통합관리',
    adminOnly: true,
    items: [
      { id: 'inquiries', href: '/inquiries', label: '고객문의함', icon: 'message' },
      // 세 앱 요율을 한 화면에서. 각 앱의 자체 화면은 그대로 두고, 여기는 같은
      // 판매가를 쓰는 셋을 나란히 놓고 보는 자리다.
      { id: 'rates', href: '/admin/rates', label: '크레딧 요율', icon: 'coin' },
    ],
  },
  {
    // 앱서비스(금융) — 직접 운영하는 자체 서비스 중 금융 도메인
    key: 'apps-finance',
    label: '앱서비스 - 금융',
    orderKey: 'sidebar-app-finance-order',
    items: [
      { id: 'portle',     href: '/portle',     label: 'Portle',     tag: 'Calculator', dot: '#E8927C' },
      { id: 'valuechain', href: '/valuechain', label: 'ValueChain', tag: 'Wiki',             dot: '#A392EC' },
    ],
  },
  {
    // 앱서비스(교육) — 직접 운영하는 자체 서비스 중 교육 도메인
    key: 'apps-edu',
    label: '앱서비스 - 교육',
    orderKey: 'sidebar-app-edu-order',
    items: [
      { id: 'voicecards',  href: '/voicecards',  label: 'VoiceCards',  tag: 'Flashcards', dot: '#4FBE84' },
      { id: 'reviewnotes', href: '/reviewnotes', label: 'ReviewNotes', tag: 'Notes',      dot: '#5FAFDF' },
      { id: 'scripta',     href: '/scripta',     label: 'Scripta',     tag: 'Writing',    dot: '#E894B0' },
    ],
  },
  {
    // 관계회사 — 투자·지분 관계로 관리하는 회사
    key: 'investees',
    label: '관계회사',
    orderKey: 'sidebar-investee-order',
    items: [
      { id: 'tensw', href: '/tensw', label: '텐소프트웍스', tag: 'AI Search', dot: '#D9A63F', mark: '/tensw-icon-white.png' },
    ],
  },
  {
    // 컨설팅 — 클라이언트/파트너 단위 업무
    key: 'clients',
    label: '컨설팅',
    orderKey: 'sidebar-project-order',
    items: [
      { id: 'akros', href: '/akros', label: '아크로스', tag: 'Indexing',     dot: '#5FAFDF', mark: '/akros-icon.png' },
      { id: 'etc',   href: '/etc',   label: 'ETC',      tag: 'ETF Platform', dot: '#8FB6D8' },
    ],
  },
  {
    key: 'admin',
    label: '관리자',
    adminOnly: true,
    items: [
      { id: 'users', href: '/admin/users', label: '사용자 관리', icon: 'user' },
    ],
  },
]

export const navGroup = (key: string): NavGroup =>
  NAV_GROUPS.find(g => g.key === key) ?? { key, label: '', items: [] }

// 현재 경로가 어느 항목인지 — 하위 경로(/wiki/123)는 부모 항목에 귀속.
// 겹치는 접두사가 있으면 더 긴 쪽(구체적인 쪽)을 택한다.
export function findNavItem(pathname: string): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem } | null = null
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname !== item.href && !pathname.startsWith(item.href + '/')) continue
      if (!best || item.href.length > best.item.href.length) best = { group, item }
    }
  }
  return best
}

// 상단바 breadcrumb — 사이드바에서 보이는 그룹명·메뉴명 그대로.
export function breadcrumbFor(pathname: string): { group: string; title: string } {
  const hit = findNavItem(pathname)
  if (!hit) return { group: NAV_GROUPS[0].label, title: '' }
  return { group: hit.group.label, title: hit.item.label }
}
