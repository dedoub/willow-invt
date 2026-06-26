#!/bin/bash
# 텐소프트웍스 프로젝트별 주간 리포트 생성 (현재 구현 대기)
# launchd에서 호출되더라도 대상 스크립트가 없으면 명확히 로그만 남기고 종료한다.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="/Volumes/PRO-G40/app-dev/willow-invt"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/tensw-weekly-reports.log"
TARGET_SCRIPT="$PROJECT_DIR/scripts/tensw-weekly-reports.ts"

mkdir -p "$LOG_DIR"

# 외장 드라이브 마운트 대기
source "$SCRIPT_DIR/lib/wait-for-volume.sh"
wait_for_volume "/Volumes/PRO-G40" 120 >> "$LOG_FILE" 2>&1 || exit 1

cd "$PROJECT_DIR" || exit 1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting tensw weekly reports..." >> "$LOG_FILE"

# Prevent nested Claude sessions
unset CLAUDECODE

if [ ! -f "$TARGET_SCRIPT" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Skipped: target script missing ($TARGET_SCRIPT)" >> "$LOG_FILE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Keep tensw-weekly-reports disabled until implementation is restored." >> "$LOG_FILE"
  exit 64
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.claude/local/bin:$PATH"

set +e
/opt/homebrew/bin/npx tsx "$TARGET_SCRIPT" >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
set -e

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Finished tensw weekly reports (exit: $EXIT_CODE)" >> "$LOG_FILE"

exit $EXIT_CODE
