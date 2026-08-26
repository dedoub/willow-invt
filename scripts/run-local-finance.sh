#!/bin/bash
# Daily local finance collection for one company.
#
#   scripts/run-local-finance.sh tensw
#   scripts/run-local-finance.sh willow
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
  cert-dialog.mjs cert-sites.mjs desktop.mjs \
  shinhan-bank.mjs wetax.mjs nhis.mjs \
  hometax-session.mjs hometax-national-tax.mjs
do
  [ -f "$ROOT/scripts/lib/$lib" ] && cp "$ROOT/scripts/lib/$lib" "$RUNTIME/scripts/lib/"
done

for package in playwright playwright-core dotenv tslib ws iceberg-js; do
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
run_step() {
  local name="$1"; shift
  printf '%s' "$name" > "$STEP_FILE"
  echo "$(date '+%Y-%m-%d %H:%M:%S') [$COMPANY] $name" >> "$LOG_FILE"
  "$@" >> "$LOG_FILE" 2>&1
}

# 국세·지방세·4대보험은 회사 공통 원장으로 들어가므로 --company 로 구분한다.
collect_shared_taxes() {
  run_step "위택스 수집" $NODE "$RUNTIME/scripts/collect-wetax.mjs" \
    && run_step "지방세 적재" $NODE "$RUNTIME/scripts/import-finance-tax-obligations.mjs" \
        --company "$COMPANY" --source wetax --input "$LOG_DIR/latest-wetax-obligations.json" \
    && run_step "4대보험 수집" $NODE "$RUNTIME/scripts/collect-nhis.mjs" \
    && run_step "4대보험 적재" $NODE "$RUNTIME/scripts/import-finance-tax-obligations.mjs" \
        --company "$COMPANY" --source nhis --input "$LOG_DIR/latest-nhis-obligations.json" \
    && run_step "국세 수집" $NODE "$RUNTIME/scripts/collect-hometax-national-tax.mjs" \
    && run_step "국세 적재" $NODE "$RUNTIME/scripts/import-finance-tax-obligations.mjs" \
        --company "$COMPANY" --source hometax --input "$LOG_DIR/latest-hometax-national-tax.json"
}

run_tensw() {
  run_step "홈택스 세금계산서 수집" $NODE "$RUNTIME/scripts/collect-hometax-tax-invoices.mjs" --collect \
    && run_step "세금계산서 적재" $NODE "$RUNTIME/scripts/import-local-tax-invoices.mjs" --company tensw \
    && run_step "우리카드 로그인" $NODE "$RUNTIME/scripts/woori-card-certificate-login.mjs" \
    && run_step "우리카드 승인내역 수집" $NODE "$RUNTIME/scripts/collect-woori-card-default-chrome.mjs" \
    && run_step "신한은행 수집" $NODE "$RUNTIME/scripts/collect-shinhan-bank.mjs" \
    && run_step "은행 적재" $NODE "$RUNTIME/scripts/import-local-bank.mjs" --company tensw \
    && collect_shared_taxes \
    && run_step "우리카드 명세서 수집" $NODE "$RUNTIME/scripts/collect-woori-card-statement.mjs" \
    && run_step "카드 적재" $NODE "$RUNTIME/scripts/import-local-card.mjs" --company tensw \
    && run_step "세금 지급 매칭" $NODE "$RUNTIME/scripts/match-finance-tax-obligations.mjs" \
    && run_step "자동 분류" npx tsx "$ROOT/scripts/local-finance-classify.ts" --company tensw \
    && run_step "수금 대사" npx tsx "$ROOT/scripts/tensw-reconcile-payments.ts"
}

run_willow() {
  run_step "홈택스 세금계산서 수집" $NODE "$RUNTIME/scripts/collect-hometax-tax-invoices.mjs" --collect \
    && run_step "세금계산서 적재" $NODE "$RUNTIME/scripts/import-local-tax-invoices.mjs" --company willow \
    && run_step "신한은행 수집" $NODE "$RUNTIME/scripts/collect-shinhan-bank.mjs" \
    && run_step "은행 적재" $NODE "$RUNTIME/scripts/import-local-bank.mjs" --company willow \
    && run_step "KB카드 승인내역 수집" $NODE "$RUNTIME/scripts/collect-kb-card.mjs" \
    && run_step "KB카드 명세서 수집" $NODE "$RUNTIME/scripts/collect-kb-card-statement.mjs" \
    && run_step "카드 적재" $NODE "$RUNTIME/scripts/import-local-card.mjs" --company willow \
    && collect_shared_taxes \
    && run_step "세금 지급 매칭" $NODE "$RUNTIME/scripts/match-finance-tax-obligations.mjs" \
    && run_step "자동 분류" npx tsx "$ROOT/scripts/local-finance-classify.ts" --company willow \
    && run_step "아크로스 인보이스 반영" $NODE "$RUNTIME/scripts/sync-akros-invoices.mjs"
}

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

echo "$(date '+%Y-%m-%d %H:%M:%S') $COMPANY local finance start" >> "$LOG_FILE"
rm -f "$STEP_FILE"
if [ "$COMPANY" = "tensw" ]; then run_tensw; else run_willow; fi
STATUS=$?

# 성공이든 실패든 CEO 봇으로 알린다. 조용히 실패하면 며칠이 지나도 모른다.
if [ $STATUS -eq 0 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') $COMPANY local finance success" >> "$LOG_FILE"
  $NODE "$RUNTIME/scripts/notify-local-finance.mjs" --company "$COMPANY" --status ok >> "$LOG_FILE" 2>&1
  exit 0
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') $COMPANY local finance failed" >> "$LOG_FILE"
$NODE "$RUNTIME/scripts/notify-local-finance.mjs" \
  --company "$COMPANY" --status fail --step "$(cat "$STEP_FILE" 2>/dev/null)" >> "$LOG_FILE" 2>&1
exit 1
