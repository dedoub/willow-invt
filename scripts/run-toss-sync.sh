#!/bin/bash
# 토스증권 계좌 → stock_trades 동기화 (launchd 전용).
# 토스 Open API는 IP 허용목록이 걸려 있어 허용된 IP(이 맥)에서만 성공한다.
# launchd는 drive-launcher.sh로 외장볼륨 마운트 대기 후 이 스크립트를 실행한다.
cd /Volumes/PRO-G40/app-dev/willow-invt
mkdir -p scripts/logs

echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') toss-sync start =====" >> scripts/logs/toss-sync.log
npx tsx scripts/toss-sync.ts >> scripts/logs/toss-sync.log 2>&1
echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') toss-sync done =====" >> scripts/logs/toss-sync.log
