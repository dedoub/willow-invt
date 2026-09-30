#!/bin/bash
# launchd(com.willow.mgmt-agent) 가 drive-launcher 를 거쳐 30분마다 부른다. 평일 07~20시만 돈다.
# 설치: mkdir -p ~/logs/mgmt-agent && cp scripts/com.willow.mgmt-agent.plist ~/Library/LaunchAgents/ \
#   && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.willow.mgmt-agent.plist
cd /Volumes/PRO-G40/app-dev/willow-invt || exit 1
DOW=$(date +%u); H=$((10#$(date +%H)))
[ "$DOW" -ge 6 ] && exit 0                         # 주말 쉼
{ [ "$H" -lt 7 ] || [ "$H" -gt 20 ]; } && exit 0   # 07~20시만
exec /opt/homebrew/bin/node scripts/mgmt-agent.mjs $MGMT_ARGS
