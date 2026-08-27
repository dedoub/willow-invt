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
if [ $EXIT_CODE -eq 0 ]; then
  node scripts/notify-realestate.mjs --status ok >> "$LOG_FILE" 2>&1 || true
else
  node scripts/notify-realestate.mjs --status fail --log "$LOG_FILE" >> "$LOG_FILE" 2>&1 || true
fi

exit $EXIT_CODE
