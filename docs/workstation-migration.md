# 워크스테이션 이주 런북 (컴퓨터 교체)

> 핵심: **맥락(데이터)은 클라우드에 있어 안 옮겨도 된다. 옮기는 건 로컬 배선뿐.**
> 스레드·결정·세션은 Supabase(`ws_threads`/`ws_thread_events`/`ws_sessions`)에 있고,
> MCP 툴은 Vercel에 있다. 새 컴퓨터에서는 이 클라우드에 **다시 연결만** 하면 된다.

## 왜 배선만 문제인가

모든 경로가 `<볼륨>/app-dev/willow-invt` 구조라, 절대경로 `/Volumes/PRO-G40`가
훅(settings.json 1) · launchd plist(19) · run-*.sh(16) · 전역 CLAUDE.md(1) · ws-context.mjs 기본값,
그리고 Claude 자동 메모리 폴더명(`-Volumes-PRO-G40-app-dev-willow-invt`)에 박혀 있다.
→ **볼륨 경로 하나만 새 값으로 치환하면** 하위 경로가 전부 정합하게 맞춰진다.

## 순서

### 1. 사람이 직접 (스크립트 전)
1. `node` / `npx` / (선택)`claude` CLI 설치 (homebrew 등)
2. 레포를 새 위치로 복제/복사
   - **가장 쉬운 길: 같은 외장 SSD를 그대로 꽂는다** → 경로 동일 `/Volumes/PRO-G40` → 치환 0곳
   - 다른 위치로 옮길 땐 `<새볼륨>/app-dev/willow-invt` 레이아웃을 유지하면 볼륨 치환만으로 끝남
3. `.env.local` 복사 (git에 없음 — 옛 컴퓨터에서 직접)
4. `~/.claude/CLAUDE.md` · `~/.claude/settings.json` 이동 (전역 프로토콜 지시 + SessionStart 훅)

### 2. 스크립트로 자동 (배선 치환)
```bash
cd <새-레포>
node scripts/migrate-workstation.mjs            # 점검: 뭐가 바뀌는지 + DB 연결 확인 (변경 없음)
node scripts/migrate-workstation.mjs --apply --yes   # 적용: 경로 치환 → launchd 재등록 → 스모크 테스트
```
스크립트가 하는 일:
- 프리플라이트: node/npx/claude, `.env.local`(+필수 키), **클라우드 맥락 DB 연결** 확인
- 옛 경로를 settings.json 훅에서 자동 감지 (또는 `--from <옛경로>`)
- 훅·plist·run-*.sh·CLAUDE.md·ws-context.mjs의 경로 일괄 치환
- Claude 자동 메모리 폴더를 새 경로 폴더명으로 복사 (캐시 — 없어도 DB에서 복원)
- launchd 전 스케줄러 재등록(bootout→bootstrap)
- `ws-context.mjs load` 스모크 테스트로 공유 맥락 출력 확인

### 3. 확인
- 새 Claude 세션 시작 → 상단에 "🗂️ 워크스테이션 공유 맥락" 뜨면 성공
- `launchctl list | grep -E 'willow|tensw|ryuha|voicecards'` 로 스케줄러 로드 확인
- Gmail 등 OAuth 통합은 첫 실행 시 재인증 (토큰은 옮겨지지 않음)

## 실패 시
- 세션 상단에 공유 맥락이 안 뜸 → 훅 경로 확인: `grep ws-context ~/.claude/settings.json`
- DB 연결 실패 → `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SECRET_KEY` 확인
- 급하면 경로 오버라이드: `WS_HUB_ENV=<새>/.env.local node scripts/ws-context.mjs load`
