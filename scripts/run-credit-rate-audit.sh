#!/bin/bash
# 크레딧 요율 주간 점검 (launchd 전용)
#
# 두 앱의 AI 요율이 실측 원가 대비 마진 80~90% 안에 있는지 보고 텔레그램으로 보낸다.
# 판정 규칙은 `.claude/skills/credit-rate-audit/SKILL.md` 와 같다 — 사람이 부를
# 때는 그 스킬이, 주 1회는 이 스크립트가 같은 답을 낸다.
set -euo pipefail

PROJECT_DIR="/Volumes/PRO-G40/app-dev/willow-invt"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# 외장 드라이브가 없으면 조용히 끝낸다 — drive-launcher 가 이미 기다렸는데도
# 없다면 오늘은 볼 수 없는 것이고, 그건 실패로 시끄럽게 할 일이 아니다.
[ -d "$PROJECT_DIR" ] || exit 0
[ -f "$PROJECT_DIR/.env.local" ] || exit 0

cd "$PROJECT_DIR"
# <b>`npx tsx` 로 부른다.</b> `node` 를 직접 부르면 launchd 아래에서 외장 디스크의
# 파일을 열지 못해 `EPERM` 으로 죽는다 — 같은 자리에서 도는 SEO 디스패치가
# `npx tsx` 를 쓰고 있어 그 형태를 그대로 따랐다.
exec npx tsx scripts/credit-rate-audit.mjs
