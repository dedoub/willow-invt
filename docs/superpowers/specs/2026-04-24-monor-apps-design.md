# MonoR Apps 통합 페이지 설계

## 개요

VoiceCards(iOS/Android IAP 통계)와 ReviewNotes(LemonSqueezy SaaS 매출 + Supabase 유저 통계)를 하나의 Linear 스타일 페이지로 통합한다. 읽기 전용이며, 기존 API를 그대로 사용한다.

## 라우트 & 사이드바

- **경로**: `/willow-investment/monor`
- **사이드바**: `linear-sidebar.tsx`의 CLIENTS 배열에서 `monor` 항목에 href 추가
- **레이아웃**: `(linear)/layout.tsx`의 PAGE_TITLES에 monor 추가

## 데이터 소스

새 API 없음. 기존 엔드포인트 그대로 사용:

| 엔드포인트 | 용도 |
|------------|------|
| `GET /api/voicecards/stats?startDate=&endDate=` | VoiceCards IAP 통계 + 차트 데이터 + 연결 상태 |
| `POST /api/voicecards/credentials` | VoiceCards API 인증 저장 |
| `GET /api/reviewnotes/stats` | ReviewNotes LemonSqueezy 통계 + 유저 통계 |

## 레이아웃

세로 스택 (위→아래):

```
┌─────────────────────────────────────────┐
│  VoiceCards 블록                         │
│  ├ Connection Banner (미연결 시)          │
│  ├ KPI 3칸: 총매출, 활성구독, 순증감       │
│  ├ 2열: iOS 상세 | Android 상세           │
│  └ 매출 추이 차트                         │
├─────────────────────────────────────────┤
│  ReviewNotes 블록                        │
│  ├ KPI 4칸: 총매출, MRR, 활성구독, 총고객   │
│  ├ 2열: 최근 주문 | 활성 구독자             │
│  ├ 주문 통계 3칸                          │
│  ├ 유저 KPI 4칸                          │
│  └ 최근 가입자 리스트                      │
└─────────────────────────────────────────┘
```

## VoiceCards 블록 상세

### 헤더
- `LSectionHead`: eyebrow "VOICECARDS", title "VoiceCards 인앱결제"
- action 영역: 날짜 필터 칩(일간/주간/월간) + 설정 아이콘 버튼 + 새로고침 아이콘 버튼

### 연결 상태 배너
- iOS/Android 중 미연결 플랫폼이 있으면 `t.neutrals.inner` 배경에 경고 메시지 표시
- "설정하기" 버튼으로 설정 모달 열기

### KPI 행 (3칸 그리드)
- **총 매출**: 합산 매출, iOS/Android 각각 서브 배지로 표시
- **활성 구독자**: 합산, iOS/Android 서브 배지
- **구독 순증감**: 신규-해지, 양수면 pos 톤 / 음수면 neg 톤

### 플랫폼 상세 (2열 그리드)
각 플랫폼(iOS, Android)마다 LCard 안에:
- 헤더: 플랫폼 이름 + 연결 상태 배지
- 6개 메트릭 (2x3 그리드): 매출, 구독자, 신규, 해지, 갱신, 환불

### 매출 추이 차트
- recharts `LineChart` 사용 (기존과 동일)
- 3개 라인: iOS(파랑), Android(초록), 합계(보라, 점선)
- LCard로 감싸고 Linear 스타일 적용

### 설정 모달 (`voicecards-settings-dialog.tsx`)
- 기존 `CredentialsModal` 로직 그대로 Linear 스타일로 변환
- iOS: Issuer ID, Key ID, Private Key, App ID
- Android: Service Account JSON, Package Name
- Linear 모달 패턴: backdrop blur, `t.neutrals.card` 배경, LBtn 사용

## ReviewNotes 블록 상세

### 헤더
- `LSectionHead`: eyebrow "REVIEWNOTES", title "ReviewNotes 매출 현황"
- action 영역: LemonSqueezy 대시보드 외부 링크 + 새로고침 버튼

### KPI 행 (4칸 그리드)
- **총 매출**: `formatCurrency(totalRevenueUSD)`, 이번 달 서브텍스트
- **MRR**: 월간 반복 매출
- **활성 구독자**: 체험/취소 서브 배지
- **총 고객**: 이번 달 신규 서브텍스트

### 주문 & 구독자 (2열 그리드)
- **좌측 - 최근 주문**: 스크롤 가능 리스트, 각 행에 유저명, 상품명, 날짜, 상태 배지, 금액
- **우측 - 활성 구독자**: 스크롤 가능 리스트, 각 행에 유저명, 상품/플랜, 상태 배지, 갱신일

### 주문 통계 (3칸 그리드)
- 이번 달 주문, 총 주문, 환불

### 앱 유저 통계 서브헤더
- `LSectionHead` (eyebrow 없이): title "앱 유저 통계"

### 유저 KPI 행 (4칸 그리드)
- **총 가입자**: 이번 달/이번 주 신규 서브텍스트
- **플랜별 현황**: Free/Basic/Standard/Pro 배지
- **관리자**: Admin 수
- **총 스토리지**: MB 단위

### 최근 가입자 리스트
- 스크롤 가능 리스트, 각 행에 아바타(이니셜 폴백), 이름, 이메일, 플랜 배지, Admin 배지, 가입일

## 파일 구조

```
src/app/willow-investment/(linear)/monor/
├── page.tsx                            — 데이터 로딩, 상태 관리, 블록 조립
└── _components/
    ├── voicecards-block.tsx            — VoiceCards 전체 UI
    ├── voicecards-settings-dialog.tsx  — API 인증 설정 모달
    └── reviewnotes-block.tsx           — ReviewNotes 전체 UI
```

### 수정 필요 기존 파일
- `linear-sidebar.tsx`: monor 항목에 href 추가
- `(linear)/layout.tsx`: PAGE_TITLES에 monor 추가

## 스타일링

- Linear 디자인 토큰(`t.*`) 사용, inline styles
- `LCard`, `LSectionHead`, `LStat`, `LIcon`, `LBtn` 프리미티브 활용
- `tonePalettes` 톤 색상 (pos/neg/warn/info 등)
- 리스트 행: `t.neutrals.inner` 배경, 호버 없음 (읽기 전용)
- 차트: recharts 그대로, 컨테이너만 LCard로 감싸기

## 모바일 대응

- KPI 그리드: 2칸으로 축소
- 플랫폼 상세 / 주문+구독자: 1열 스택
- `useIsMobile()` 훅 사용
