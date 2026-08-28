---
name: daily-finance-sync
description: 윌로우·텐소프트웍스 은행·카드·세금·사회보험을 로컬에서 무인 수집해 DB 적재, 분류, 지급 매칭하는 일일 재무 자동화. "재무 동기화", "세금관리", "은행 자동수집", "재무 스케줄러" 시 사용.
---

# Daily Finance Sync

## 원칙

- 스케줄러 실행 때 인증 허가를 묻지 않는다. 회사별 Keychain 자격증명을 무인 사용한다.
- 자격증명은 로그·DB·JSON에 저장하지 않는다.
- 수집 성공만으로 완료라 하지 않는다. `수집 → 검증 → DB UPSERT → 분류 → 지급 매칭` 전부 성공해야 한다.
- 일부 소스 실패를 숨기지 않는다. 회사·소스·단계·재시도 결과를 기록하고 알린다.
- 세금·보험 고지는 비용을 중복 생성하지 않는다. `finance_tax_obligations`에 고지를 저장하고 기존 은행 출금과 연결한다.
- 동일 금액 후보가 여러 개면 자동 매칭하지 않는다.

## 회사별 소스

| 회사 | 필수 소스 |
|---|---|
| 텐소프트웍스 | 홈택스, 우리은행, 신한은행, 우리카드, 위택스, 사회보험 |
| 윌로우 | 홈택스, 신한은행, KB카드, 위택스, 사회보험 |

홈택스는 세금계산서와 국세·부가세 납부고지를 모두 수집한다. 위택스는 지방세, 사회보험은 건강보험·연금·고용·산재 고지를 수집한다.

홈택스는 23:30~06:59 사이 서비스를 닫는다. 그래서 홈택스는 04시 턴에서 통째로 빼고, 07:00(텐소프트웍스)·07:20(윌로우) 별도 launchd 잡 `com.willow.<회사>-hometax` 에서만 돈다. 이 잡은 세금계산서와 국세를 받은 뒤, 계산서를 쓰는 뒤 단계(매칭·자동 분류·수금 대사/아크로스 반영)까지 이어서 돈다.

| 시각 | 잡 | 도는 것 |
|---|---|---|
| 04:00 / 04:40 | `com.willow.<회사>-local-finance --defer-notify` | 은행·카드·위택스·사회보험 → 매칭·자동 분류 |
| 07:00 / 07:20 | `com.willow.<회사>-hometax --notify` | 세금계산서·국세 → 매칭·자동 분류·수금 대사(텐소)/아크로스 반영(윌로우) |

일일 요약 알림은 두 턴이 다 끝난 07시 잡에서 **하루 한 통만** 나간다.

- `--defer-notify`(04시): 알리지 않는다. 막힌 묶음만 `$RUNTIME/pending-failures` 에 시각과 함께 적어 둔다.
- `--notify`(07시): 그 파일을 읽어 자기 실패와 합쳐 한 통으로 보내고 파일을 지운다.
- 플래그 없이 손으로 돌리면 지금까지처럼 그 자리에서 알리고, 이월분은 건드리지 않는다.

알림 시점엔 모든 산출물이 몇 시간 안쪽이라 신선도는 12시간 한 기준이다(소스별 예외 없음).

## 실행 순서

1. 회사별 브라우저 프로필과 Keychain 서비스가 분리됐는지 확인한다.
2. 각 소스를 최근 14~90일 겹쳐 수집하고 fingerprint로 중복을 막는다.
3. 은행·카드는 회사별 staging/cash 테이블에 UPSERT한다.
4. 세금·보험 고지는 `scripts/import-finance-tax-obligations.mjs`로 적재한다.
5. 현금 분류 후 `scripts/match-finance-tax-obligations.mjs`를 실행한다.
6. 소스별 수집 건수, 신규 건수, 분류 보류, 지급 매칭, 실패를 로그로 남긴다.

묶음 하나만 다시 돌릴 때는 `--only` 를 쓴다. 새벽에 막힌 소스를 그날 안에 복구할 때도 같다.

```bash
scripts/run-local-finance.sh tensw --only tax-invoices,national-tax,match
scripts/run-local-finance.sh tensw --only card,wetax
```

### 실패분 재실행

막힌 묶음은 회사별 `~/.willow/runtime/<회사>-local-finance/pending-retry` 에 묶음 키로 쌓인다. `--retry` 가 그것만 다시 돈다.

```bash
scripts/run-local-finance.sh tensw --retry
```

- `com.willow.<회사>-finance-retry` 가 08:30·12:30(텐소)/08:50·12:50(윌로우)에 돈다.
- 돌릴 게 없으면 Chrome·마우스를 건드리지 않고 즉시 끝난다. 인증서 로그인이 화면을 잡는 건 실패가 남은 날뿐이다.
- 앞 턴이 손대지 않은 묶음의 실패는 지우지 않는다(07시 턴이 04시 미해결분을 덮지 않게).
- **상황이 달라졌을 때만 알린다.** 되살린 게 없으면 조용히 끝낸다 — 같은 실패 알림이 잡마다 반복되면 새 소식이 묻힌다.

### 인증서 창 정리

인증서 모듈 창은 Chrome 소유가 아니라 별도 프로세스(`INISAFECrossWebEXSvc` 등) 것이라 Chrome을 껐다 켜도 남아 다음 단계를 막는다. `scripts/close-cert-dialogs.sh` 가 Chrome 재시작 직전과 묶음 실패 직후에 돈다.

> **확인 버튼은 절대 누르지 않는다.** 확인은 제출이고, 제출은 인증서 5회 오류 카운터를 태운다(5회면 인증서가 잠겨 홈택스까지 멈춘다). 취소가 있으면 취소만 누르고, 단추가 확인 하나뿐인 창(오류 알림)만 눌러 치운다.

### 실행 락

두 회사가 같은 Chrome·같은 포인터를 쓰므로 `~/.willow/runtime/local-finance.lock` 으로 한 번에 하나만 돈다(`shlock`, 죽은 PID는 자동 회수). 뒤에 온 실행은 최대 30분 기다린다.

> 락 파일을 손으로 지우지 말 것. 돌고 있는 실행의 락을 지우면 두 실행이 화면을 나눠 쓰게 되어 락이 없느니만 못하다(08-29 실제 사고). 멈춘 실행은 프로세스를 먼저 죽이면 락은 알아서 풀린다.

묶음 이름: `tax-invoices` `bank` `woori-bank`(텐소) `card` `wetax` `nhis` `national-tax` `match` `classify` `reconcile`(텐소 수금 대사) `akros`(윌로우 아크로스 반영)

## 검증

```bash
npm run finance:test
node scripts/import-tensw-local-tax.mjs --dry
node scripts/match-finance-tax-obligations.mjs --dry
launchctl print gui/$(id -u)/com.willow.tensw-local-finance
launchctl print gui/$(id -u)/com.willow.tensw-hometax
tail -40 ~/logs/tensw-local-finance/launchd.log
```
