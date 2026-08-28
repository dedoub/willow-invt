#!/bin/bash
# 토스증권 계좌 → stock_trades 동기화 (launchd 전용).
# 토스 Open API는 IP 허용목록이 걸려 있어 허용된 IP(이 맥)에서만 성공한다.
# launchd는 drive-launcher.sh로 외장볼륨 마운트 대기 후 이 스크립트를 실행한다.
cd /Volumes/PRO-G40/app-dev/willow-invt
mkdir -p scripts/logs

echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') toss-sync start =====" >> scripts/logs/toss-sync.log
npx tsx scripts/toss-sync.ts >> scripts/logs/toss-sync.log 2>&1
echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') toss-sync done =====" >> scripts/logs/toss-sync.log

# 이어서 Portle 원장(구글 시트)에도 없는 것만 더한다.
# 같은 잡 안에서 순차로 도는 이유: 토스는 클라이언트당 유효 토큰이 하나뿐이라
# 따로 돌리면 두 프로세스가 서로의 토큰을 무효화한다.
# 여기서 실패해도 위의 toss-sync 결과는 이미 반영됐으므로 잡을 죽이지 않는다.
echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') toss-portle start =====" >> scripts/logs/toss-portle.log
# 스크립트는 port-ledger 에 있고 토스 클라이언트와 자격증명은 여기(willow)에서
# 절대경로로 읽는다. 그래서 서브셸에서 port-ledger 로 옮겨 실행한다.
#
# 안전장치: 예약 잡은 port-ledger 가 그때 어느 브랜치에 있든 그 파일을 실행한다.
# 증분 코드(toss-ledger-sync.ts)가 없는 브랜치가 체크아웃돼 있으면 옛 재구성기가
# Transactions 탭을 통째로 다시 써서 사용자가 손으로 적은 줄이 사라진다.
# 그럴 때는 돌리지 않고 건너뛴다 — 하루 거르는 편이 원장을 잃는 것보다 낫다.
PORTLE_DIR=/Users/dongwookkim/app-dev-old/port-ledger
if [ ! -f "$PORTLE_DIR/scripts/toss-ledger-sync.ts" ]; then
  echo "SKIP: $PORTLE_DIR 에 증분 코드가 없다 (브랜치 확인 필요). 재구성기는 돌리지 않는다." \
    >> scripts/logs/toss-portle.log
else
  (cd "$PORTLE_DIR" && npx tsx scripts/import-toss-to-portle-ledger.ts) \
    >> /Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/toss-portle.log 2>&1 \
    || echo "toss-portle FAILED" >> scripts/logs/toss-portle.log
fi
echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') toss-portle done =====" >> scripts/logs/toss-portle.log
