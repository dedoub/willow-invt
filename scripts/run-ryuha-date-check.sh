#!/bin/bash
set -euo pipefail

PROJECT_DIR="/Volumes/PRO-G40/app-dev/willow-invt"
LOG_DIR="${PROJECT_DIR}/scripts/logs"
LOG_FILE="${LOG_DIR}/ryuha-date-check.log"
TZ_NAME="Asia/Seoul"

mkdir -p "$LOG_DIR"

timestamp=$(TZ="$TZ_NAME" date '+%Y-%m-%d %H:%M:%S')
month_day=$(TZ="$TZ_NAME" date '+%-m월 %-d일')
weekday_num=$(TZ="$TZ_NAME" date '+%u')

case "$weekday_num" in
  1) weekday="월" ;;
  2) weekday="화" ;;
  3) weekday="수" ;;
  4) weekday="목" ;;
  5) weekday="금" ;;
  6) weekday="토" ;;
  7) weekday="일" ;;
  *) weekday="?" ;;
esac

message="오늘은 ${month_day} (${weekday})"

echo "[$timestamp] $message" | tee -a "$LOG_FILE"
