#!/bin/bash
# VoiceCards 결제 실시간 알림 (launchd: com.willow.purchase-alert)
cd /Volumes/PRO-G40/app-dev/willow-invt
mkdir -p scripts/logs
npx tsx scripts/purchase-alert.ts >> scripts/logs/purchase-alert.log 2>&1
