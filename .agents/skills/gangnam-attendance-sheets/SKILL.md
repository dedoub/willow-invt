---
name: gangnam-attendance-sheets
description: Use when preparing, signing or sending the Gangnam internship attendance sheets (출근부) for Tensoftworks interns — building the monthly HWP/PDF forms, stamping the 담당 signature, or mailing each intern their sheet. Trigger on "출근부 준비", "출근부 만들어", "출근부 보내", "출근부 서명", "강남구 출근부".
---

# 강남구 인턴십 출근부

강남구상공회 중소기업 인턴십 지원금 신청에 붙는 출근부다. 대상은 조성민·이승무·전희나 세 명.
지원금 신청 자체는 `tensw-internship-subsidy-application` 스킬이 맡는다. 여기는 그 앞 단계다.

## 2026년 9월분부터 서식 9 (CEO 2026-09-30)

기관이 출근부를 **[서식 9]**로 받고 지급액을 **실지급액(차인지급액)**으로 쓰라고 안내했다. 출근부는 이제
`scripts/gangnam-subsidy-build.mjs attendance`가 만든다(기관 양식 HWP를 `scripts/hwp/hwp.mjs`로 직접 채우고
한컴 "PDF로 저장하기" → 담당 칸 서명). 실지급액은 우리은행 급여이체확인 PDF에서 읽으므로 **급여 이체 뒤**에 만든다.

```bash
node scripts/gangnam-subsidy-build.mjs attendance --month 2026-10 --leave lee:14,jeon:10+11   # 연차일(인턴 회신 원본으로 확인)
node scripts/gangnam-attendance-send.mjs --month 2026-10            # 초안 → 승인 뒤 --send
```

- **달력의 모든 날짜를 적는다**(CEO 2026-10-01). 날마다 출근 칸에 `○`(근무)·`연차`·공휴일 이름(`추석` 등)·`토요일휴무`·
  `주휴무일`(일요일)을 가운데 정렬로 적고, 상단 `출근 : N일, 결근 : N일, 유급휴일 : N일`도 채운다.
  유급휴일 = 주휴일(일요일) + 법정공휴일(토요일에 겹친 날은 빼고 "토요일(추석)"처럼 적는다) + 본인 연차. 공휴일은 `scripts/lib/kr_workdays.py` 가 정본이다
  (설·추석은 일요일에 겹칠 때만 대체공휴일 — 2026-09-28 을 휴일로 잘못 넣었던 일이 있다).
- 인턴 확인·수령확인은 **비워 둔다**(인턴 본인 서명). 담당 서명은 근무일 줄에만 찍는다. 빨간 "자필서명" 안내 글자는 지운다.
- **서명을 옮겨 붙이지 않는다.** 서식이 바뀌면 새 서식을 보내 다시 서명받는다(`--resign`, 아래). 2026-09에
  서식 8 서명본을 잘라 서식 9에 얹은 출근부가 만들어졌다 — 위조라 폐기했다.
- 서식이 바뀌어 다시 받을 때: `… attendance --month M --key-suffix _form9` 뒤
  `gangnam-attendance-send.mjs --month M --key-suffix _form9 --resign --due YYYY-MM-DD [--due-label "오늘 10월 1일(목)"]`
  — 인턴의 최신 회신 스레드에 **답장**으로 초안을 만든다.

## 파일은 전부 서버에 있다

로컬 폴더에 기대지 않는다. 그 폴더가 사라진 달에 조용히 멈춘다.

| 무엇 | 자리 |
|---|---|
| 출근부(서명본) | 비공개 버킷 `tensw-attendance/2026/signed/2026-MM_{cho,lee,jeon}.pdf` |
| 출근부(미서명) | `tensw-attendance/2026/plain/…` |
| HWP 원본·월별 PDF | `tensw-attendance/2026/source/2026-MM.{hwp,pdf}` (서식 8, ~2026-09) · `…/source/2026-MM_form9_{code}.hwp` (서식 9) |
| 기관 양식(서식 9·12·13) · 대상자 명부 | `tensw-attendance/forms/2026-gangnam-internship-forms.hwp` · `tensw-attendance/config/subsidy-roster.json` |
| 대표 서명 표본 21장 | 비공개 버킷 `signatures/dw.kim/attendance/sig_NN.png` |
| 설명·경위 | 업무위키 `tensw-mgmt` / 재무 / "강남구 인턴십 출근부 2026년 9~12월" |

서명이 든 파일이라 **비공개** 버킷이다. 위키 첨부는 공개 버킷이라 URL 만 알면 열린다.
스토리지 키는 아스키만 받는다 — 사람은 코드(cho/lee/jeon)로, 한글 파일명은 내려받을 때 되살린다.

## 매달 자동으로 도는 것

마지막 영업일에 각자에게 그 달 출근부를 보내고, 다음 달 5일까지 회신받는다
(5일이 주말·공휴일이면 다음 영업일). launchd `com.tensw.gangnam-attendance-send` 가
매일 17시에 부르고, 스크립트가 오늘이 그날인지 가린다 — launchd 로는 "마지막 영업일"을
표현할 수 없다.

```bash
node scripts/gangnam-attendance-send.mjs                 # 이번 달, 초안만
node scripts/gangnam-attendance-send.mjs --month 2026-10 # 달 지정
node scripts/gangnam-attendance-send.mjs --notify        # 초안 만들고 CEO 봇에 물어봄
node scripts/gangnam-attendance-send.mjs --send          # 실제 발송
```

발신 `dw.kim@tensoftworks.com`, 참조 `ch.kim@tsw.im`, 회신도 발신 주소로 받는다.

**자동으로 보내지 않는다.** 예약 실행은 초안을 만들고 `--notify` 로 윌리(CEO 봇)에게
"보낼까요?" 를 묻는다. CEO가 보내라고 하면 그때 `--send` 로 다시 부른다.
발송일은 CEO 캘린더(`dw.kim@willowinvt.com`)에도 등록돼 있다.

## 서명 다시 얹기

```bash
python3 scripts/gangnam_attendance_sign.py 입력.pdf 출력.pdf 왼쪽칸수 오른쪽칸수 "이름|2026-09" 서명폴더
```

파이썬은 `~/.willow/venv/bin/python` 을 쓴다(pypdf·reportlab·pillow·korean_lunar_calendar).
칸 자리는 좌표를 박지 않고 **PDF 안의 표 선에서 직접 읽는다.** 시드가 `이름|연-월` 이라
같은 달을 다시 뽑으면 바이트까지 같은 그림이 나온다.

월별 칸 배분은 `scripts/lib/kr_workdays.py` 가 준다(왼쪽 최대 10칸, 나머지가 오른쪽).

## 달력은 한 곳에서만

`scripts/lib/kr_workdays.py` 하나가 근무일·공휴일·지급일·발송일·회신기한을 모두 준다.
출근부와 메일이 따로 계산하면 언젠가 갈린다. 2026년이 당장 그런 해다 — 추석이 토요일과
겹쳐 **9월 28일(월)이 대체공휴일**이고, 이걸 놓치면 9월 근무일이 19일이 아니라 20일이 된다.

지급일은 매월 25일, 주말·공휴일이면 직전 영업일로 당긴다.

## 덫

- **머리글 줄을 데이터 줄로 세지 말 것.** 확인·인턴·담당 머리글은 17pt, 날짜 줄은 24pt다.
  줄 높이 중앙값에서 벗어나는 줄을 빼야 서명이 한 칸씩 위로 밀리지 않는다.
- **표 선을 읽을 땐 `q/Q/cm` 스택까지 따라갈 것.** 변환을 무시하면 같은 숫자가 전혀 다른
  자리를 가리켜, 선 끝이 전부 x=0 과 x=71 에만 몰려 나온다.
- **날짜는 로컬로 읽을 것.** `toISOString` 은 UTC 라 한국 시간 새벽에 하루 어긋난다.
- **HWP 를 바이트로 고칠 땐 글자 수를 바꾸지 말 것.** 길이가 바뀌면 레코드 크기·문단 글자수·
  글자모양 위치까지 따라 고쳐야 한다. 빈자리는 공백으로 메우면 화면은 같고 구조는 그대로다.
  쪽을 떼어내는 것도 하지 말 것 — 구역 마지막 문단 표시(`nChars` 최상위 비트)가 사라져
  한글이 "파일이 손상되었습니다"로 거부한다.
- **2026년 12월은 근무일이 22일인데 서식의 날짜 칸은 21개다.** 지금 파일은 한글에서 줄을
  하나 넣고 여백을 위 8mm·아래 6mm 로 줄여 한 장에 담았다. 그 탓에 왼쪽 표 머리글 밑에
  빈 줄이 하나 있고 12월만 여백이 다르다. 날짜는 22일 모두 들어 있다.

## 하면 안 되는 것

- 서명 표본과 서명본을 공개 버킷에 두지 않는다.
- 승인 없이 발송하지 않는다. 초안까지만 만들고 보고한다.
- 근무일·지급일을 손으로 세지 않는다. `kr_workdays.py` 를 부른다.
