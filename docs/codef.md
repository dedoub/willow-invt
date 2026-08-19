# CODEF 은행 계좌 조회 연동 (텐소프트웍스)

법인 계좌 거래내역을 엑셀로 받아 수기 입력하던 흐름을 CODEF(헥토데이터) API 호출로 바꾼다.
현금관리 분류는 자동화하지 않는다 — 원본만 자동으로 끌어오고, 분류는 사람이 확정한다.

## 구성

| 파일 | 역할 |
|------|------|
| `src/lib/codef/client.ts` | OAuth 토큰 캐시, 요청/응답 URI 인코딩 처리, 비밀번호 RSA 암호화 |
| `src/lib/codef/bank.ts` | 기업 보유계좌·수시입출 거래내역 래퍼, 기관코드, 텐소 계좌 매핑 |
| `src/lib/codef/hometax.ts` | 홈택스 전자세금계산서 목록 래퍼, 인증서 자격 구성, 3개월 분할 |
| `scripts/codef-register-account.ts` | 커넥티드 아이디 발급/조회 (`npm run codef:register`) |
| `scripts/tensw-codef-sync.ts` | 거래내역 → 스테이징 적재 (`npm run tensw:bank:sync`) |
| `scripts/tensw-codef-tax-sync.ts` | 세금계산서 → 스테이징 + 매출 연결 (`npm run tensw:tax:sync`) |
| `scripts/tensw-reconcile-payments.ts` | 계산서 ↔ 은행 입금 대사 (`npm run tensw:reconcile`) |
| `scripts/codef-encrypt-password.ts` | 비밀번호 RSA 암호화 (`npm run codef:encrypt`) |
| `scripts/codef-smoke.ts` | 토큰·연결 확인 |
| `tensw_codef_transactions` | 은행 원본 거래 스테이징 |
| `tensw_codef_tax_invoices` | 홈택스 세금계산서 스테이징 |

## 엔드포인트

- 토큰: `POST https://oauth.codef.io/oauth/token` (Basic clientId:clientSecret, `grant_type=client_credentials&scope=read`)
- 데모 호스트 `https://development.codef.io` / 정식 `https://api.codef.io`
- 계정 등록 `POST /v1/account/create`, 추가 `/v1/account/add`, 목록 `/v1/account/list`, CID 목록 `/v1/account/connectedId-list`
- 기업 보유계좌 `POST /v1/kr/bank/b/account/account-list`
- 기업 수시입출 거래내역 `POST /v1/kr/bank/b/account/transaction-list`
- 전자세금계산서 목록 `POST /v1/kr/public/nt/tax-invoice/check-list` (기관코드 고정 `0002`)

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
| 실행 | `scripts/run-tensw-bank-sync.sh` — 은행 14일 → 홈택스 90일 → 수금 대사 (drive-launcher 경유) |
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

## 수금 대사

`npm run tensw:reconcile` 이 발행 확인된 계산서를 은행 입금과 대조해 `payment_status='paid'`,
`paid_amount`, `paid_at`, `bank_ref` 를 채운다. 입금 소스는 `tensw_mgmt_cash`(분류 끝난 매출 입금)와
`tensw_codef_transactions`(CODEF 원본) 둘 다 본다.

매칭 순서:

1. **합계금액 일치** — 발행일 이후 가장 가까운 입금부터. 체육회 유지보수처럼 같은 금액이 매달
   반복되므로 근접도 정렬이 없으면 5월분에 8월 입금이 붙는다.
2. **공급가액 일치** — 부가세를 빼고 입금하는 거래처가 있다. 은행 적요에 상호 대신 사업명이
   찍히는 경우가 많아 이름보다 금액이 확실한 신호다.
3. **상호 일치 + 합계의 70% 이상** — 표기 흔들림("(주) 이맥스시스템" ↔ "(주)이맥스시스")을 정규화해서 비교.

**일부 수금도 수금완료로 처리하되 부족액을 `notes`에 남긴다.** 한 입금은 한 계산서에만 쓴다.

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
