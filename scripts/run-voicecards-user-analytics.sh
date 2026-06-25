#!/bin/bash
# VoiceCards 일일 유저 분석 (launchd용 래퍼)
# 매일 07:00 KST (일요일은 스크립트 내에서 스킵)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/voicecards-user-analytics.log"

mkdir -p "$LOG_DIR"

# 외장 드라이브 마운트 대기 (있으면)
if [ -f "$SCRIPT_DIR/lib/wait-for-volume.sh" ]; then
  source "$SCRIPT_DIR/lib/wait-for-volume.sh"
  wait_for_volume "/Volumes/PRO-G40" 120 >> "$LOG_FILE" 2>&1 || exit 1
fi

cd "$PROJECT_DIR" || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.claude/local/bin:$PATH"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] VoiceCards user analytics 시작" >> "$LOG_FILE"
npx tsx scripts/voicecards-user-analytics.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 완료 (exit: $EXIT_CODE)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

exit $EXIT_CODE
