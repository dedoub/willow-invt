#!/bin/bash
# =============================================================================
# wait-for-volume.sh — 외장 드라이브 마운트 대기 헬퍼
# =============================================================================
# launchd 스케줄러가 darkwake 상태에서 실행될 때 외장 드라이브가
# 아직 마운트되지 않은 경우를 처리. 최대 N초 대기 후 실패.
#
# Usage:
#   source "$(dirname "$0")/lib/wait-for-volume.sh"
#   wait_for_volume "/Volumes/PRO-G40" 120  # 최대 120초 대기
# =============================================================================

wait_for_volume() {
  local volume_path="${1:-/Volumes/PRO-G40}"
  local max_wait="${2:-120}"  # 기본 2분
  local interval=5
  local waited=0

  if [ -d "$volume_path" ]; then
    return 0
  fi

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⏳ 외장 드라이브 대기 중: $volume_path (최대 ${max_wait}초)"

  while [ $waited -lt $max_wait ]; do
    sleep $interval
    waited=$((waited + interval))

    if [ -d "$volume_path" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ 드라이브 마운트 확인 (${waited}초 대기)"
      return 0
    fi
  done

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ 드라이브 마운트 타임아웃 (${max_wait}초 초과): $volume_path"
  return 1
}
