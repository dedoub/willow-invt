#!/bin/bash
# VoiceCards 국가 백필 — anonymous_events.country 를 ip_address 로 채운다 (일 1회)
# launchd는 drive-launcher.sh 래퍼로 호출(외장 볼륨 마운트 대기 후 실행)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$SCRIPT_DIR/logs/voicecards-country.log"
mkdir -p "$SCRIPT_DIR/logs"
cd "$PROJECT_DIR" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.claude/local/bin:$PATH"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] country backfill 시작" >> "$LOG_FILE"
npx tsx scripts/voicecards-country-backfill.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 완료 (exit: $EXIT_CODE)" >> "$LOG_FILE"
exit $EXIT_CODE
