#!/bin/bash
# 강남구 인턴십 출근부 월별 발송 (launchd용 래퍼)
#
# launchd 는 매일 부른다. "그 달의 마지막 영업일"은 달력으로 표현할 수 없어서,
# --on-send-date 가 오늘이 그날인지 가리고 아니면 아무것도 하지 않는다.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$HOME/logs/gangnam-attendance"
LOG_FILE="$LOG_DIR/send.log"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR" || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export GANGNAM_PYTHON="$HOME/.willow/venv/bin/python"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 출근부 발송 확인" >> "$LOG_FILE"
node scripts/gangnam-attendance-send.mjs --on-send-date --send >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 완료 (exit: $EXIT_CODE)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
