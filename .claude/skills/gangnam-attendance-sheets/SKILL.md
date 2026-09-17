---
name: gangnam-attendance-sheets
description: Use when preparing, signing or sending the Gangnam internship attendance sheets (출근부) for Tensoftworks interns — building the monthly HWP/PDF forms, stamping the 담당 signature, or mailing each intern their sheet. Trigger on "출근부 준비", "출근부 만들어", "출근부 보내", "출근부 서명", "강남구 출근부".
---

# 강남구 인턴십 출근부

강남구상공회 중소기업 인턴십 지원금 신청에 붙는 출근부다. 대상은 조성민·이승무·전희나 세 명.
지원금 신청 자체는 `tensw-internship-subsidy-application` 스킬이 맡는다. 여기는 그 앞 단계다.

## 파일은 전부 서버에 있다

로컬 폴더에 기대지 않는다. 그 폴더가 사라진 달에 조용히 멈춘다.

| 무엇 | 자리 |
|---|---|
| 출근부(서명본) | 비공개 버킷 `tensw-attendance/2026/signed/2026-MM_{cho,lee,jeon}.pdf` |
| 출근부(미서명) | `tensw-attendance/2026/plain/…` |
| HWP 원본·월별 PDF | `tensw-attendance/2026/source/2026-MM.{hwp,pdf}` |
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
node scripts/gangnam-attendance-send.mjs --send          # 실제 발송
```

발신 `dw.kim@tensoftworks.com`, 참조 `ch.kim@tsw.im`, 회신도 발신 주소로 받는다.
**기본은 초안까지만.** 실제 발송은 CEO 승인 뒤 `--send`.

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
