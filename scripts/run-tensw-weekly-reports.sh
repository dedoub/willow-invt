#!/bin/bash
# 텐소프트웍스 프로젝트별 주간 리포트 생성 (로컬 Claude CLI)
# launchd에서 호출됨: 매주 월요일 08:00 KST

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$SCRIPT_DIR/logs"

# 외장 드라이브 마운트 대기
source "$SCRIPT_DIR/lib/wait-for-volume.sh"
wait_for_volume "/Volumes/PRO-G40" 120 >> "$SCRIPT_DIR/logs/tensw-weekly-reports.log" 2>&1 || exit 1

cd /Volumes/PRO-G40/app-dev/willow-invt || exit 1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting tensw weekly reports..." >> scripts/logs/tensw-weekly-reports.log

# Prevent nested Claude sessions
unset CLAUDECODE

/opt/homebrew/bin/npx tsx scripts/tensw-weekly-reports.ts >> scripts/logs/tensw-weekly-reports.log 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Finished tensw weekly reports (exit: $?)" >> scripts/logs/tensw-weekly-reports.log
