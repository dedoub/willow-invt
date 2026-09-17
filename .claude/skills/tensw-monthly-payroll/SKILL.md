---
name: tensw-monthly-payroll
description: Use when running the Tensoftworks monthly payroll — collecting 4대보험 per-person figures, building the 급여내역 sheet for the tax firm, requesting the 확정 급여대장, then producing the 우리은행 대량이체 file and per-person 급여명세서 for payday. Trigger on "급여 진행", "급여대장 요청", "급여명세서", "대량이체", "급여일".
---

# 텐소프트웍스 월 급여

## 급여일

매월 25일. 그날이 주말이나 공휴일이면 **직전 영업일**로 당긴다.
`scripts/lib/kr_workdays.py` 의 `payDate` 가 이미 그 규칙으로 계산한다. 손으로 세지 않는다.

2026년: 9월 23일(수, 추석), 10월 23일(금), 11월 25일(수), 12월 24일(목, 성탄절).

## 흐름은 두 토막이다

```
[1] 4대보험 개인별 조회 → 급여내역 xlsx → 세무법인 요청
        ↓ (세무법인이 확정 급여대장 PDF 회신)
[2] 대량이체 xls + 개인별 급여명세서 → 급여일 아침 발송
```

세무법인에 보내는 것은 **계산서가 아니라 입력**이다. 사회보험 사이트 숫자를 서식의 제자리에
옮겨 담을 뿐, 근로자 부담분을 우리가 계산하지 않는다. 확정 급여대장은 세무법인이 만든다.

## 1단계 — 급여내역 만들어 요청

사회보험통합징수포털(si4n)에서 개인별 산출내역을 내려받는다. 손으로 받을 필요 없다.

```bash
node scripts/collect-nhis-persons.mjs                  # 조회되는 최신월
node scripts/collect-nhis-persons.mjs --month 2026-09  # 달을 지정할 때

python3 scripts/tensw_payroll_register.py 2026 9 \
  직전달_급여내역.xlsx 출력_급여내역_202609.xlsx  내려받은csv…

node scripts/tensw-payroll-request.mjs --month 2026-09 --file 출력_급여내역_202609.xlsx
node scripts/tensw-payroll-request.mjs --month 2026-09 --file … --send   # 승인 뒤
```

받은 파일은 `~/logs/tensw-local-finance/nhis-persons/<YYYYMM>/` 에 보험별로 한 장씩
(`nhis-health-202609.csv` 꼴) 떨어지고, 무엇을 받고 무엇이 없었는지가 `manifest.json` 에 남는다.
포털이 붙이는 이름은 `nhisGungangList` · `nhisYeonkumList` · `nhisGoyongList` · `nhisSanjaeList` 다.

**서식이 두 벌이다.** 건강보험은 EUC-KR 에 건강·요양 두 벌이 옆으로 이어지고, 연금·고용·산재는
한 사람 한 줄에 `결정보험료` 한 칸이다. 고용과 산재는 머리글이 글자 하나 다르지 않아 **파일 이름**
으로만 갈린다 — 이름에 `goyong`/`고용`, `sanjae`/`산재` 를 남겨 둬야 한다.

파서를 손댔으면 왕복으로 확인한다. 직전 달 xlsx 를 직전달·출력 양쪽에 넣고 그 달 CSV 넉 장을
먹이면 모든 칸이 `같음` 으로 나오고 출력이 입력과 한 칸도 다르지 않아야 한다.

**보험마다 고지가 올라오는 날이 다르다.** 건강이 16일쯤으로 가장 빠르고 연금·산재는 21~24일쯤이라,
급여일 직전에 돌리면 건강만 나오는 달이 흔하다(2026-09 가 그랬다). 없는 보험은 "없음" 으로 찍히니
조용히 넘어가지 않는다.

**급여일 오전까지 안 올라온 보험은 직전 달 숫자를 그대로 쓴다(CEO).** 생성기가 어느 칸을
새로 받았고 어느 칸을 이어썼는지 표로 찍어 준다 — 조용히 이어쓰면 틀려도 모른다.
이어쓴 게 있으면 메일에 한 줄 적는다(`--note`).

수신 `jjtaxro@daum.net`(세무법인형운 세무자료), 참조 `ch.kim@tsw.im`.
제목은 `[텐소프트웍스] N월 급여대장 요청`. 8월에는 요청 10분 만에 회신이 왔다.

세무법인이 먼저 "전월과 변동 여부" 를 묻는 달도 있다. 그때는 그 메일에 답장으로 붙인다.

## 2단계 — 대량이체와 급여명세서

확정 급여대장 PDF 가 오면 한 번에 만든다.

```bash
python3 scripts/tensw_payroll_payday.py 2026 8 8월급여대장.pdf \
  --register 급여내역_202608.xlsx --accounts 계좌.json --out 폴더
```

- `8월급여대장.pdf` = 세무법인 회신 첨부. **차인지급액**이 이체 금액이다. 다시 계산하지 않는다.
- `--register` 는 1단계의 급여내역 xlsx. 주민번호(이체 파일의 생년월일 6자리)를 여기서 가져온다.
- `--accounts` 는 `{"이름": {"bank": "우리은행", "number": "1002…"}}` 꼴 json.
  **깃에 두지 않는다.** 직전 달 대량이체 파일에서 옮겨 오고 사람이 바뀔 때만 손댄다.
  계좌를 모르는 사람은 빈칸으로 나오고 생성기가 이름을 찍어 준다 — 그대로 올리면 안 된다.

대장 PDF 는 선만 있고 칸 구분이 없어서 글자 좌표로 읽는다(`scripts/lib/payroll_ledger.py`).
머리글이 세 줄이고 세 줄의 칸이 서로 다른 x 에 있다. 사람도 세 줄이라, n번째 줄은
머리글 n번째 줄의 칸에만 값을 놓는다. 숫자 가운데에 공백이 끼어 오므로("3 3,130") 다시 붙인다.

우리은행 대량이체 파일은 머리글 없는 `.xls`, 한 줄에 한 사람, 여덟 칸이다.

| 은행 | 계좌번호 | 금액 | 이름 | 생년월일6자리 | (빈칸) | 보내는이 | 적요 |
|---|---|---|---|---|---|---|---|
| 우리은행 | (계좌) | 1474040 | 김철형 | 770818 | | 텐소프트웍스 | 8월급여 |

급여명세서는 회사 서식(`scripts/templates/tensw-payslip.xlsx`)에 담아 개인별 xlsx 로 만들고
급여일 아침에 각자에게 보낸다. 서식에 자리가 없는 항목(정산·두루누리·연말정산)은 **기타**로
모아서 지급합계·공제합계가 대장과 맞게 한다 — 조용히 버리면 합이 안 맞는다.

법인인감은 저장소에 없다. 비공개 버킷에서 받아 `--seal` 로 넘긴다.

```bash
node scripts/fetch-private-file.mjs signatures tensw/corp-seal.png /tmp/seal.png
```

## 사람

9명 — 김철형(대표이사) · 김의향(이사) · 김정한(이사) · 박선영(이사) ·
김경수 · 권지민 · 조성민 · 이승무 · 전희나(이상 사원).

조성민·이승무·전희나는 강남구 인턴십 지원금 대상이라 출근부가 따로 있다
(`gangnam-attendance-sheets` 스킬). 기본급이 그 출근부의 지급액과 같아야 한다.

## 하면 안 되는 것

- 근로자 부담분을 우리가 계산하지 않는다. 사이트 숫자를 그대로 옮긴다.
- 이어쓴 칸을 말없이 넘기지 않는다. 무엇을 이어썼는지 메일과 보고에 적는다.
- 승인 없이 발송하지 않는다. 초안까지 만들고 보고한다.
- 주민번호·계좌번호를 로그·위키·깃에 적지 않는다.
