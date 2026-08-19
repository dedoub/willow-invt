# CODEF 은행 계좌 조회 연동 (텐소프트웍스)

법인 계좌 거래내역을 엑셀로 받아 수기 입력하던 흐름을 CODEF(헥토데이터) API 호출로 바꾼다.
현금관리 분류는 자동화하지 않는다 — 원본만 자동으로 끌어오고, 분류는 사람이 확정한다.

## 구성

| 파일 | 역할 |
|------|------|
| `src/lib/codef/client.ts` | OAuth 토큰 캐시, 요청/응답 URI 인코딩 처리, 비밀번호 RSA 암호화 |
| `src/lib/codef/bank.ts` | 기업 보유계좌·수시입출 거래내역 래퍼, 기관코드, 텐소 계좌 매핑 |
| `src/lib/codef/card.ts` | 법인 보유카드·승인내역 래퍼, 카드사 코드 |
| `src/lib/codef/hometax.ts` | 홈택스 전자세금계산서 목록 래퍼, 인증서 자격 구성, 3개월 분할 |
| `scripts/codef-register-account.ts` | 커넥티드 아이디 발급/조회 (`npm run codef:register`) |
| `scripts/tensw-codef-sync.ts` | 거래내역 → 스테이징 적재 (`npm run tensw:bank:sync`) |
| `scripts/tensw-codef-tax-sync.ts` | 세금계산서 → 스테이징 + 매출 연결 (`npm run tensw:tax:sync`) |
| `scripts/tensw-codef-card-sync.ts` | 카드 승인내역 적재 (`npm run tensw:card:sync`) |
| `scripts/tensw-reconcile-payments.ts` | 계산서 ↔ 은행 입금 대사 (`npm run tensw:reconcile`) |
| `scripts/codef-encrypt-password.ts` | 비밀번호 RSA 암호화 (`npm run codef:encrypt`) |
| `scripts/codef-smoke.ts` | 토큰·연결 확인 |
| `tensw_codef_transactions` | 은행 원본 거래 스테이징 |
| `tensw_codef_tax_invoices` | 홈택스 세금계산서 스테이징 |
| `tensw_codef_card_approvals` | 법인카드 승인내역 원본 |
| `tensw_codef_card_billing` | 법인카드 이용명세서(청구내역) |

## 엔드포인트

- 토큰: `POST https://oauth.codef.io/oauth/token` (Basic clientId:clientSecret, `grant_type=client_credentials&scope=read`)
- 데모 호스트 `https://development.codef.io` / 정식 `https://api.codef.io`
- 계정 등록 `POST /v1/account/create`, 추가 `/v1/account/add`, 목록 `/v1/account/list`, CID 목록 `/v1/account/connectedId-list`
- 기업 보유계좌 `POST /v1/kr/bank/b/account/account-list`
- 기업 수시입출 거래내역 `POST /v1/kr/bank/b/account/transaction-list`
- 전자세금계산서 목록 `POST /v1/kr/public/nt/tax-invoice/check-list` (기관코드 고정 `0002`)
- 법인 보유카드 `POST /v1/kr/card/b/account/card-list`, 승인내역 `POST /v1/kr/card/b/account/approval-list`
  (우리카드 `0309`, `memberStoreInfoType='3'` 이어야 가맹점 사업자번호·부가세가 온다)
- 이용명세서 `POST /v1/kr/card/b/account/billing-list` (`startDate`=청구년월 YYYYMM)

## 카드 사용액 두 기준

화면(카드승인내역 섹션)은 명세서와 승인 두 축을 토글로 보여준다. 숫자가 다른 게 정상이다.

| 기준 | 축 | 내용 |
|---|---|---|
| 이용명세서 | 청구월(=결제월) | 할부·연회비·해외이용이 반영된 실제 결제액. 202603 명세서 9,802,131원은 은행의 2026-03-05 "2월 이용대금" 출금과 일치한다 |
| 승인내역 | 사용월 | 그 달에 실제로 쓴 금액. 할부도 승인 시점에 전액. 취소·거절분은 제외 |

**해외 승인은 `amount`가 외화다.** `resKRWAmt`를 `krw_amount`에 따로 담아 합산은 원화로 한다.
안 그러면 ANTHROPIC 승인이 200달러가 아니라 200원으로 잡혀 최다 가맹점 순위가 뒤집힌다.

**항목 분류는 가맹점명이 근거다.** 카드사가 주는 `store_type`은 해외 승인에 아예 없고
국내도 "인터넷P/G"처럼 결제수단만 알려줘 용도를 못 가린다. 그래서 이름을 먼저 보고 타입은 보조로 쓴다.
분류는 AI·클라우드 / 외주·인력 / 통신·공과금 / 식대·마트 / 차량·교통 / 보험·수수료 / 기타.
새 가맹점이 늘면 `card-block.tsx` 의 `CATEGORIES` 에 추가한다.

**항목 비중은 승인 합계로 나눈다.** 분류는 가맹점이 있어야 가능한데 명세서에는 가맹점이 없다.
명세서 합계로 나누면 항목을 다 더해도 100%가 안 나온다.

**명세서는 결제계좌 단위로 나뉜다.** 우리카드는 청구내역에 카드번호를 요구하는데, 응답은 그 카드가
속한 그룹의 명세서다. 카드 한 장만 조회하면 절반만 온다(실측: 202608이 2,996,843 / 6,547,716
두 그룹). 보유카드를 다 돌고 fingerprint로 중복을 거른다.

요청 바디는 JSON을 `encodeURIComponent` 한 문자열로 보내고, 응답 바디도 URI 인코딩되어 오므로
`+`를 공백으로 바꾼 뒤 디코딩해야 한다. 클라이언트가 이미 처리한다.

## 환경변수 (.env.local)

```
CODEF_SERVICE=demo                 # sandbox | demo | api
CODEF_DEMO_CLIENT_ID=...           # 키관리 > 데모버전
CODEF_DEMO_CLIENT_SECRET=...
CODEF_PUBLIC_KEY=...               # 키관리 > public_key 전체 문자열
TENSW_CODEF_CONNECTED_ID=...       # 은행: 계정 등록 후 발급

# 홈택스: connectedId를 안 쓰고 요청마다 인증서를 실어 보낸다
CODEF_HOMETAX_CERT_DER=/path/to/signCert.der
CODEF_HOMETAX_CERT_KEY=/path/to/signPri.key
CODEF_HOMETAX_CERT_PASSWORD_ENC=...  # npm run codef:encrypt 로 생성한 RSA 암호문
```

인증서 비밀번호는 평문으로 두지 않는다. CODEF publicKey로 암호화한 문자열만 저장하며,
이 값은 CODEF 개인키로만 풀리므로 다른 곳에서는 쓸모가 없다. 매 호출마다 그대로 재전송해도 통한다.

```
printf '%s' '비밀번호' | npm run codef:encrypt -- --write-env CODEF_HOMETAX_CERT_PASSWORD_ENC
```

멤버십 현황(2026-08-19): 샌드박스·데모버전 사용중, 정식버전 미신청.
데모는 실제 데이터를 1개월간 하루 100회까지 호출할 수 있다. 상시 운영하려면 정식버전 신청이 필요하다.

## 최초 설정

1. 키관리(https://codef.io/account/keys)에서 `public_key` 전체를 복사해 `CODEF_PUBLIC_KEY`에 넣는다.
2. 법인 공동인증서 `signCert.der` / `signPri.key`를 준비한다.
3. 계정 등록 — 인증서 비밀번호는 프롬프트로 입력하며 RSA 암호화되어 전송된다. 로그·파일에 남지 않는다.

   ```
   npm run codef:register -- --cert --org 0020 --der ~/certs/signCert.der --key ~/certs/signPri.key
   ```

   기관코드: 우리 `0020`, 신한 `0088`. 두 은행을 모두 쓰려면 첫 등록에서 받은 connectedId로 추가한다.

   ```
   npm run codef:register -- --cert --org 0088 --connected-id <발급된ID> --der ... --key ...
   ```

4. 출력된 connectedId를 `.env.local`의 `TENSW_CODEF_CONNECTED_ID`에 넣는다.
5. 확인: `npm run codef:register -- --list`

인터넷뱅킹 ID/PW 방식도 가능하다(`--id --login-id <아이디>`). 은행별 지원 여부는 CODEF 기관별 로그인 제공 현황 참고.

## 사용

```
npm run tensw:tax:sync -- --dry                # 최근 90일 매출 세금계산서 확인
npm run tensw:tax:sync -- --from 20260101 --to 20260819
npm run tensw:tax:sync -- --purchase           # 매입까지
npm run tensw:tax:sync -- --promote            # 기존 매출 행과 연결 / 없으면 신규 입력

npm run tensw:bank:sync -- --balances          # 보유계좌·잔액 조회
npm run tensw:bank:sync                        # 최근 14일 거래 적재
npm run tensw:bank:sync -- --days 90
npm run tensw:bank:sync -- --from 20260101 --to 20260819
npm run tensw:bank:sync -- --account 1005403461450
npm run tensw:bank:sync -- --dry               # DB 미변경, 결과만 출력
```

## 자동 실행

launchd로 매일 08:00에 최근 14일을 다시 훑는다. 은행이 늦게 반영하거나 정정한 건도 잡히고,
중복은 fingerprint가 막으므로 신규만 쌓인다.

| 항목 | 값 |
|---|---|
| Label | `com.willow.tensw-bank-sync` |
| plist | `scripts/com.willow.tensw-bank-sync.plist` → `~/Library/LaunchAgents/` |
| 실행 | `scripts/run-tensw-bank-sync.sh` — 은행 14일 → 홈택스 90일 → 카드 90일 → 결제 대사 |
| 로그 | `~/logs/tensw-bank-sync/launchd.log` |

```
launchctl list | grep tensw-bank-sync     # 등록 확인
launchctl start com.willow.tensw-bank-sync # 즉시 1회 실행
```

08:00인 이유: 우리·신한 야간 배치(대출이자 03:05 등)가 끝난 뒤라 전날 내역이 확정된 상태로 들어온다.
계좌 9개면 하루 9콜이라 데모 한도(100회/일)에 여유가 있다.

## 세금계산서 매칭 규칙

홈택스 작성일자와 수기 입력 발행일이 며칠씩 어긋나는 경우가 흔해서, 거래처명이 아니라
**합계금액 + 발행일 ±10일**로 기존 `tensw_mgmt_sales` 행을 찾아 연결한다. 못 찾으면 새로 넣는다.

- 이미 다른 계산서가 물고 있는 매출 행에는 다시 연결하지 않는다. 수정세금계산서(취소 후 재발행)처럼
  같은 금액이 두 번 잡히는 경우 `status='review'`로 남겨 사람이 판단한다.
- 마이너스 세금계산서(취소분)는 매출 행으로 넣지 않고 `status='ignored'`.
- **발행일은 홈택스 작성일자가 정본이다.** 기록과 다르면 항상 홈택스 기준으로 덮어쓴다.

## 상세정보 보완

`--promote` 를 돌 때마다 계산서발행·수금완료 상태인 행의 상세정보를 홈택스 값으로 맞춘다.
상호·사업자번호·대표자는 홈택스가 정본이므로 덮어쓴다. 품목은 사람이 쪼개 적은 경우가 있어
(유지보수 + 클라우드 엔지니어링) 비어 있을 때만 대표품목으로 채운다.
승인번호·발급형태·전송일자는 `notes` 에 한 줄로 남기되 이미 승인번호가 적혀 있으면 건드리지 않는다.

## 매입 세금계산서

매출과 같은 테이블(`tensw_mgmt_sales`)에 `invoice_type='purchase'` 로 들어간다. 화면은 매출관리
섹션의 탭으로 갈린다. 매입은 수기로 관리하던 이력이 없어 매칭 없이 전부 신규 입력되며,
거래처는 공급자(`supplier_*`), 상태는 `pending`(계산서수취) → `paid`(지급완료) 두 단계뿐이다.

취소(마이너스) 계산서는 **같은 거래처 + 같은 금액 + 같은 품목**일 때만 원발행분과 짝지어 둘 다 뺀다.
품목까지 보지 않으면 비블로 임차료 200만원과 라이선스 취소 200만원처럼 성격이 다른 건이 엮인다.
짝을 못 찾은 취소분은 `status='review'` 로 남긴다.

## 결제 대사

`npm run tensw:reconcile` 이 발행 확인된 계산서를 은행 내역과 대조해 `payment_status='paid'`,
`paid_amount`, `paid_at`, `bank_ref` 를 채운다. 매출은 입금, 매입은 출금을 본다.
소스는 `tensw_mgmt_cash`(분류 끝난 것)와 `tensw_codef_transactions`(CODEF 원본) 둘 다.

매칭 순서:

1. **합계금액 일치** — 발행일 이후 가장 가까운 입금부터. 체육회 유지보수처럼 같은 금액이 매달
   반복되므로 근접도 정렬이 없으면 5월분에 8월 입금이 붙는다.
2. **공급가액 일치** — 부가세를 빼고 입금하는 거래처가 있다. 은행 적요에 상호 대신 사업명이
   찍히는 경우가 많아 이름보다 금액이 확실한 신호다.
3. **상호 일치 + 합계의 70% 이상** — 표기 흔들림("(주) 이맥스시스템" ↔ "(주)이맥스시스")을 정규화해서 비교.

4. **합산 결제** — 같은 거래처의 **같은 달** 계산서 두 건 합이 한 출금과 **정확히** 일치하면 둘 다 처리한다.
   AWS(지에스네오텍)처럼 청구가 항목별로 쪼개져 오고 출금은 한 번에 나가는 경우다.
   오차를 허용하거나 월 조건을 빼면 조합이 폭발해 아무 건이나 붙으므로 둘 다 필수다.

출금에는 이체수수료 1,000원까지 오차를 허용한다. 법인 이체는 건당 500원쯤 더 나가 합계와 정확히 안 맞는다.
상호 매칭은 발행일 이후 60일 안, 합계의 90% 이상일 때만 쓴다. 한전·KT·구글클라우드처럼 반복 청구하는
거래처는 계산서가 계량기·항목별로 쪼개지고 결제는 카드나 합산이라 금액이 안 맞는데, 느슨하게 잡으면
엉뚱한 달 출금이 붙는다. **어중간하게 맞추느니 미매칭으로 남긴다.**

**일부 수금·지급도 완료로 처리하되 부족액을 `notes`에 남긴다.** 한 입출금은 한 계산서에만 쓴다.

## 자동이체 거래처

한전·KT·구글클라우드는 계산서와 결제가 1:1이 아니다. 실측한 어긋남:

| 거래처 | 계산서 | 실제 결제 | 이유 |
|---|---|---|---|
| 한국전력공사 | 151,066 | 카드 109,850 · 393,050 / 은행 자동이체 | 계량기별 청구 vs 합산 결제, 카드·은행 혼재 |
| 주식회사 케이티 | 70,382 | 142,650 | 회선별 청구 vs 요금제 합산 승인 |
| 구글클라우드 | 실사용액 | 10만·50만·100만 | 선불 충전 방식 |

**구글클라우드는 사업자번호부터 다르다.** 계산서 `103-86-01049`, 카드 가맹점 `411-86-01799`.
그래서 사업자번호만으로는 못 붙이고 상호로도 본다.

이 거래처들은 `AUTO_DEBIT_VENDORS` 목록에 두고 지급완료로 처리하되, 카드 승인과 은행 출금 양쪽에서
찾은 근거를 `notes` 에 남긴다. 금액은 맞추지 않는다. 합산 매칭 대상에서도 뺀다 — 억지로 붙이면
2월분과 4월분 전기요금 계산서가 6월 출금에 엮인다. 새 거래처가 늘면 목록에 추가한다.

계약예정·발행예정 행은 CEO가 계약서 기준으로 직접 관리하므로 대사 대상에서 빠진다.
홈택스 발행이 확인된 계산서(`tensw_codef_tax_invoices.status='promoted'`)만 본다.

## 스테이징 → 현금관리

`tensw_codef_transactions`는 원본 그대로다. `status`가 `new`인 행을
`update-cash-transactions` 워크플로우로 분류해 `tensw_mgmt_cash`에 넣고,
`status='classified'` + `cash_id`로 연결한다. 무시할 거래는 `status='ignored'`.

중복 방지는 `fingerprint`(기관+계좌+일자+시각+입출금+잔액+적요 SHA1) 유니크 인덱스가 맡는다.
같은 기간을 몇 번 다시 돌려도 신규 건만 쌓인다.

## 주의

- CODEF는 대상 은행을 스크래핑한다. 과도한 호출은 은행 측 IP 차단으로 이어질 수 있어
  배치성 반복 호출을 피하라고 문서에 명시되어 있다. 하루 1~2회 주기가 적정하다.
- 은행별 조회 가능 기간 제한이 있다. 우리은행은 2000년 1월부터, 신한은 2009년 1월부터.
  기업은행은 00~03시에 최근 6개월만 조회된다.
- 거래내역은 5,000건 단위로 과금된다.
- 계좌 목록은 `src/lib/codef/bank.ts`의 `TENSW_ACCOUNTS`에 있다. `label`은
  `tensw_mgmt_cash.account_number` 기존 표기와 반드시 같아야 잔고 스파크라인이 이어진다.
