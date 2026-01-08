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
      contactInfo: '문의',
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
    name: 'Willow Investments',
    tagline: 'Consistency beats intensity.',
  },

  // 사이드바
  sidebar: {
    dashboard: '대시보드',
    projects: '프로젝트',
    users: '사용자',
    settings: '설정',
    version: 'Willow Dashboard v1.0',
    // 메뉴 섹션
    etfIndexing: 'ETF/Indexing',
    etc: 'ETC',
    akros: '아크로스',
    monoRApps: '모노알 앱스',
    voiceCards: '보이스카드',
    reviewNotes: '리뷰노트',
    tenSoftworks: '텐소프트웍스',
    concepts: '컨셉 시연',
    openProjects: '진행 프로젝트',
    closedProjects: '완료 프로젝트',
    others: '기타',
    jangbigo: '장비고',
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

  // ETF
  etf: {
    title: 'ETF 리스트',
    description: '윌로우인베스트먼트가 상품출시 컨설팅 제공',
    totalAum: '총 AUM',
    totalMonthlyFee: '총 월수수료',
    totalRemainingFee: '총 잔여수수료',
    etfCount: '{count}개 ETF 기준',
    feeFormula: 'Base + (Platform + PM) × 25%',
    remainingFeeDesc: '상장 이후 36개월 간 수수료 발생',
    remainingMonths: '{months}개월',
    addEtf: 'ETF 추가',
    editEtf: 'ETF 수정',
    noData: 'ETF 데이터가 없습니다',
    columns: {
      symbol: '심볼',
      fundName: '펀드명',
      listingDate: '상장일',
      aum: 'AUM',
      monthFlow: '1M 순판매',
      minFee: '최소수수료',
      feeRatio: '수수료율',
      monthlyFee: '월수수료',
      remainingFee: '잔여수수료',
      date: '기준일',
      actions: '관리',
    },
    form: {
      symbol: 'Symbol',
      symbolPlaceholder: '예: KDEF',
      fundName: 'Fund Name',
      fundNamePlaceholder: '예: PLUS Korea Defense ETF',
      fundUrl: 'Fund URL',
      listingDate: 'Listing Date',
      platform: 'Platform',
      pm: 'PM',
      minFee: 'Min Fee ($)',
      feeRatio: 'Fee Ratio (%)',
      feeRatioPlaceholder: '예: 0.05',
      currency: 'Currency',
      notes: 'Notes',
    },
    actions: {
      edit: '수정',
      delete: '삭제',
      documents: '문서',
      download: '다운로드',
    },
    confirmDelete: '{symbol}을(를) 삭제하시겠습니까?',
  },

  // 문서
  documents: {
    title: '{symbol} 문서',
    upload: '파일 업로드',
    uploading: '업로드 중...',
    noDocuments: '등록된 문서가 없습니다',
    uploadFailed: '업로드 실패: {error}',
    uploadError: '파일 업로드 중 오류가 발생했습니다.',
    downloadFailed: '다운로드 URL 생성에 실패했습니다.',
    deleteFailed: '삭제에 실패했습니다.',
    confirmDelete: '{fileName}을(를) 삭제하시겠습니까?',
    close: '닫기',
  },

  // 시간
  time: {
    justNow: '방금 전',
    minutesAgo: '{minutes}분 전',
    hoursAgo: '{hours}시간 전',
    daysAgo: '{days}일 전',
  },
} as const
