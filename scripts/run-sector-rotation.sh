#!/bin/bash
cd /Volumes/PRO-G40/app-dev/willow-invt
mkdir -p scripts/logs

echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') sector-rotation start =====" >> scripts/logs/sector-rotation.log
npx tsx scripts/sector-rotation-fetch.ts --range=1mo >> scripts/logs/sector-rotation.log 2>&1
echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') sector-rotation done =====" >> scripts/logs/sector-rotation.log
