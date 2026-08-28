#!/bin/bash
# 공인인증서 모듈이 남긴 창을 닫는다.
#
#   scripts/close-cert-dialogs.sh
#
# 한 단계가 인증서 창을 띄운 채로 죽으면 그 창이 화면 한복판에 남아 다음 단계를
# 막는다. Chrome 을 내렸다 올려도 이 창들은 Chrome 것이 아니라 별도 모듈 프로세스
# (INISAFECrossWebEXSvc·AnySign·bizapp 등) 것이라 그대로 살아 있다. 실제로
# 2026-08-29 에 신한은행 인증서선택 창이 남아 CEO 재실행을 막았다.
#
# 안전 규칙 하나: 인증서 창에서는 절대 "확인"을 누르지 않는다. 확인은 제출이고,
# 제출은 인증서 5회 오류 카운터를 태운다. 취소가 있으면 취소만 누른다. 확인밖에
# 없는 창은 이미 뜬 오류 알림이라 눌러서 치우는 게 맞다.
set -uo pipefail

CERT_PROCESSES=(
  INISAFECrossWebEXSvc bizapp AnySign AnySign4PC "AnySign.ex"
  delfino veraport nProtect CrossEXService TouchEn
)
CANCEL_LABELS=(취소 취소하기 닫기 Cancel Close)
DISMISS_LABELS=(확인 OK)

closed=0
for process in "${CERT_PROCESSES[@]}"; do
  # 창 이름을 먼저 받아 둔다. 닫는 동안 목록이 바뀌므로 이름으로 하나씩 다룬다.
  names="$(/usr/bin/osascript -e "tell application \"System Events\"
    if not (exists process \"$process\") then return \"\"
    tell process \"$process\"
      set out to \"\"
      repeat with w in windows
        set out to out & (name of w) & linefeed
      end repeat
      return out
    end tell
  end tell" 2>/dev/null)"
  [ -z "$names" ] && continue

  while IFS= read -r name; do
    [ -z "$name" ] && continue
    acted=""
    for label in "${CANCEL_LABELS[@]}"; do
      if /usr/bin/osascript -e "tell application \"System Events\" to tell process \"$process\"
        click button \"$label\" of window \"$name\"
      end tell" >/dev/null 2>&1; then acted="$label"; break; fi
    done
    # 취소가 없으면 오류 알림으로 보고 확인을 눌러 치운다.
    if [ -z "$acted" ]; then
      for label in "${DISMISS_LABELS[@]}"; do
        if /usr/bin/osascript -e "tell application \"System Events\" to tell process \"$process\"
          set w to window \"$name\"
          if (count of buttons of w) is 1 then
            click button \"$label\" of w
          else
            error \"단추가 여럿이라 누르지 않았어요\"
          end if
        end tell" >/dev/null 2>&1; then acted="$label"; break; fi
      done
    fi
    if [ -n "$acted" ]; then
      echo "[cert-cleanup] $process \"$name\" — $acted"
      closed=$((closed + 1))
      sleep 1
    else
      echo "[cert-cleanup] $process \"$name\" — 닫지 못했어요"
    fi
  done <<< "$names"
done

[ "$closed" -gt 0 ] && echo "[cert-cleanup] 인증서 창 ${closed}개를 닫았어요."
exit 0
