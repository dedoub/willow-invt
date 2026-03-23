#!/bin/bash
# 포트폴리오 브리핑 (launchd용 래퍼)
# Usage: run-portfolio-briefing.sh <kr-open|kr-close|us-open|us-close>

SESSION="${1:-}"
if [ -z "$SESSION" ]; then
  echo "Usage: $0 <kr-open|kr-close|us-open|us-close>"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/portfolio-briefing.log"

mkdir -p "$LOG_DIR"

# 외장 드라이브 마운트 대기
source "$SCRIPT_DIR/lib/wait-for-volume.sh"
wait_for_volume "/Volumes/PRO-G40" 120 >> "$LOG_FILE" 2>&1 || exit 1

cd "$PROJECT_DIR" || exit 1

# PATH 설정 (homebrew + node + claude)
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.claude/local/bin:$PATH"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 포트폴리오 브리핑 시작 (session: $SESSION)" >> "$LOG_FILE"
npx tsx scripts/portfolio-briefing.ts --session "$SESSION" >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 완료 (exit: $EXIT_CODE)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

exit $EXIT_CODE
