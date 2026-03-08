#!/bin/bash
# ============================================================
# Willow Agent Telegram Bot — External Drive Wrapper
# ============================================================
# 외장하드(/Volumes/PRO-G40)에 프로젝트가 있으므로
# 드라이브 마운트 확인 후 봇을 실행하는 래퍼 스크립트.
# 크래시 시 자동 재시작 (최대 10회, 쿨다운 30초).
#
# Usage:
#   ./scripts/run-telegram-bot.sh          # 일반 실행
#   ./scripts/run-telegram-bot.sh --daemon  # 백그라운드 실행 (로그 파일)
# ============================================================

set -euo pipefail

# ─── Config ───
VOLUME_PATH="/Volumes/PRO-G40"
PROJECT_DIR="${VOLUME_PATH}/app-dev/willow-invt"
LOG_DIR="${PROJECT_DIR}/scripts/logs"
LOG_FILE="${LOG_DIR}/telegram-bot.log"
PID_FILE="${LOG_DIR}/telegram-bot.pid"
MAX_RETRIES=10
RETRY_COOLDOWN=30  # seconds

# ─── PATH setup (homebrew + node) ───
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# ─── Functions ───
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

check_volume() {
  if [ ! -d "$VOLUME_PATH" ]; then
    log "❌ 외장하드가 마운트되지 않았습니다: $VOLUME_PATH"
    log "   디스크를 연결한 후 다시 시도하세요."
    exit 1
  fi
}

check_project() {
  if [ ! -f "${PROJECT_DIR}/package.json" ]; then
    log "❌ 프로젝트를 찾을 수 없습니다: $PROJECT_DIR"
    exit 1
  fi
  if [ ! -f "${PROJECT_DIR}/.env.local" ]; then
    log "❌ .env.local 파일이 없습니다"
    exit 1
  fi
}

check_dependencies() {
  if ! command -v node &>/dev/null; then
    log "❌ node가 설치되지 않았습니다"
    exit 1
  fi
  if ! command -v claude &>/dev/null; then
    log "⚠️ claude CLI가 PATH에 없습니다 (봇은 실행되지만 AI 응답 불가)"
  fi
}

cleanup() {
  log "🛑 봇 종료 중..."
  rm -f "$PID_FILE"
  # 자식 프로세스도 종료
  if [ -n "${BOT_PID:-}" ] && kill -0 "$BOT_PID" 2>/dev/null; then
    kill "$BOT_PID" 2>/dev/null || true
    wait "$BOT_PID" 2>/dev/null || true
  fi
  log "👋 봇이 종료되었습니다"
  exit 0
}

stop_existing() {
  if [ -f "$PID_FILE" ]; then
    local old_pid
    old_pid=$(cat "$PID_FILE")
    if kill -0 "$old_pid" 2>/dev/null; then
      log "⚠️ 기존 봇 프로세스 종료 중 (PID: $old_pid)"
      kill "$old_pid" 2>/dev/null || true
      sleep 2
      # 아직 살아있으면 강제 종료
      if kill -0 "$old_pid" 2>/dev/null; then
        kill -9 "$old_pid" 2>/dev/null || true
      fi
    fi
    rm -f "$PID_FILE"
  fi
}

run_bot() {
  local retry_count=0

  while [ $retry_count -lt $MAX_RETRIES ]; do
    log "🌿 윌로우 에이전트 텔레그램 봇 시작 (시도 $((retry_count + 1))/${MAX_RETRIES})"

    # 외장하드 마운트 재확인 (재시작 시)
    if [ ! -d "$VOLUME_PATH" ]; then
      log "⚠️ 외장하드 연결 해제 감지. 60초 후 재확인..."
      sleep 60
      if [ ! -d "$VOLUME_PATH" ]; then
        log "❌ 외장하드 여전히 미연결. 봇 종료."
        exit 1
      fi
    fi

    # npx tsx로 실행
    cd "$PROJECT_DIR"
    npx tsx scripts/telegram-bot.ts &
    BOT_PID=$!
    echo $$ > "$PID_FILE"  # 래퍼의 PID 저장

    # 봇 프로세스 대기
    wait "$BOT_PID"
    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
      log "✅ 봇이 정상 종료되었습니다"
      break
    fi

    retry_count=$((retry_count + 1))
    log "⚠️ 봇이 비정상 종료 (코드: $exit_code). ${RETRY_COOLDOWN}초 후 재시작... (${retry_count}/${MAX_RETRIES})"
    sleep $RETRY_COOLDOWN
  done

  if [ $retry_count -ge $MAX_RETRIES ]; then
    log "❌ 최대 재시도 횟수 초과. 봇을 종료합니다."
    exit 1
  fi
}

# ─── Main ───
trap cleanup SIGINT SIGTERM

# 사전 체크
check_volume
check_project
check_dependencies

# 로그 디렉토리 생성
mkdir -p "$LOG_DIR"

# 기존 프로세스 정리
stop_existing

# 데몬 모드
if [ "${1:-}" = "--daemon" ]; then
  log "🔄 데몬 모드로 실행합니다 (로그: $LOG_FILE)"
  run_bot >> "$LOG_FILE" 2>&1 &
  DAEMON_PID=$!
  echo $DAEMON_PID > "$PID_FILE"
  log "✅ 봇 시작됨 (PID: $DAEMON_PID)"
  log "   로그 확인: tail -f $LOG_FILE"
  log "   종료: kill $DAEMON_PID"
  exit 0
fi

# 포그라운드 실행
run_bot
