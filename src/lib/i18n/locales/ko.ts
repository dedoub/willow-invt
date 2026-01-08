export const ko = {
  // 공통
  common: {
    loading: '로딩 중...',
    error: '오류',
    success: '성공',
    cancel: '취소',
    confirm: '확인',
    save: '저장',
    delete: '삭제',
    edit: '수정',
    search: '검색',
    logout: '로그아웃',
    profile: '프로필',
    settings: '설정',
  },

  // 인증
  auth: {
    login: {
      title: '로그인',
      subtitle: '계정에 로그인하세요',
      email: '이메일',
      emailPlaceholder: 'name@example.com',
      password: '비밀번호',
      passwordPlaceholder: '비밀번호 입력',
      submit: '로그인',
      submitting: '로그인 중...',
      noAccount: '계정이 없으신가요?',
      signup: '가입하기',
      error: '로그인에 실패했습니다',
    },
    signup: {
      title: '계정 만들기',
      subtitle: 'Willow Dashboard에 가입하세요',
      name: '이름',
      namePlaceholder: '홍길동',
      email: '이메일',
      emailPlaceholder: 'name@example.com',
      password: '비밀번호',
      passwordPlaceholder: '8자 이상 입력',
      confirmPassword: '비밀번호 확인',
      confirmPasswordPlaceholder: '비밀번호 다시 입력',
      signupCode: '가입 코드',
      signupCodePlaceholder: '가입 코드 입력',
      signupCodeRequired: '가입 코드는 필수입니다',
      submit: '가입하기',
      submitting: '계정 생성 중...',
      hasAccount: '이미 계정이 있으신가요?',
      login: '로그인',
      passwordMismatch: '비밀번호가 일치하지 않습니다',
      passwordTooShort: '비밀번호는 8자 이상이어야 합니다',
      error: '가입에 실패했습니다',
    },
  },

  // 브랜딩
  brand: {
    name: 'Willow Dashboard',
    tagline: '프로젝트와 팀을 효율적으로 관리하세요',
  },

  // 사이드바
  sidebar: {
    dashboard: '대시보드',
    projects: '프로젝트',
    users: '사용자',
    settings: '설정',
    version: 'Willow Dashboard v1.0',
  },

  // 헤더
  header: {
    language: '언어',
    searchPlaceholder: '검색...',
  },

  // 대시보드
  dashboard: {
    title: '대시보드',
    welcome: '환영합니다',
    welcomeDesc: '프로젝트와 팀을 관리하세요',
    totalProjects: '총 프로젝트',
    activeProjects: '진행 중',
    completedProjects: '완료',
    totalUsers: '총 사용자',
    recentProjects: '최근 프로젝트',
    quickActions: '빠른 작업',
  },

  // 프로젝트
  projects: {
    title: '프로젝트',
    description: '프로젝트를 관리합니다',
    new: '새 프로젝트',
    noData: '프로젝트가 없습니다',
    status: {
      active: '진행 중',
      completed: '완료',
      onHold: '보류',
      cancelled: '취소됨',
    },
    columns: {
      name: '이름',
      status: '상태',
      owner: '담당자',
      created: '생성일',
      actions: '관리',
    },
  },

  // 사용자
  users: {
    title: '사용자',
    description: '사용자를 관리합니다',
    new: '새 사용자',
    noData: '사용자가 없습니다',
    roles: {
      admin: '관리자',
      editor: '편집자',
      viewer: '뷰어',
    },
    columns: {
      name: '이름',
      email: '이메일',
      role: '역할',
      lastLogin: '마지막 로그인',
      actions: '관리',
    },
  },

  // 설정
  settings: {
    title: '설정',
    description: '시스템 설정을 관리합니다',
    general: '일반',
    language: '언어',
    theme: '테마',
  },
} as const
