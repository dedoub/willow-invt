#!/bin/bash
# 급여명세서 예약발송 한 번. launchd 가 정한 시각에 불러 주고, 보낸 뒤 스스로 내려간다.
#
# Gmail API 에는 예약발송이 없다. 화면에서 걸어 둔 예약은 API 로 고칠 수도 없어서,
# 첨부를 바꾸려면 예약을 취소하고 새로 만들어야 한다(2026-09-22 에 그렇게 했다).
# 그래서 예약을 Gmail 에 맡기지 않고 여기서 건다 — 첨부는 업무위키 노트에서 그때 다시
# 읽으므로, 보내기 전까지 노트를 고치면 고친 것이 나간다.
#
#   scripts/tensw-payslip-schedule.sh 2026-09 2026-09-23
#
# 날짜가 맞지 않으면 아무것도 보내지 않는다. 다음 해 같은 날 다시 깨어나도 조용히 끝난다.
set -euo pipefail

MONTH="${1:?--month 꼴 2026-09 를 주세요}"
ON="${2:?보낼 날짜 2026-09-23 을 주세요}"
LABEL="com.tensw.payslip-send-${MONTH}"
ROOT="/Volumes/PRO-G40/app-dev/willow-invt"

today=$(date +%Y-%m-%d)
if [ "$today" != "$ON" ]; then
  # 날짜가 다르면 보내지 않고, 예약도 걷지 않는다. 맥이 꺼져 있어 늦게 깨어난 것일 수 있고,
  # 그때 예약까지 지우면 명세서가 영영 안 나간다. 지난 날짜면 사람이 봐야 한다.
  echo "[payslip-schedule] 오늘은 $today 이고 예약일은 $ON 이라 보내지 않습니다. 예약은 그대로 둡니다."
  exit 0
fi

echo "[payslip-schedule] $MONTH 급여명세서를 보냅니다 ($today)"
cd "$ROOT"
/opt/homebrew/bin/node scripts/tensw-payslip-send.mjs --month "$MONTH" --send

# 보낸 뒤에만 내려간다. 남겨 두면 내년 같은 날 다시 깨어나 같은 메일이 또 나간다.
plist="$HOME/Library/LaunchAgents/${LABEL}.plist"
if [ -f "$plist" ]; then
  rm -f "$plist"
  echo "[payslip-schedule] 예약을 걷었습니다 ($LABEL)"
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
fi
