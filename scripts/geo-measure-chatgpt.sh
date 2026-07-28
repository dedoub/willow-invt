#!/bin/bash
# 주간 GEO 측정 — ChatGPT 엔진.
#
# Gemini는 Vercel 크론이 돌리지만(HTTP 호출), ChatGPT는 CEO 봇의 구독 로그인을
# codex CLI로 빌려 쓰는 구조라 이 맥에서만 돌 수 있다. 그래서 이것만 launchd다.
# 정본 설명: docs/geo-operations.md
#
# 한 사이트 30문항에 40~50분 걸린다. 두 사이트면 1시간 반이다. 회차를 늘리기 전에
# CEO 봇 구독 사용량에 여유가 있는지 먼저 볼 것 — 한도를 먹으면 봇이 같이 멈춘다.

set -u
cd /Volumes/PRO-G40/app-dev/willow-invt || exit 1

RUN_NO="${1:-1}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] GEO chatgpt 측정 시작 (run=$RUN_NO)"

for site in voicecards reviewnotes; do
  echo "[$(date '+%H:%M:%S')] $site"
  # 한 사이트가 실패해도 다음 사이트는 돌린다.
  node scripts/geo-measure.mjs "$site" chatgpt "$RUN_NO" || echo "  $site 실패 (계속)"
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] GEO chatgpt 측정 종료"
