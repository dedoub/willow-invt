#!/bin/bash
# ============================================================
# Ryuha Study Bot — External Drive Wrapper
# ============================================================
set -euo pipefail

# ─── Config ───
VOLUME_PATH="/Volumes/PRO-G40"
PROJECT_DIR="${VOLUME_PATH}/app-dev/willow-invt"
LOG_DIR="${PROJECT_DIR}/scripts/logs"
LOG_FILE="${LOG_DIR}/ryuha-bot.log"
PID_FILE="${LOG_DIR}/ryuha-bot.pid"
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
MAX_RETRIES=10
RETRY_COOLDOWN=30

# ─── PATH setup ───
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# ─── Functions ───
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

check_volume() {
  if [ -d "$VOLUME_PATH" ]; then return 0; fi
  log "⏳ 외장하드 마운트 대기 중: $VOLUME_PATH (최대 60초)"
  local waited=0
  while [ $waited -lt 60 ]; do
    sleep 5
    waited=$((waited + 5))
    if [ -d "$VOLUME_PATH" ]; then
      log "✅ 드라이브 마운트 확인 (${waited}초 대기)"
      return 0
    fi
  done
  log "❌ 외장하드 마운트 타임아웃"
  exit 1
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
    log "⚠️ claude CLI가 PATH에 없습니다"
  fi
}

cleanup() {
  log "🛑 봇 종료 중..."
  rm -f "$PID_FILE"
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
      log "⚠️ 기존 봇 프로세스 그룹 종료 중 (PID: $old_pid)"
      kill -- -"$old_pid" 2>/dev/null || kill "$old_pid" 2>/dev/null || true
      sleep 2
    fi
    rm -f "$PID_FILE"
  fi
  local LOCK_FILE="${LOG_DIR}/ryuha-bot.lock"
  if [ -f "$LOCK_FILE" ]; then
    local lock_pid
    lock_pid=$(cat "$LOCK_FILE")
    if kill -0 "$lock_pid" 2>/dev/null; then
      log "⚠️ lock 파일 프로세스 종료 중 (PID: $lock_pid)"
      kill "$lock_pid" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$LOCK_FILE"
  fi
  pkill -f 'scripts/ryuha-telegram-bot.ts' 2>/dev/null || true
  sleep 2
  if pgrep -f 'scripts/ryuha-telegram-bot.ts' >/dev/null 2>&1; then
    log "⚠️ 강제 종료 (SIGKILL)"
    pkill -9 -f 'scripts/ryuha-telegram-bot.ts' 2>/dev/null || true
    sleep 1
  fi
}

run_bot() {
  local retry_count=0
  while [ $retry_count -lt $MAX_RETRIES ]; do
    log "🎓 류하 공부친구 봇 시작 (시도 $((retry_count + 1))/${MAX_RETRIES})"

    if [ ! -d "$VOLUME_PATH" ]; then
      log "⚠️ 외장하드 연결 해제 감지. 60초 후 재확인..."
      sleep 60
      if [ ! -d "$VOLUME_PATH" ]; then
        log "❌ 외장하드 여전히 미연결. 봇 종료."
        exit 1
      fi
    fi

    cd "$PROJECT_DIR"
    npx tsx scripts/ryuha-telegram-bot.ts &
    BOT_PID=$!
    # PID_FILE은 래퍼 셸 PID를 유지한다. 실제 봇 프로세스 PID는 lock 파일이 담당한다.

    local exit_code=0
    if wait "$BOT_PID"; then
      exit_code=0
    else
      exit_code=$?
    fi

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

check_volume
check_project
check_dependencies
mkdir -p "$LOG_DIR"

if [ "${1:-}" = "--daemon-child" ]; then
  run_bot
  exit $?
fi

if [ "${1:-}" = "--stop" ]; then
  stop_existing
  log "🛑 기존 봇 정리 완료"
  exit 0
fi

stop_existing

if [ "${1:-}" = "--daemon" ]; then
  log "🔄 데몬 모드로 실행합니다 (로그: $LOG_FILE)"
  nohup "$SCRIPT_PATH" --daemon-child >> "$LOG_FILE" 2>&1 < /dev/null &
  DAEMON_PID=$!
  echo $DAEMON_PID > "$PID_FILE"
  log "✅ 봇 시작됨 (PID: $DAEMON_PID)"
  log "   로그 확인: tail -f $LOG_FILE"
  log "   종료: kill $DAEMON_PID"
  exit 0
fi

run_bot
