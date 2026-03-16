#!/bin/bash
cd /Volumes/PRO-G40/app-dev/willow-invt
mkdir -p scripts/logs

npx tsx scripts/gmail-auto-label.ts >> scripts/logs/gmail-auto-label.log 2>&1
