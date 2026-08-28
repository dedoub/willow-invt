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
#   scripts/run-local-finance.sh tensw --retry
#
# --retry 는 아직 막혀 있는 묶음만 다시 돈다. 인증서 거부·보안키패드·사이트 점검처럼
# 다시 하면 되는 실패가 대부분이라 그대로 두면 하루가 빈다. 돌릴 게 없으면 화면도
# 건드리지 않고 곧장 끝나므로, 멀쩡한 날에는 있는 줄도 모른다.
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
  close-cert-dialogs.mjs \
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
  hometax-session.mjs hometax-national-tax.mjs cert-cleanup.mjs
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
# 인증서 모듈 창은 Chrome 것이 아니라 별도 프로세스 것이라, Chrome 을 내렸다 올려도
# 화면에 그대로 남아 다음 단계를 막는다. 08-29 에 신한은행 인증서선택 창이 남아
# 재실행 자체를 막았다. 확인은 절대 누르지 않는다 — 확인은 제출이고 제출은 인증서
# 오류 횟수를 태운다(자세한 규칙은 close-cert-dialogs.mjs).
close_cert_dialogs() {
  $NODE "$RUNTIME/scripts/close-cert-dialogs.mjs" >> "$LOG_FILE" 2>&1
}

restart_chrome() {
  close_cert_dialogs
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
#
# 첫 인자는 --only 가 받는 묶음 키다. 사람에게 보이는 이름("우리카드")과 다시 부를
# 때 쓰는 키("card")가 달라서, 실패한 것을 모아 재실행하려면 키를 함께 들고 있어야
# 한다. ATTEMPTED_BUNDLES 는 이번 실행이 손댄 묶음이다 — 재실행 목록에서 무엇을
# 지워도 되는지 가리는 데 쓴다(안 돌린 묶음의 실패는 남겨야 하므로).
ATTEMPTED_BUNDLES=""
FAILED_BUNDLES=""
group() {
  local bundle="$1" name="$2"; shift 2
  ATTEMPTED_BUNDLES="${ATTEMPTED_BUNDLES:+$ATTEMPTED_BUNDLES }$bundle"
  if "$@"; then return 0; fi
  local stopped
  stopped="$(cat "$STEP_FILE" 2>/dev/null)"
  [ -n "$stopped" ] || stopped="$name"
  FAILED_STEPS="${FAILED_STEPS:+$FAILED_STEPS, }$stopped"
  FAILED_BUNDLES="${FAILED_BUNDLES:+$FAILED_BUNDLES }$bundle"
  echo "$(date '+%Y-%m-%d %H:%M:%S') [$COMPANY] $stopped 실패, 다음 묶음으로 계속" >> "$LOG_FILE"
  # 막힌 자리에 인증서 창이 남아 있으면 다음 묶음이 그 창에 대고 클릭한다. 실제로
  # 우리카드가 커밋에 실패한 뒤 남은 창 때문에 그 다음 단계가 탭조차 열지 못했다.
  # 화면을 깨끗이 되돌리고 넘어간다.
  close_cert_dialogs
  return 1
}

# 두 회사가 같은 Chrome 과 같은 포인터를 쓴다. 두 실행이 겹치면 뒤엣것이 앞엣것의
# 화면을 가로챈다 — 08-29 07:20 에 윌로우 홈택스가 텐소 우리은행 보안키패드를 덮어써
# 인증서 창을 못 찾고 끝났고, 알림은 우리은행 탓으로 보고했다. 예약 시각을 벌려 두는
# 것만으로는 부족하다: 손으로 되돌리는 실행은 아무 때나 들어오고, 잡이 길어지면
# 예약 간격도 먹는다. 그래서 회사를 가리지 않고 한 번에 하나만 돈다.
#
# shlock 은 락 파일에 PID 를 적고 그 PID 가 죽어 있으면 알아서 뺏는다. 실행이
# 중간에 죽어도 다음 턴이 영영 막히지 않는다.
LOCK_FILE="$HOME/.willow/runtime/local-finance.lock"
LOCK_WAIT_SECONDS="${FINANCE_LOCK_WAIT_SECONDS:-1800}"
LOCK_HELD=0

release_lock() {
  # 내 것일 때만 지운다. 남의 락을 지우면 두 실행이 화면을 나눠 쓰게 되고, 그러면
  # 락이 없느니만 못하다 — 08-29 07:41 에 사람이 락을 지우고 실행을 하나 더 띄워
  # 우리카드가 커밋하는 중에 홈택스가 같은 Chrome 을 끌고 갔다.
  if [ "$LOCK_HELD" = 1 ] && [ "$(tr -d ' \n' < "$LOCK_FILE" 2>/dev/null)" = "$$" ]; then
    rm -f "$LOCK_FILE"
  fi
  LOCK_HELD=0
}
trap release_lock EXIT

# 앞 실행이 돌고 있으면 기다린다. 건너뛰면 그날 그 소스가 통째로 빈다 — 겹치는
# 시간은 길어야 몇 분이라 기다리는 편이 싸다.
acquire_lock() {
  mkdir -p "$(dirname "$LOCK_FILE")"
  local waited=0 holder
  while ! /usr/bin/shlock -f "$LOCK_FILE" -p $$; do
    holder="$(tr -d ' \n' < "$LOCK_FILE" 2>/dev/null)"
    if [ "$waited" -ge "$LOCK_WAIT_SECONDS" ]; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') [$COMPANY] 다른 재무 실행(pid ${holder:-?})이 ${LOCK_WAIT_SECONDS}초 안에 끝나지 않았어요." >> "$LOG_FILE"
      return 1
    fi
    [ "$waited" = 0 ] && echo "$(date '+%Y-%m-%d %H:%M:%S') [$COMPANY] 다른 재무 실행(pid ${holder:-?})이 끝나기를 기다려요." >> "$LOG_FILE"
    sleep 20
    waited=$((waited + 20))
  done
  LOCK_HELD=1
  [ "$waited" -gt 0 ] && echo "$(date '+%Y-%m-%d %H:%M:%S') [$COMPANY] ${waited}초 기다린 뒤 시작해요." >> "$LOG_FILE"
  return 0
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
  group wetax "위택스" collect_wetax
  group nhis "4대보험" collect_nhis
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
  group card "우리카드" tensw_card
  group woori-bank "우리은행" tensw_woori_bank
  group bank "신한은행" tensw_bank
  collect_shared_taxes
  group match "세금 지급 매칭" run_step "세금 지급 매칭" \
    $NODE "$RUNTIME/scripts/match-finance-tax-obligations.mjs"
  group classify "자동 분류" run_step "자동 분류" npx tsx "$ROOT/scripts/local-finance-classify.ts" --company tensw
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
  group bank "신한은행" willow_bank
  group card "KB카드" willow_card
  collect_shared_taxes
  group match "세금 지급 매칭" run_step "세금 지급 매칭" \
    $NODE "$RUNTIME/scripts/match-finance-tax-obligations.mjs"
  group classify "자동 분류" run_step "자동 분류" npx tsx "$ROOT/scripts/local-finance-classify.ts" --company willow
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
        if [ "$COMPANY" = tensw ]; then group tax-invoices "세금계산서" tensw_tax_invoices
        else group tax-invoices "세금계산서" willow_tax_invoices; fi ;;
      bank)
        if [ "$COMPANY" = tensw ]; then group bank "신한은행" tensw_bank
        else group bank "신한은행" willow_bank; fi ;;
      woori-bank) group woori-bank "우리은행" tensw_woori_bank ;;
      card)
        if [ "$COMPANY" = tensw ]; then group card "우리카드" tensw_card
        else group card "KB카드" willow_card; fi ;;
      wetax) group wetax "위택스" collect_wetax ;;
      nhis) group nhis "4대보험" collect_nhis ;;
      national-tax) group national-tax "국세" collect_national_tax ;;
      match) group match "세금 지급 매칭" run_step "세금 지급 매칭" \
        $NODE "$RUNTIME/scripts/match-finance-tax-obligations.mjs" ;;
      classify) group classify "자동 분류" run_step "자동 분류" \
        npx tsx "$ROOT/scripts/local-finance-classify.ts" --company "$COMPANY" ;;
      reconcile) group reconcile "수금 대사" run_step "수금 대사" \
        npx tsx "$ROOT/scripts/tensw-reconcile-payments.ts" ;;
      akros) group akros "아크로스 인보이스 반영" run_step "아크로스 인보이스 반영" \
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
RETRY_MODE=0
for arg in "$@"; do
  case "$arg" in
    --defer-notify) DEFER_NOTIFY=1 ;;
    --notify) NOTIFY_NOW=1 ;;
    --retry) RETRY_MODE=1 ;;
  esac
done

# 막힌 묶음을 모아 두는 곳. 인증서 거부·보안키패드·사이트 점검처럼 다시 하면 되는
# 실패가 대부분인데, 지금까지는 CEO 가 로그를 보고 손으로 --only 를 쳐서 되돌렸다.
# --retry 가 이 파일을 읽어 그것만 다시 돈다.
RETRY_FILE="$RUNTIME/pending-retry"
RETRY_BEFORE=""
RETRY_REMAINING=""

# 이번 실행이 손댄 묶음은 결과로 덮고, 손대지 않은 묶음의 실패는 남긴다. 07시 턴이
# 04시 턴의 미해결분을 지워 버리면 안 되기 때문이다.
update_retry_list() {
  local kept="" merged="" bundle
  for bundle in $RETRY_BEFORE; do
    case " $ATTEMPTED_BUNDLES " in
      *" $bundle "*) ;;
      *) kept="${kept:+$kept }$bundle" ;;
    esac
  done
  merged="$kept"
  for bundle in $FAILED_BUNDLES; do
    case " $merged " in
      *" $bundle "*) ;;
      *) merged="${merged:+$merged }$bundle" ;;
    esac
  done
  RETRY_REMAINING="$merged"
  if [ -n "$merged" ]; then printf '%s\n' "$merged" > "$RETRY_FILE"; else rm -f "$RETRY_FILE"; fi
}

# 재실행으로 되살아난 묶음 수. 0 이면 상황이 그대로라 다시 알리지 않는다.
recovered_count() {
  local n=0 bundle
  for bundle in $RETRY_BEFORE; do
    case " $RETRY_REMAINING " in *" $bundle "*) ;; *) n=$((n + 1)) ;; esac
  done
  echo "$n"
}

[ -s "$RETRY_FILE" ] && RETRY_BEFORE="$(tr '\n' ' ' < "$RETRY_FILE")"
RETRY_BEFORE="$(echo $RETRY_BEFORE)"

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

# 재실행 목록을 다시 읽는다. 락을 기다리는 동안 앞 실행이 고쳐 놓았을 수 있다.
reread_retry_list() {
  RETRY_BEFORE=""
  [ -s "$RETRY_FILE" ] && RETRY_BEFORE="$(tr '\n' ' ' < "$RETRY_FILE")"
  RETRY_BEFORE="$(echo $RETRY_BEFORE)"
  ONLY="$(echo "$RETRY_BEFORE" | tr ' ' ',')"
}

# 돌릴 게 없으면 락도 잡지 않고 끝낸다 — 멀쩡한 날 30분씩 줄 서 있을 이유가 없다.
if [ "$RETRY_MODE" = 1 ]; then
  reread_retry_list
  if [ -z "$ONLY" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [$COMPANY] 다시 돌릴 묶음이 없어요." >> "$LOG_FILE"
    exit 0
  fi
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') $COMPANY local finance start${ONLY:+ (only: $ONLY)}" >> "$LOG_FILE"
rm -f "$STEP_FILE"
if ! acquire_lock; then
  # 화면을 못 잡았으면 아무것도 돌리지 않는다. 겹친 채로 도는 것보다 낫다 —
  # 겹치면 엉뚱한 실패가 남아 진짜 원인을 가린다.
  FAILED_STEPS="다른 재무 실행과 겹쳐 건너뜀"
else
  # 줄 서 있는 동안 앞 실행이 고쳤을 수 있다. 목록을 다시 보고 남은 것만 돈다.
  if [ "$RETRY_MODE" = 1 ]; then
    reread_retry_list
    if [ -z "$ONLY" ]; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') [$COMPANY] 기다리는 사이 다 풀렸어요." >> "$LOG_FILE"
      exit 0
    fi
  fi
fi

if [ -n "$FAILED_STEPS" ]; then :
elif [ -n "$ONLY" ]; then run_only "$ONLY"
elif [ "$COMPANY" = "tensw" ]; then run_tensw
else run_willow; fi

if [ -z "$FAILED_STEPS" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') $COMPANY local finance success${ONLY:+ (only: $ONLY)}" >> "$LOG_FILE"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') $COMPANY local finance failed: $FAILED_STEPS" >> "$LOG_FILE"
fi

# 막힌 묶음을 재실행 목록에 반영한다. 성공했든 실패했든 매 실행에서 한다 —
# 목록이 최신이어야 --retry 가 엉뚱한 걸 다시 돌리지 않는다.
update_retry_list
[ -n "$RETRY_REMAINING" ] \
  && echo "$(date '+%Y-%m-%d %H:%M:%S') [$COMPANY] 재실행 대기: $RETRY_REMAINING" >> "$LOG_FILE"

# 재실행은 상황이 달라졌을 때만 알린다. 아침에 실패가 그대로면 하루치 알림이 이미
# 그 사실을 전했고, 같은 내용을 잡이 돌 때마다 다시 보내면 정작 새 소식이 묻힌다.
if [ "$RETRY_MODE" = 1 ]; then
  RECOVERED="$(recovered_count)"
  echo "$(date '+%Y-%m-%d %H:%M:%S') [$COMPANY] 재실행 결과: 되살림 ${RECOVERED}개, 남음 ${RETRY_REMAINING:-없음}" >> "$LOG_FILE"
  if [ "$RECOVERED" = 0 ]; then
    exit 1
  fi
  if [ -z "$RETRY_REMAINING" ]; then
    $NODE "$RUNTIME/scripts/notify-local-finance.mjs" --company "$COMPANY" --status ok >> "$LOG_FILE" 2>&1
    exit 0
  fi
  $NODE "$RUNTIME/scripts/notify-local-finance.mjs" \
    --company "$COMPANY" --status fail --step "$FAILED_STEPS" >> "$LOG_FILE" 2>&1
  exit 1
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
