#!/bin/bash
# 스토어 방문 지표 일일 수집 (launchd: com.willow.store-visits-sync)
cd /Volumes/PRO-G40/app-dev/willow-invt
mkdir -p scripts/logs
npx tsx scripts/store-visits-sync.ts >> scripts/logs/store-visits-sync.log 2>&1
