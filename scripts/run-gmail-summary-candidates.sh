#!/bin/bash
# Gmail 정리 후보 리스트 생성 (launchd용 래퍼)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$HOME/logs/gmail-summary-candidates"
LOG_FILE="$LOG_DIR/gmail-summary-candidates.log"

mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR" || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.claude/local/bin:$PATH"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Gmail 정리 후보 스캔 시작" >> "$LOG_FILE"
npx tsx scripts/gmail-summary-candidates.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 완료 (exit: $EXIT_CODE)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

exit $EXIT_CODE
