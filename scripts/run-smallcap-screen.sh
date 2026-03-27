#!/bin/bash
# 소형주 스크리닝 파이프라인 (launchd용 래퍼)
# 매주 토요일 10:00 실행 — Finviz → OpenInsider → Reddit → Score → DB → Telegram

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/smallcap-screen.log"

mkdir -p "$LOG_DIR"
mkdir -p "$LOG_DIR/tmp"

# 외장 드라이브 마운트 대기
source "$SCRIPT_DIR/lib/wait-for-volume.sh"
wait_for_volume "/Volumes/PRO-G40" 120 >> "$LOG_FILE" 2>&1 || exit 1

cd "$PROJECT_DIR" || exit 1

# PATH 설정 (homebrew + node)
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.claude/local/bin:$PATH"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 소형주 스크리닝 시작" >> "$LOG_FILE"
npx tsx scripts/smallcap-screen.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 완료 (exit: $EXIT_CODE)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

exit $EXIT_CODE
