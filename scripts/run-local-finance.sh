#!/bin/bash
# Daily local finance collection for one company.
#
#   scripts/run-local-finance.sh tensw
#   scripts/run-local-finance.sh willow
#
# 하루 수집은 두 턴으로 갈라져 있다(04시 은행·카드·지방세·4대보험, 07시 홈택스).
# 요약 알림은 앞 턴에서 --defer-notify 로 미뤘다가 뒤 턴의 --notify 에서 한 통으로
# 나간다. 손으로 돌릴 때는 두 플래그 없이 쓰면 그 자리에서 알린다.
#
# 텐소프트웍스: 홈택스 · 우리은행 · 신한은행 · 우리카드 · 위택스 · 4대보험
# 윌로우인베스트먼트: 홈택스 · 신한은행 · KB카드 · 위택스 · 4대보험
set -uo pipefail

COMPANY="${1:-tensw}"
case "$COMPANY" in
  tensw) COMPANY_LABEL="텐소프트웍스" ;;
  willow) COMPANY_LABEL="윌로우인베스트먼트" ;;
  *) echo "알 수 없는 회사예요: $COMPANY" >&2; exit 2 ;;
esac

ROOT="/Volumes/PRO-G40/app-dev/willow-invt"
LOG_DIR="$HOME/logs/$COMPANY-local-finance"
LOG_FILE="$LOG_DIR/launchd.log"
RUNTIME="$HOME/.willow/runtime/$COMPANY-local-finance"
NODE=/opt/homebrew/bin/node

mkdir -p "$LOG_DIR" "$RUNTIME/scripts/lib" "$RUNTIME/node_modules" "$RUNTIME/bin"

# launchd가 외장 볼륨의 Node 소스를 직접 읽지 못하므로 작은 실행 런타임을 홈에 동기화해요.
for script in \
  collect-hometax-tax-invoices.mjs \
  collect-hometax-national-tax.mjs \
  collect-shinhan-bank.mjs \
  collect-woori-bank.mjs \
  collect-wetax.mjs \
  collect-nhis.mjs \
  collect-woori-card-default-chrome.mjs \
  collect-woori-card-statement.mjs \
  collect-kb-card.mjs \
  collect-kb-card-statement.mjs \
  import-local-bank.mjs \
  import-local-card.mjs \
  import-local-tax-invoices.mjs \
  import-finance-tax-obligations.mjs \
  match-finance-tax-obligations.mjs \
  sync-akros-invoices.mjs \
  notify-local-finance.mjs \
  login-native-cert.mjs \
  login-nhis-si4n.mjs \
  woori-card-certificate-login.mjs \
  login-kb-card.mjs \
  select-abc-input-source.swift \
  ocr-region.swift
do
  [ -f "$ROOT/scripts/$script" ] && cp "$ROOT/scripts/$script" "$RUNTIME/scripts/"
done

for lib in \
  tensw-local-finance.mjs daily-finance-sync.mjs tax-obligation-matcher.mjs \
  woori-card-local.mjs woori-card-statement.mjs \
  kb-card-local.mjs kb-card-statement.mjs kb-card-keypad.mjs \
  finance-session.mjs finance-notify.mjs akros-invoice-sync.mjs \
  cert-dialog.mjs cert-sites.mjs cert-attempt-lock.mjs desktop.mjs \
  shinhan-bank.mjs wetax.mjs nhis.mjs secure-keypad.mjs \
  hometax-session.mjs hometax-national-tax.mjs
do
  [ -f "$ROOT/scripts/lib/$lib" ] && cp "$ROOT/scripts/lib/$lib" "$RUNTIME/scripts/lib/"
done

# sharp 는 보안키패드 스크린샷을 읽는다. detect-libc·semver 는 sharp 가 부르는 것들이라
# 함께 옮기지 않으면 런타임에서만 MODULE_NOT_FOUND 로 넘어진다.
for package in playwright playwright-core dotenv tslib ws iceberg-js sharp @img detect-libc semver; do
  if [ ! -d "$RUNTIME/node_modules/$package" ]; then
    cp -R "$ROOT/node_modules/$package" "$RUNTIME/node_modules/"
  fi
done
rm -rf "$RUNTIME/node_modules/@supabase"
cp -R "$ROOT/node_modules/@supabase" "$RUNTIME/node_modules/"

if [ ! -x "$RUNTIME/bin/select-abc-input-source" ] \
  || [ "$RUNTIME/scripts/select-abc-input-source.swift" -nt "$RUNTIME/bin/select-abc-input-source" ]; then
  /usr/bin/xcrun swiftc \
    "$RUNTIME/scripts/select-abc-input-source.swift" \
    -o "$RUNTIME/bin/select-abc-input-source"
fi

if [ ! -x "$RUNTIME/bin/ocr-region" ] \
  || [ "$RUNTIME/scripts/ocr-region.swift" -nt "$RUNTIME/bin/ocr-region" ]; then
  /usr/bin/xcrun swiftc -O \
    "$RUNTIME/scripts/ocr-region.swift" \
    -o "$RUNTIME/bin/ocr-region"
fi

env_value() {
  local key="$1" line value
  line="$(grep -E "^${key}=" "$ROOT/.env.local" | tail -1)"
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" ]] || [[ "$value" == \'*\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

export FINANCE_COMPANY="$COMPANY"
export CODEF_HOMETAX_CERT_DER="$(env_value CODEF_HOMETAX_CERT_DER)"
export CODEF_HOMETAX_CERT_KEY="$(env_value CODEF_HOMETAX_CERT_KEY)"
export NEXT_PUBLIC_SUPABASE_URL="$(env_value NEXT_PUBLIC_SUPABASE_URL)"
export SUPABASE_SECRET_KEY="$(env_value SUPABASE_SECRET_KEY)"
export FINANCE_INPUT_SOURCE_HELPER="$RUNTIME/bin/select-abc-input-source"
export FINANCE_OCR_HELPER="$RUNTIME/bin/ocr-region"

# 실패 알림에 어느 단계에서 멈췄는지 담으려고 마지막 단계 이름을 남긴다.
STEP_FILE="$RUNTIME/last-step"
FAILED_STEPS=""
run_step() {
  local name="$1"; shift
  printf '%s' "$name" > "$STEP_FILE"
  echo "$(date '+%Y-%m-%d %H:%M:%S') [$COMPANY] $name" >> "$LOG_FILE"
  "$@" >> "$LOG_FILE" 2>&1
}

# 수집 단계는 매번 Chrome 을 내렸다 올리고 시작한다. 한 화면이 남긴 상태가
# 다음 화면을 막는 일이 잦았다 — 위택스는 살아 있는 세션 위에 다시 로그인하려다
# 인증서 창을 못 띄웠고, KB카드는 이어받은 세션에서 승인내역 화면이 열리지 않았다.
# 세션 쿠키까지 함께 사라지므로 매 단계가 같은 자리에서 출발한다.
restart_chrome() {
  /usr/bin/osascript -e 'tell application "Google Chrome" to quit' >/dev/null 2>&1
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    /usr/bin/pgrep -x 'Google Chrome' >/dev/null || break
    sleep 1
  done
  # 정상 종료를 기다렸는데도 남아 있으면 내린다. 남은 창이 다음 단계를 막는다.
  /usr/bin/pgrep -x 'Google Chrome' >/dev/null && /usr/bin/pkill -x 'Google Chrome'
  sleep 2
  /usr/bin/open -a 'Google Chrome'
  sleep 6
}

# 브라우저를 쓰는 단계. DB 만 만지는 적재·분류는 run_step 그대로 둔다.
run_browser_step() {
  restart_chrome
  run_step "$@"
}

# 한 묶음이 막혀도 나머지 묶음은 계속 돈다. 카드 인증서 하나가 거부되면 위택스·
# 4대보험·자동 분류까지 통째로 건너뛰던 구조라, 하루치 재무가 통째로 비었다.
# 묶음 안에서는 앞 단계 산출물을 뒤가 쓰므로 여전히 && 로 묶는다.
group() {
  local name="$1"; shift
  if "$@"; then return 0; fi
  local stopped
  stopped="$(cat "$STEP_FILE" 2>/dev/null)"
  [ -n "$stopped" ] || stopped="$name"
  FAILED_STEPS="${FAILED_STEPS:+$FAILED_STEPS, }$stopped"
  echo "$(date '+%Y-%m-%d %H:%M:%S') [$COMPANY] $stopped 실패, 다음 묶음으로 계속" >> "$LOG_FILE"
  return 1
}

# 국세·지방세·4대보험은 회사 공통 원장으로 들어가므로 --company 로 구분한다.
# 세 곳은 서로 다른 사이트라 하나가 막혀도 나머지는 받을 수 있다.
collect_wetax() {
  run_browser_step "위택스 수집" $NODE "$RUNTIME/scripts/collect-wetax.mjs" \
    && run_step "지방세 적재" $NODE "$RUNTIME/scripts/import-finance-tax-obligations.mjs" \
        --company "$COMPANY" --source wetax --input "$LOG_DIR/latest-wetax-obligations.json"
}

collect_nhis() {
  run_browser_step "4대보험 수집" $NODE "$RUNTIME/scripts/collect-nhis.mjs" \
    && run_step "4대보험 적재" $NODE "$RUNTIME/scripts/import-finance-tax-obligations.mjs" \
        --company "$COMPANY" --source nhis --input "$LOG_DIR/latest-nhis-obligations.json"
}

collect_national_tax() {
  run_browser_step "국세 수집" $NODE "$RUNTIME/scripts/collect-hometax-national-tax.mjs" \
    && run_step "국세 적재" $NODE "$RUNTIME/scripts/import-finance-tax-obligations.mjs" \
        --company "$COMPANY" --source hometax --input "$LOG_DIR/latest-hometax-national-tax.json"
}

# 홈택스는 여기 없다. 23:30~06:59 사이 서비스를 닫아 새벽 배치에서는 납부할세액이
# 블록페이지로 오고 세금계산서 화면도 뜨다 말다 했다(08-29 04:00 타임아웃). 그래서
# 국세와 세금계산서를 통째로 07시 잡(com.willow.*-hometax)으로 넘겼다.
# 계산서를 뒤가 쓰는 매칭·분류·수금 대사·아크로스 반영도 같은 잡에 붙어 있다.
collect_shared_taxes() {
  group "위택스" collect_wetax
  group "4대보험" collect_nhis
}

tensw_tax_invoices() {
  run_browser_step "홈택스 세금계산서 수집" $NODE "$RUNTIME/scripts/collect-hometax-tax-invoices.mjs" --collect \
    && run_step "세금계산서 적재" $NODE "$RUNTIME/scripts/import-local-tax-invoices.mjs" --company tensw
}

# 카드는 로그인 세션 하나로 승인내역과 명세서를 함께 가져온다. 그래서 Chrome 은
# 로그인 앞에서만 내렸다 올린다 — 사이에서 껐다 켜면 방금 받은 세션이 사라져
# 뒤 단계가 아예 돌 수 없다.
tensw_card() {
  run_browser_step "우리카드 로그인" $NODE "$RUNTIME/scripts/woori-card-certificate-login.mjs" \
    && run_step "우리카드 승인내역 수집" $NODE "$RUNTIME/scripts/collect-woori-card-default-chrome.mjs" \
    && run_step "우리카드 명세서 수집" $NODE "$RUNTIME/scripts/collect-woori-card-statement.mjs" \
    && run_step "카드 적재" $NODE "$RUNTIME/scripts/import-local-card.mjs" --company tensw
}

# 우리은행은 수집만 하고 적재는 신한 묶음에 맡긴다. 적재기가 두 은행 파일을 함께
# 읽으므로, 여기서 막혀도 신한은 제 시각에 들어가야 한다.
tensw_woori_bank() {
  run_browser_step "우리은행 수집" $NODE "$RUNTIME/scripts/collect-woori-bank.mjs"
}

tensw_bank() {
  run_browser_step "신한은행 수집" $NODE "$RUNTIME/scripts/collect-shinhan-bank.mjs" \
    && run_step "은행 적재" $NODE "$RUNTIME/scripts/import-local-bank.mjs" --company tensw
}

run_tensw() {
  group "우리카드" tensw_card
  group "우리은행" tensw_woori_bank
  group "신한은행" tensw_bank
  collect_shared_taxes
  group "세금 지급 매칭" run_step "세금 지급 매칭" \
    $NODE "$RUNTIME/scripts/match-finance-tax-obligations.mjs"
  group "자동 분류" run_step "자동 분류" npx tsx "$ROOT/scripts/local-finance-classify.ts" --company tensw
}

willow_tax_invoices() {
  run_browser_step "홈택스 세금계산서 수집" $NODE "$RUNTIME/scripts/collect-hometax-tax-invoices.mjs" --collect \
    && run_step "세금계산서 적재" $NODE "$RUNTIME/scripts/import-local-tax-invoices.mjs" --company willow
}

willow_bank() {
  run_browser_step "신한은행 수집" $NODE "$RUNTIME/scripts/collect-shinhan-bank.mjs" \
    && run_step "은행 적재" $NODE "$RUNTIME/scripts/import-local-bank.mjs" --company willow
}

# 승인내역 수집기가 로그인까지 하고, 명세서는 그 세션을 이어 쓴다.
willow_card() {
  run_browser_step "KB카드 승인내역 수집" $NODE "$RUNTIME/scripts/collect-kb-card.mjs" \
    && run_step "KB카드 명세서 수집" $NODE "$RUNTIME/scripts/collect-kb-card-statement.mjs" \
    && run_step "카드 적재" $NODE "$RUNTIME/scripts/import-local-card.mjs" --company willow
}

run_willow() {
  group "신한은행" willow_bank
  group "KB카드" willow_card
  collect_shared_taxes
  group "세금 지급 매칭" run_step "세금 지급 매칭" \
    $NODE "$RUNTIME/scripts/match-finance-tax-obligations.mjs"
  group "자동 분류" run_step "자동 분류" npx tsx "$ROOT/scripts/local-finance-classify.ts" --company willow
}

# --only <묶음[,묶음...]>: 지정한 묶음만 돈다. 홈택스처럼 다른 시각에 도는 잡이 쓰고,
# 새벽에 막힌 묶음을 사람이 그날 안에 다시 돌릴 때도 쓴다.
#
#   scripts/run-local-finance.sh tensw --only tax-invoices,national-tax,match
#   scripts/run-local-finance.sh tensw --only woori-bank,bank
run_only() {
  local requested name
  IFS=',' read -r -a requested <<< "$1"
  for name in "${requested[@]}"; do
    case "$name" in
      tax-invoices)
        if [ "$COMPANY" = tensw ]; then group "세금계산서" tensw_tax_invoices
        else group "세금계산서" willow_tax_invoices; fi ;;
      bank)
        if [ "$COMPANY" = tensw ]; then group "신한은행" tensw_bank
        else group "신한은행" willow_bank; fi ;;
      woori-bank) group "우리은행" tensw_woori_bank ;;
      card)
        if [ "$COMPANY" = tensw ]; then group "우리카드" tensw_card
        else group "KB카드" willow_card; fi ;;
      wetax) group "위택스" collect_wetax ;;
      nhis) group "4대보험" collect_nhis ;;
      national-tax) group "국세" collect_national_tax ;;
      match) group "세금 지급 매칭" run_step "세금 지급 매칭" \
        $NODE "$RUNTIME/scripts/match-finance-tax-obligations.mjs" ;;
      classify) group "자동 분류" run_step "자동 분류" \
        npx tsx "$ROOT/scripts/local-finance-classify.ts" --company "$COMPANY" ;;
      reconcile) group "수금 대사" run_step "수금 대사" \
        npx tsx "$ROOT/scripts/tensw-reconcile-payments.ts" ;;
      akros) group "아크로스 인보이스 반영" run_step "아크로스 인보이스 반영" \
        $NODE "$RUNTIME/scripts/sync-akros-invoices.mjs" ;;
      *)
        echo "$(date '+%Y-%m-%d %H:%M:%S') [$COMPANY] 알 수 없는 묶음이에요: $name" >> "$LOG_FILE"
        FAILED_STEPS="${FAILED_STEPS:+$FAILED_STEPS, }알 수 없는 묶음 $name" ;;
    esac
  done
}

ONLY=""
[ "${2:-}" = "--only" ] && ONLY="${3:-}"
if [ "${2:-}" = "--only" ] && [ -z "$ONLY" ]; then
  echo "--only 뒤에 돌릴 묶음을 적어 주세요." >&2
  exit 2
fi

# 하루치 요약은 한 통이면 된다. 수집이 04시·07시 두 턴으로 갈라져 있으므로 앞 턴은
# --defer-notify 로 조용히 끝내고, 홈택스까지 받은 뒤 턴이 --notify 로 몰아 보낸다.
# 사람이 손으로 돌리는 실행은 둘 다 없이 지금까지처럼 그 자리에서 알린다.
DEFER_NOTIFY=0
NOTIFY_NOW=0
for arg in "$@"; do
  case "$arg" in
    --defer-notify) DEFER_NOTIFY=1 ;;
    --notify) NOTIFY_NOW=1 ;;
  esac
done

# --sync-only: 런타임 동기화까지만 하고 수집은 돌리지 않는다. 스크립트가 빠졌는지
# 새벽까지 기다리지 않고 확인하려고 둔다.
if [ "${2:-}" = "--sync-only" ]; then
  missing=0
  for required in \
    "$RUNTIME/scripts/collect-hometax-tax-invoices.mjs" \
    "$RUNTIME/scripts/import-local-bank.mjs" \
    "$RUNTIME/scripts/lib/tensw-local-finance.mjs" \
    "$RUNTIME/scripts/lib/finance-session.mjs"
  do
    [ -f "$required" ] || { echo "빠짐: $required" >&2; missing=1; }
  done
  if [ "$COMPANY" = "willow" ]; then
    for required in \
      "$RUNTIME/scripts/login-kb-card.mjs" \
      "$RUNTIME/scripts/collect-kb-card.mjs" \
      "$RUNTIME/scripts/collect-kb-card-statement.mjs" \
      "$RUNTIME/scripts/lib/kb-card-keypad.mjs" \
      "$RUNTIME/scripts/lib/kb-card-local.mjs" \
      "$RUNTIME/scripts/lib/kb-card-statement.mjs" \
      "$RUNTIME/scripts/sync-akros-invoices.mjs" \
      "$RUNTIME/scripts/lib/akros-invoice-sync.mjs"
    do
      [ -f "$required" ] || { echo "빠짐: $required" >&2; missing=1; }
    done
  fi
  # import 는 DB를 건드리지 않는 dry 로만 확인한다.
  $NODE "$RUNTIME/scripts/import-local-bank.mjs" --company "$COMPANY" --dry || missing=1
  [ $missing -eq 0 ] && echo "$COMPANY 런타임 동기화 정상" || exit 1
  exit 0
fi

export TELEGRAM_BOT_TOKEN="$(env_value TELEGRAM_BOT_TOKEN)"

echo "$(date '+%Y-%m-%d %H:%M:%S') $COMPANY local finance start${ONLY:+ (only: $ONLY)}" >> "$LOG_FILE"
rm -f "$STEP_FILE"
if [ -n "$ONLY" ]; then run_only "$ONLY"
elif [ "$COMPANY" = "tensw" ]; then run_tensw
else run_willow; fi

if [ -z "$FAILED_STEPS" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') $COMPANY local finance success${ONLY:+ (only: $ONLY)}" >> "$LOG_FILE"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') $COMPANY local finance failed: $FAILED_STEPS" >> "$LOG_FILE"
fi

# 앞 턴이 막힌 묶음을 적어 두는 곳. 뒤 턴이 이걸 읽어 한 통에 합치고 지운다.
PENDING_FILE="$RUNTIME/pending-failures"

# 앞 턴(04시)은 여기서 끝난다. 실패해도 그 자리에서 알리지 않는다 — 3시간 뒤
# 하루치 한 통에 실려 나간다. 어느 턴이 막혔는지 알 수 있게 시각을 함께 적는다.
if [ "$DEFER_NOTIFY" = 1 ]; then
  [ -n "$FAILED_STEPS" ] && printf '%s %s\n' "$(date '+%H시')" "$FAILED_STEPS" >> "$PENDING_FILE"
  [ -n "$FAILED_STEPS" ] && exit 1
  exit 0
fi

# 성공이든 실패든 CEO 봇으로 알린다. 조용히 실패하면 며칠이 지나도 모른다.
# 한 묶음이 막혀도 나머지는 도니, 실패한 묶음을 모아서 알린다.
CARRIED=""
if [ "$NOTIFY_NOW" = 1 ] && [ -s "$PENDING_FILE" ]; then
  CARRIED="$(awk 'NR>1{printf ", "}{printf "%s", $0}' "$PENDING_FILE")"
fi
ALL_FAILED="$CARRIED"
[ -n "$FAILED_STEPS" ] && ALL_FAILED="${ALL_FAILED:+$ALL_FAILED, }$FAILED_STEPS"

if [ -z "$ALL_FAILED" ]; then
  # 묶음 하나만 돈 실행은 일일 요약을 다시 보내지 않는다. 사람이 손으로 되돌린
  # 실행마다 같은 요약이 한 번 더 가면 정작 실패 알림이 묻힌다. 하루치 한 통은
  # --notify 를 단 턴만 맡는다.
  if [ -n "$ONLY" ] && [ "$NOTIFY_NOW" != 1 ]; then exit 0; fi
  $NODE "$RUNTIME/scripts/notify-local-finance.mjs" --company "$COMPANY" --status ok >> "$LOG_FILE" 2>&1
  [ "$NOTIFY_NOW" = 1 ] && rm -f "$PENDING_FILE"
  exit 0
fi

$NODE "$RUNTIME/scripts/notify-local-finance.mjs" \
  --company "$COMPANY" --status fail --step "$ALL_FAILED" >> "$LOG_FILE" 2>&1
[ "$NOTIFY_NOW" = 1 ] && rm -f "$PENDING_FILE"
exit 1
