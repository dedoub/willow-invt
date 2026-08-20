#!/bin/bash
# 텐소프트웍스 법인 계좌 거래내역 일일 동기화 (CODEF, launchd 전용)
# 최근 14일을 매번 다시 훑는다. 은행이 뒤늦게 반영하거나 정정한 건도 잡히고,
# 중복은 fingerprint 유니크 인덱스가 막으므로 신규만 쌓인다.
set -euo pipefail

PROJECT_DIR="/Volumes/PRO-G40/app-dev/willow-invt"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

[ -d "$PROJECT_DIR" ] || exit 0
[ -f "$PROJECT_DIR/.env.local" ] || exit 0

cd "$PROJECT_DIR"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] tensw sync start"

# 은행 거래내역 — 최근 14일 재조회
npx tsx scripts/tensw-codef-sync.ts --days 14 || echo "  bank sync failed"

# 홈택스 세금계산서 매출·매입 — 최근 90일 재조회 (발행일은 홈택스 작성일자 기준)
npx tsx scripts/tensw-codef-tax-sync.ts --days 90 --purchase --promote || echo "  tax sync failed"

# 법인카드 승인내역 — 자동이체 매입의 결제 근거
npx tsx scripts/tensw-codef-card-sync.ts --days 90 --billing || echo "  card sync failed"

# 결제 대사 — 매출은 입금, 매입은 출금과 대조해 수금완료·지급완료 처리
npx tsx scripts/tensw-reconcile-payments.ts || echo "  reconcile failed"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] tensw sync done"

# 실패가 있으면 CEO에게 알린다. 조용히 실패하면 며칠이 지나도 모른다.
npx tsx scripts/tensw-sync-notify.ts "$HOME/logs/tensw-bank-sync/launchd.log" || true
