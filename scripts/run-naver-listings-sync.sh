#!/bin/bash
# 네이버 매물 스냅샷 동기화 (launchd용 래퍼)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/naver-listings-sync.log"

mkdir -p "$LOG_DIR"

# 외장 드라이브 마운트 대기
source "$SCRIPT_DIR/lib/wait-for-volume.sh"
wait_for_volume "/Volumes/PRO-G40" 120 >> "$LOG_FILE" 2>&1 || exit 1

cd "$PROJECT_DIR" || exit 1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 네이버 매물 스냅샷 시작" >> "$LOG_FILE"
npx tsx scripts/naver-listings-pipeline.ts "$@" >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 완료 (exit: $EXIT_CODE)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# 성공이든 실패든 CEO 봇으로 알린다. 조용히 실패하면 며칠이 지나도 모른다 —
# Playwright 브라우저가 사라져 2026-08-21부터 이레 동안 매일 죽었는데,
# 대시보드에서 호가가 안 움직이는 걸 눈으로 보고서야 알았다.
# 호가와 실거래를 한 통에 담는다. 실거래 크론(07:13 KST)은 이 시각이면 이미 끝나 있다.
# 알림이 실패해도 종료코드는 그대로 둔다.
# node 를 절대 경로로 부른다. 상대 경로(`node scripts/...`)로 부르면 node 가
# 진입점을 풀려고 cwd 를 읽는데, launchd 아래에서 외장 볼륨 cwd 읽기가
# EPERM 으로 막혀 알림이 시작도 못 하고 죽었다(2026-08-28: 수집은 성공했는데
# 알림만 안 온 날). 파이프라인은 npx 가 절대 경로를 넘겨 무사했다.
NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"
[ -x "$NODE_BIN" ] || NODE_BIN="$(command -v node)"
NOTIFY="$SCRIPT_DIR/notify-realestate.mjs"

if [ $EXIT_CODE -eq 0 ]; then
  "$NODE_BIN" "$NOTIFY" --status ok >> "$LOG_FILE" 2>&1 || true
else
  "$NODE_BIN" "$NOTIFY" --status fail --log "$LOG_FILE" >> "$LOG_FILE" 2>&1 || true
fi

exit $EXIT_CODE
