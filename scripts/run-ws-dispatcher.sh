#!/bin/bash
# 워크스테이션 명령 디스패처 런처 (launchd StartInterval에서 주기 실행)
# 외장하드 미마운트/프로젝트 없음이면 조용히 종료. 단일 패스 후 종료(락은 스크립트 내부 처리).
set -euo pipefail

VOLUME_PATH="/Volumes/PRO-G40"
PROJECT_DIR="${VOLUME_PATH}/app-dev/willow-invt"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

[ -d "$VOLUME_PATH" ] || exit 0
[ -f "$PROJECT_DIR/.env.local" ] || exit 0

cd "$PROJECT_DIR"
exec npx tsx scripts/ws-dispatcher.ts
