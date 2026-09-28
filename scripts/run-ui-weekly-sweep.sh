#!/bin/bash
# launchd com.willow.ui-weekly-sweep — 매주 월요일 07:00, 대시보드 전 화면 UI 점검
cd /Volumes/PRO-G40/app-dev/willow-invt || exit 1
mkdir -p scripts/logs
echo "=== $(date '+%Y-%m-%d %H:%M:%S') ui-weekly-sweep ===" >> scripts/logs/ui-weekly-sweep.log
node scripts/ui-weekly-sweep.mjs >> scripts/logs/ui-weekly-sweep.log 2>&1
