#!/bin/bash
# 통합 마켓 리서치 스캔 (launchd용 래퍼)
# 매일 16:15 실행 — 시장 데이터 + 레딧 버즈 통합 리포트 → 텔레그램 전송

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/market-research-scan.log"

mkdir -p "$LOG_DIR"

# 외장 드라이브 마운트 대기
source "$SCRIPT_DIR/lib/wait-for-volume.sh"
wait_for_volume "/Volumes/PRO-G40" 120 >> "$LOG_FILE" 2>&1 || exit 1

cd "$PROJECT_DIR" || exit 1

# PATH 설정 (homebrew + node + claude)
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.claude/local/bin:$PATH"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 통합 마켓 리서치 스캔 시작" >> "$LOG_FILE"
npx tsx scripts/market-research-scan.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 완료 (exit: $EXIT_CODE)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

exit $EXIT_CODE
