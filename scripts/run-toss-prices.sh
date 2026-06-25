#!/bin/bash
# 토스 가격 스냅샷 → toss_price_snapshot (launchd 전용, 15분 간격).
# 토스 Open API는 IP 허용목록 → 허용된 IP(이 맥)에서만 성공.
cd /Volumes/PRO-G40/app-dev/willow-invt
mkdir -p scripts/logs

npx tsx scripts/toss-prices.ts >> scripts/logs/toss-prices.log 2>&1
