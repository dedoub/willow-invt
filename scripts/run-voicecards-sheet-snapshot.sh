#!/bin/bash
# VoiceCards 시트 스냅샷 — 유저별 시트 수 일별 기록 (매일 00:05, launchd는 drive-launcher 래퍼로 호출)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$SCRIPT_DIR/logs/voicecards-sheet-snapshot.log"
mkdir -p "$SCRIPT_DIR/logs"
cd "$PROJECT_DIR" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.claude/local/bin:$PATH"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] sheet snapshot 시작" >> "$LOG_FILE"
npx tsx scripts/voicecards-sheet-snapshot.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 완료 (exit: $EXIT_CODE)" >> "$LOG_FILE"
exit $EXIT_CODE
