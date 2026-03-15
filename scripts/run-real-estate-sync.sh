#!/bin/bash
# 부동산 실거래가 일일 동기화 스크립트
# 사용법: ./scripts/run-real-estate-sync.sh [--full]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/real-estate-sync.log"

mkdir -p "$LOG_DIR"

# 외장 드라이브 마운트 대기
source "$SCRIPT_DIR/lib/wait-for-volume.sh"
wait_for_volume "/Volumes/PRO-G40" 120 >> "$LOG_FILE" 2>&1 || exit 1

echo "==============================" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 부동산 동기화 시작" >> "$LOG_FILE"

cd "$PROJECT_DIR" || exit 1

# 최근 2개월 동기화 (기본) 또는 --full 15개월
npx tsx scripts/real-estate-pipeline.ts "$@" >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 완료 (exit: $EXIT_CODE)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

exit $EXIT_CODE
