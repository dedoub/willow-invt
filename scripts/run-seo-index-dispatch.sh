#!/bin/bash
# VoiceCards + ReviewNotes + Portle + Scripta GSC 25시간 간격 디스패치 (launchd 전용)
set -euo pipefail

PROJECT_DIR="/Volumes/PRO-G40/app-dev/willow-invt"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

[ -d "$PROJECT_DIR" ] || exit 0
[ -f "$PROJECT_DIR/.env.local" ] || exit 0

cd "$PROJECT_DIR"
exec npx tsx scripts/seo-index-dispatch.ts
