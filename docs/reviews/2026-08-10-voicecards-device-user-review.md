# VoiceCards 비로그인 기기 사용자 통합 코드 리뷰

- 리뷰일: 2026-08-10
- 범위: Willow 대시보드의 VoiceCards 사용자/퍼널 집계, VoiceCards 기기 계정 생성·병합·구매 경로, 운영 Supabase 함수와 실제 데이터
- Willow 기준: `main` @ `f84e94a` (`origin/main`과 동일)
- VoiceCards 기준: `/Users/dongwookkim/app-dev-old/voice-cards`의 `main` @ `a2cef40` (`origin/main`보다 28커밋 앞섬)
- 작업트리: Willow에 기존 변경 `.claude/scheduled_tasks.lock` 삭제 및 `.claude/skills/saju-reader/` 미추적 파일이 있었고, 리뷰에서 건드리지 않았다. VoiceCards 작업트리는 깨끗했다.

## 결론

현재 구현은 빌드와 정상 앱 흐름 테스트는 통과하지만, 그대로 운영하기에는 두 가지 P0 보안 결함과 여러 집계 오류가 있다. 특히 크레딧 지급 RPC는 익명 클라이언트가 직접 호출할 수 있어 실제 원가 유출로 이어질 수 있으므로 대시보드 표시 수정에 앞서 서버 권한 경계를 먼저 닫아야 한다.

## Findings

### P0-1. 익명 클라이언트가 영수증 없이 임의 크레딧을 지급할 수 있다

`add_credits`는 `SECURITY DEFINER`이고 `anon`, `authenticated`에 실행 권한이 있다. 호출자가 `p_user_id`, `p_amount`(최대 12,000), `p_reason`을 모두 정하며 서버는 App Store/Google Play 영수증이나 거래 ID를 검증하지 않는다. `p_reason='purchase'`이면 `has_purchased`까지 켜진다.

- VoiceCards: `supabase/migrations/061_merge_remerge_and_add_credits_guard.sql:38`
- VoiceCards: `supabase/migrations/061_merge_remerge_and_add_credits_guard.sql:69`
- VoiceCards: `src/services/creditsService.ts:78`
- VoiceCards: `src/services/purchaseService.ts:123`
- 운영 DB 확인: `add_credits`, `ensure_device_account`, `merge_device_account`가 모두 익명 실행 가능한 상태다.

영향: Supabase 공개 anon key만 있으면 결제 없이 크레딧과 구매자 권한을 만들 수 있다. 매출·결제율·유료 사용자 데이터도 오염된다.

권장 조치: `add_credits`의 `anon/authenticated` 실행 권한을 회수하고 `service_role` 전용으로 바꾼다. 앱은 스토어 영수증을 서버 Edge Function으로 보내고, 서버가 상품·금액·거래 ID·소유자를 검증한 뒤 멱등적으로 크레딧을 지급해야 한다.

### P0-2. 기기 계정 생성·병합 RPC도 호출자 신원을 검증하지 않는다

`ensure_device_account`는 임의의 `device:*` 문자열마다 무료 100크레딧을 지급하고, `merge_device_account`는 호출자가 넘긴 기기 계정과 Google 사용자 ID를 그대로 병합한다. 두 함수 모두 `SECURITY DEFINER`이며 익명 실행이 가능하다.

- VoiceCards: `supabase/migrations/059_device_accounts.sql:59`
- VoiceCards: `supabase/migrations/059_device_accounts.sql:140`
- VoiceCards: `supabase/migrations/061_merge_remerge_and_add_credits_guard.sql:74`
- VoiceCards: `supabase/migrations/061_merge_remerge_and_add_credits_guard.sql:268`
- VoiceCards: `src/services/deviceAccountService.ts:147`
- VoiceCards: `src/services/accountMerge.ts:192`

영향: 공격자가 새 device ID를 계속 생성한 뒤 같은 Google 계정으로 반복 병합하면 두 번째 병합부터 무료 크레딧을 누적할 수 있다. 다른 사용자의 ID를 대상으로 병합을 시도하는 것도 서버에서 막지 않는다.

권장 조치: 기기 계정 생성은 서버가 발급·서명한 기기 토큰 또는 App Attest/Play Integrity 같은 검증값에 묶는다. 병합은 서버가 검증한 Google 토큰의 `sub`만 대상으로 허용하고, 클라이언트가 임의의 대상 ID를 지정하지 못하게 한다. 두 RPC의 직접 실행 권한은 회수한다.

### P1-1. 사용자 표에 실제 사용자뿐 아니라 비로그인 방문자 222대가 전부 섞인다

대시보드는 `recentAnon` 전체를 `deviceRows`로 변환해 사용자 표에 추가한다. 운영 DB 기준 미로그인 기기 222대는 `opened` 33, `demo` 76, `intent` 98, `signin_attempted` 15대로, 로컬 덱 생성·크레딧 사용·구매가 확인된 사용자가 아니다.

- Willow: `src/app/(dashboard)/(linear)/voicecards/_components/voicecards-block.tsx:546`
- Willow: `src/app/(dashboard)/(linear)/voicecards/_components/voicecards-block.tsx:564`

영향: 단순 앱 실행자와 데모 방문자가 `사용자` 표에 표시되어 모집단이 약 두 배로 부풀고, 실제 비로그인 로컬 사용자 분석이 어려워진다.

권장 조치: 사용자 표에는 `users`의 미병합 device 계정 중 실제 사용 신호가 있는 행만 넣는다. 나머지 익명 여정은 별도 `방문자` 표로 유지하거나 필터로 분리한다.

### P1-2. 크레딧을 실제 사용한 기기 계정이 활성화에서 빠진다

`deviceAccountsActivated`는 `pending_local_sheet_created` 이벤트만 본다. CEO가 정한 모집단은 로컬 자기 덱/카드 사용뿐 아니라 크레딧 사용·구매가 있는 비로그인 기기도 포함하지만, `creditsSpent`, 학습 세션, 구매 신호는 활성 판정에 사용하지 않는다.

- Willow: `src/lib/voicecards-server.ts:1256`
- Willow: `src/lib/voicecards-server.ts:1400`
- Willow: `src/app/(dashboard)/(linear)/voicecards/_components/voicecards-block.tsx:802`

운영 데이터에서 한 device 계정은 `credits_spent=23`인데 `pending_local_sheet_created=0`이라 현재 로직상 활성화 0명으로 남는다. 이 계정은 내부 관리자 기기이지만, 판정 누락 자체는 동일한 실사용 기기에서도 발생한다.

권장 조치: `local_deck_created/local_card_created`, 자기 카드 학습, `credit_transactions` 음수 사용, 구매 중 합의된 기준을 서버에서 하나의 `device_user_status`로 계산한다. 활성화와 사용자 모집단은 각각 명시적인 기준을 둔다.

### P1-3. 내부·리뷰 기기 계정이 사용자 수에서 제외되지 않는다

Google 계정은 이메일·사용자 ID로 제외하지만 `device:*` 행은 과거 기기와 관리자 계정의 연결을 보지 않는다. 운영의 `device:4f4d...`는 관리자 ID `101662172713686736923`의 과거 기기인데 live device 계정으로 집계되고, `device:f0cf...`는 미출시 `1.1.127` 이벤트라 `vc_device_journeys`에서는 제외되지만 users 집계에는 들어간다.

- Willow: `src/lib/voicecards-server.ts:1036`
- Willow: `src/lib/voicecards-server.ts:1395`

영향: 현재 표시되는 기기 계정 2명은 모두 실사용자 모집단으로 확정할 수 없고, 최소 1명은 명백한 내부 계정이다.

권장 조치: 기기 계정도 `vc_device_journeys`와 같은 device-level 관리자·봇·리뷰버전 제외 규칙을 적용한다. users 집계와 여정 뷰가 동일한 제외 테이블 또는 RPC를 사용하게 한다.

### P1-4. 크레딧 지급 실패 후에도 소모성 구매 영수증을 완료 처리한다

구매 리스너는 `addCredits`가 실패해도 `finishTransaction({ isConsumable: true })`를 호출한다. catch 경로도 동일하다. 재처리 큐나 서버 영수증 원장이 없어 일시적인 네트워크/RPC 실패 시 사용자는 결제했지만 크레딧을 잃을 수 있다.

- VoiceCards: `src/services/purchaseService.ts:126`
- VoiceCards: `src/services/purchaseService.ts:148`
- VoiceCards: `src/services/purchaseService.ts:178`

권장 조치: 서버가 거래 ID를 멱등 원장에 기록하고 크레딧 지급 성공을 확인한 뒤에만 소비 처리를 완료한다. 실패 거래는 재시도·복구 가능하게 보존한다.

### P2-1. 기기 계정 생성일이 `Google 로그인일`로 표시된다

서버는 모든 users 행에 `created_at`을 `createdAt`으로 넣고, UI는 이를 `로그인` 열로 표시한다. device 계정은 Google 로그인을 하지 않았으므로 기기 계정 생성 시간이 로그인 시간처럼 보인다.

- Willow: `src/lib/voicecards-server.ts:1318`
- Willow: `src/app/(dashboard)/(linear)/voicecards/_components/voicecards-block.tsx:1466`

권장 조치: `accountType`, `deviceAccountCreatedAt`, `googleLoginAt`을 분리하고 device 계정의 Google 로그인일은 null로 표시한다.

### P2-2. 결제자 수는 병합 전후 ID를 정규화하지 않아 중복될 수 있다

`totalPaidUsers`는 구매 이벤트의 raw `user_id`를 distinct 처리한다. 같은 사용자가 기기 계정으로 한 번, Google 계정으로 한 번 구매하면 2명으로 집계된다.

- Willow: `src/lib/voicecards-server.ts:732`

권장 조치: 구매 이벤트 ID를 `users.merged_into`로 정규화한 canonical user ID 기준으로 집계한다.

### P2-3. 현재 활성화 값과 시계열 그래프의 모집단이 다르다

현재 `학습 활성화` 값은 Google 활성화와 device 활성화를 합치지만, sparkline과 결제율 시계열은 기존 Google 활성화 시리즈만 사용한다. device 활성 사용자가 생기면 카드 숫자와 추세선이 서로 다른 지표가 된다.

- Willow: `src/app/(dashboard)/(linear)/voicecards/_components/voicecards-block.tsx:806`
- Willow: `src/app/(dashboard)/(linear)/voicecards/_components/voicecards-block.tsx:863`
- Willow: `src/app/(dashboard)/(linear)/voicecards/_components/voicecards-block.tsx:908`

권장 조치: 일별 canonical user snapshot을 만들고 현재값과 시계열 모두 같은 모집단·정의를 사용한다.

### P2-4. 기기 활성화 이벤트 조회는 1,000행 상한에 걸린다

`pending_local_sheet_created` 조회는 페이지네이션이나 distinct RPC 없이 전체 select를 호출한다. 이벤트가 1,000행을 넘으면 뒤쪽 기기 활성화가 조용히 누락된다.

- Willow: `src/lib/voicecards-server.ts:1263`

권장 조치: DB에서 `distinct device_id`를 반환하는 RPC/view를 만들거나 기존 페이지네이션 헬퍼를 사용한다.

## 구현 상태

- 완료: device 계정과 Google 계정을 서버 사용자 목록에서 구분한다.
- 완료: 병합된 device 계정을 device account 수에서 제외한다.
- 완료: 대시보드 사용자 표에 설치일·로그인일·활동일을 분리하는 UI 골격이 있다.
- 미완료: 실제 사용자와 방문자의 canonical 모집단 정의.
- 미완료: device 계정의 내부·봇·리뷰 빌드 제외.
- 미완료: 병합 전후 사용자·결제자 중복 제거.
- 차단 필요: 크레딧 지급·기기 생성·병합 RPC의 서버 신뢰 경계.

## Verification

- `npx tsc --noEmit` (Willow): 통과
- `npm run build` (Willow): 통과, Next.js 121개 route 생성 완료
- 관련 파일 ESLint: 기존 `page.tsx:195`의 `react-hooks/set-state-in-effect` 1건으로 실패, 이번 device 집계 diff에서 새로 생긴 오류는 아님
- `npx tsc --noEmit` (VoiceCards): 통과
- device account 관련 Jest 6 suites / 47 tests: 모두 통과
- 운영 Supabase 함수 정의·ACL·users·anonymous_events·credit_transactions·vc_device_journeys 직접 조회: 완료
- Willow에는 device 사용자 집계에 대한 자동 테스트가 없음

## 다음 순서

1. `add_credits`, `ensure_device_account`, `merge_device_account` 직접 실행 권한을 차단하고 서버 검증 경로로 이전한다.
2. 결제 영수증 검증·멱등 원장·실패 재처리를 구현한다.
3. 사용자 모집단을 `Google 사용자`, `비로그인 실제 사용자`, `익명 방문자`로 분리하고 공통 제외 규칙을 적용한다.
4. canonical user ID 기준으로 활성화·결제·시계열을 다시 계산한다.
5. 집계 규칙과 병합·보안 공격 경로를 자동 테스트로 추가한다.
