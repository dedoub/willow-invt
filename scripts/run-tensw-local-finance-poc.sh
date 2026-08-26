#!/bin/bash
set -uo pipefail

ROOT="/Volumes/PRO-G40/app-dev/willow-invt"
LOG_DIR="$HOME/logs/tensw-local-finance"
LOG_FILE="$LOG_DIR/launchd.log"
RUNTIME="$HOME/.willow/runtime/tensw-local-finance"

mkdir -p "$LOG_DIR" "$RUNTIME/scripts/lib" "$RUNTIME/node_modules" "$RUNTIME/bin"

# launchd가 외장 볼륨의 Node 소스를 직접 읽지 못하므로 작은 실행 런타임을 홈에 동기화해요.
cp "$ROOT/scripts/tensw-local-finance-poc.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/import-tensw-local-tax.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/match-finance-tax-obligations.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/woori-card-certificate-login.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/collect-woori-card-default-chrome.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/import-tensw-local-bank.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/import-finance-tax-obligations.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/import-tensw-local-card.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/select-abc-input-source.swift" "$RUNTIME/scripts/"
cp "$ROOT/scripts/ocr-region.swift" "$RUNTIME/scripts/"
cp "$ROOT/scripts/login-native-cert.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/login-nhis-si4n.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/collect-shinhan-bank.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/collect-wetax.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/collect-nhis.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/collect-hometax-national-tax.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/collect-woori-card-statement.mjs" "$RUNTIME/scripts/"
cp "$ROOT/scripts/lib/tensw-local-finance.mjs" "$RUNTIME/scripts/lib/"
cp "$ROOT/scripts/lib/daily-finance-sync.mjs" "$RUNTIME/scripts/lib/"
cp "$ROOT/scripts/lib/tax-obligation-matcher.mjs" "$RUNTIME/scripts/lib/"
cp "$ROOT/scripts/lib/woori-card-local.mjs" "$RUNTIME/scripts/lib/"
cp "$ROOT/scripts/lib/cert-dialog.mjs" "$RUNTIME/scripts/lib/"
cp "$ROOT/scripts/lib/cert-sites.mjs" "$RUNTIME/scripts/lib/"
cp "$ROOT/scripts/lib/desktop.mjs" "$RUNTIME/scripts/lib/"
cp "$ROOT/scripts/lib/shinhan-bank.mjs" "$RUNTIME/scripts/lib/"
cp "$ROOT/scripts/lib/wetax.mjs" "$RUNTIME/scripts/lib/"
cp "$ROOT/scripts/lib/nhis.mjs" "$RUNTIME/scripts/lib/"
cp "$ROOT/scripts/lib/hometax-session.mjs" "$RUNTIME/scripts/lib/"
cp "$ROOT/scripts/lib/hometax-national-tax.mjs" "$RUNTIME/scripts/lib/"
cp "$ROOT/scripts/lib/woori-card-statement.mjs" "$RUNTIME/scripts/lib/"
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

export CODEF_HOMETAX_CERT_DER="$(env_value CODEF_HOMETAX_CERT_DER)"
export CODEF_HOMETAX_CERT_KEY="$(env_value CODEF_HOMETAX_CERT_KEY)"
export NEXT_PUBLIC_SUPABASE_URL="$(env_value NEXT_PUBLIC_SUPABASE_URL)"
export SUPABASE_SECRET_KEY="$(env_value SUPABASE_SECRET_KEY)"
export FINANCE_INPUT_SOURCE_HELPER="$RUNTIME/bin/select-abc-input-source"
export FINANCE_OCR_HELPER="$RUNTIME/bin/ocr-region"

echo "$(date '+%Y-%m-%d %H:%M:%S') tensw local finance start" >> "$LOG_FILE"
if /opt/homebrew/bin/node "$RUNTIME/scripts/tensw-local-finance-poc.mjs" --collect >> "$LOG_FILE" 2>&1; then
  if /opt/homebrew/bin/node "$RUNTIME/scripts/import-tensw-local-tax.mjs" >> "$LOG_FILE" 2>&1 \
    && /opt/homebrew/bin/node "$RUNTIME/scripts/woori-card-certificate-login.mjs" >> "$LOG_FILE" 2>&1 \
    && /opt/homebrew/bin/node "$RUNTIME/scripts/collect-woori-card-default-chrome.mjs" >> "$LOG_FILE" 2>&1 \
    && /opt/homebrew/bin/node "$RUNTIME/scripts/collect-shinhan-bank.mjs" >> "$LOG_FILE" 2>&1 \
    && /opt/homebrew/bin/node "$RUNTIME/scripts/import-tensw-local-bank.mjs" >> "$LOG_FILE" 2>&1 \
    && /opt/homebrew/bin/node "$RUNTIME/scripts/collect-wetax.mjs" >> "$LOG_FILE" 2>&1 \
    && /opt/homebrew/bin/node "$RUNTIME/scripts/import-finance-tax-obligations.mjs" --company tensw --source wetax --input "$LOG_DIR/latest-wetax-obligations.json" >> "$LOG_FILE" 2>&1 \
    && /opt/homebrew/bin/node "$RUNTIME/scripts/collect-nhis.mjs" >> "$LOG_FILE" 2>&1 \
    && /opt/homebrew/bin/node "$RUNTIME/scripts/import-finance-tax-obligations.mjs" --company tensw --source nhis --input "$LOG_DIR/latest-nhis-obligations.json" >> "$LOG_FILE" 2>&1 \
    && /opt/homebrew/bin/node "$RUNTIME/scripts/collect-hometax-national-tax.mjs" >> "$LOG_FILE" 2>&1 \
    && /opt/homebrew/bin/node "$RUNTIME/scripts/import-finance-tax-obligations.mjs" --company tensw --source hometax --input "$LOG_DIR/latest-hometax-national-tax.json" >> "$LOG_FILE" 2>&1 \
    && /opt/homebrew/bin/node "$RUNTIME/scripts/collect-woori-card-statement.mjs" >> "$LOG_FILE" 2>&1 \
    && /opt/homebrew/bin/node "$RUNTIME/scripts/import-tensw-local-card.mjs" >> "$LOG_FILE" 2>&1 \
    && /opt/homebrew/bin/node "$RUNTIME/scripts/match-finance-tax-obligations.mjs" >> "$LOG_FILE" 2>&1; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') tensw local finance success" >> "$LOG_FILE"
    exit 0
  fi
  echo "$(date '+%Y-%m-%d %H:%M:%S') failed: import or payment matching" >> "$LOG_FILE"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') failed: local finance collection" >> "$LOG_FILE"
fi

BOT_TOKEN="$(env_value TELEGRAM_BOT_TOKEN)"
SUPABASE_URL="$(env_value NEXT_PUBLIC_SUPABASE_URL)"
SUPABASE_KEY="$(env_value SUPABASE_SECRET_KEY)"
CHAT_ID="$(curl -fsS "$SUPABASE_URL/rest/v1/telegram_conversations?bot_type=eq.ceo&select=chat_id&order=updated_at.desc&limit=1" \
  -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" | jq -r '.[0].chat_id // empty')"
if [ -n "$BOT_TOKEN" ] && [ -n "$CHAT_ID" ]; then
  curl -fsS "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
    --data-urlencode "chat_id=$CHAT_ID" \
    --data-urlencode "text=텐소프트웍스 로컬 재무 자동화가 실패했어요. 윌리가 수집·DB 적재·지급 매칭 로그를 확인해야 해요." \
    >/dev/null 2>&1 || true
fi
exit 1
