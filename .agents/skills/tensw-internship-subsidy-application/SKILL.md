---
name: tensw-internship-subsidy-application
description: Use when preparing Tensoftworks Gangnam internship subsidy applications end to end — the 서식 13 application (HWP→PDF with the corporate seal), the 서식 9 attendance sheets the interns sign, the Woori Bank salary-transfer confirmation, the 4대보험 사업장 가입자 명부, the five-file cross-check and the submission email draft. Trigger on "인턴십 지원금 신청", "강남구 지원금", "지원금 서류 준비", "지원금 신청서", "지원금 메일 초안", "가입자 명부", "이체확인증".
---

# 텐소프트웍스 강남구 인턴십 지원금 신청

매달 15일까지 전월분을 강남구상공회(`gnk@gngucci.or.kr`)에 낸다. 대상은 정규직으로 전환된
조성민·이승무·전희나 3명이라 **서식 13(정규직 전환 지원금 신청서)**을 쓴다. 서식 12(인턴 지원금)는
전환 전 인턴용이다. 안내 메일이 "서식12 또는 서식13"을 나란히 적어도 헷갈리지 말 것.

실제 발송은 CEO 승인 뒤에만 한다. 출근부 회신 요청도, 기관 제출도 초안까지 만들고 보고한다.

## 하면 안 되는 것 (2026-09-30 사고에서 나온 규칙)

- **남이 서명한 칸을 다른 서식에 옮겨 붙이지 않는다.** 인턴이 서식 8에 서명해 보냈는데 기관이 서식 9를
  요구하면, 서식 9를 새로 만들어 **다시 서명받는다.** 서명 이미지를 잘라 새 서식에 얹은 출근부는 위조다.
- **한컴 창을 화면 조작으로 편집하지 않는다.** 맥용 한컴은 AppleScript로 문서를 조작할 수 없다. 화면
  조작으로 고치려던 에이전트는 빈 양식을 "정본"으로 복사하거나 PDF 위에 글자를 덮어써 엉터리 서류를 냈다.
  HWP는 `scripts/hwp/hwp.mjs`로 파일을 직접 고치고, 한컴은 메뉴 "PDF로 저장하기"에만 쓴다.
- **PDF 위에 글자를 덮어쓰지 않는다**(pypdf 오버레이). 글자 크기·위치가 어긋난다.
- 인감은 HWP에 넣지 않는다. **PDF로 바꾼 뒤 얹는다**(투명 배경이 산다).
- 월이 다른 자료, 서명 누락 자료, 합계가 다른 자료를 임의로 보정하지 않는다.
- 비밀번호·공동인증서 정보·주민번호를 문서·메일 본문·위키·로그·깃에 적지 않는다.

## 한눈에

| 서류 | 만드는 법 | 결과 |
|---|---|---|
| 1. 신청서(서식 13) | `node scripts/gangnam-subsidy-build.mjs application --month YYYY-MM` | `tmp/…/YYYY-MM/07-final-submission/1_…신청_YYYYMM.{hwp,pdf}` (인감 포함) |
| 2. 출근부(서식 9) 3장 | `… attendance --month YYYY-MM` → 인턴에게 보내 서명받음 | 버킷 `tensw-attendance/YYYY/signed/YYYY-MM_{cho,lee,jeon}.pdf` → 인턴 서명본 회신 |
| 3. 급여명세서 3장 | 급여 스킬(`tensw-monthly-payroll`)이 만든 것 | `tmp/…/04-payslips/` |
| 4. 4대보험 사업장 가입자 명부 | 4insure 로그인 → 발급 → 크롬 인쇄 PDF | 발급번호·발급시각을 기록 |
| 5. 급여이체확인증 | 우리은행 기업뱅킹 → 이체확인증 → PDF | 이름별 이체금액 = 출근부 지급액 |

작업 폴더는 `tmp/tensw-internship-subsidy/YYYY/YYYY-MM/`(깃에서 뺐다 — 주민번호·급여·서명).
`01-guidance`(기관 안내·양식) · `02-previous-submission`(직전 제출본) · `03-attendance-received`(인턴 회신) ·
`04-payslips` · `05-insurance` · `06-draft-submission` · `07-final-submission`.

## 값은 어디서 오나 (손으로 옮기지 않는다)

| 값 | 원천 |
|---|---|
| 대상자·주민번호·전환일·기본급 | 비공개 버킷 `tensw-attendance/config/subsidy-roster.json` (사람·급여가 바뀌면 여기만) |
| 기관 양식(서식 9·12·13) | `tensw-attendance/forms/2026-gangnam-internship-forms.hwp` (새 양식이 오면 교체) |
| 근무일·말일·지급일 | `scripts/lib/kr_workdays.py` |
| 출근부 지급액(실지급액=차인지급액) | 우리은행 급여이체확인 PDF의 이름별 이체금액 |
| 기본급 대조 | 그 달 급여명세서 — 명부와 다르면 스크립트가 멈춘다 |
| 인감 | 법인 서류함 `TS-DOC-2026-003` |
| 담당 서명 | 비공개 버킷 `signatures/dw.kim/attendance/sig_01~21.png` |

신청서 고정값: 사업장 ㈜텐소프트웍스 · 대표 김 철 형 · 828-88-00992 · 소재지 "서울특별시 강남구 /
봉은사로105길54-5, 402호"(8월 제출본과 같게, CEO) · 담당자(연락처는 명부 `contact`) · 계좌 신한 140-013-150883 ·
1인 150만원 · 신청일은 그 달 말일.

## 순서

1. **안내 확인.** 기관의 그 달 안내 메일(`01-guidance`)에서 서식 번호·지급액 기재 방식·마감을 확인한다.
   2026년 9월분(10월 제출)부터: 출근부 **서식 9**, 지급액 **실지급액(차인지급액)**.
2. **급여 지급 뒤 이체확인증**(아래 절). 실지급액이 여기서 나온다.
3. **출근부 만들기·보내기.**
   ```bash
   node scripts/gangnam-subsidy-build.mjs attendance --month 2026-10
   node scripts/gangnam-attendance-send.mjs --month 2026-10            # 초안 → 승인 뒤 --send
   ```
   서식 8과 같은 날짜 표기("10    1", "     2" …). 출근 표시·일수·인턴 확인·수령확인은 **비워 둔다**(인턴 자필).
   담당 칸만 대표 서명 표본으로 채운다. 인턴 회신은 `03-attendance-received`에 모은다.
4. **신청서.** `node scripts/gangnam-subsidy-build.mjs application --month 2026-10`
   한 장이 아니거나 회색 글자가 남으면 스크립트가 멈춘다. 결과 PDF를 직전 달 제출본과 나란히 놓고 본다.
5. **가입자 명부**(아래 절).
6. **5종 교차검증** — 대상자 수·이름, 대상 월, 지급일, 명세서·이체확인·출근부 금액, 신청금액 합계(1인 150만원×인원),
   서명·직인, PDF 열림. 하나라도 틀리면 제출 초안을 만들지 않는다.
7. **제출 메일 초안** — 받는 사람 `gnk@gngucci.or.kr`(최신 기관 메일로 재확인), 발신은 Gmail에 연결된 실제 계정.
   제목 `[텐소프트웍스] YYYY년 M월 강남구 인턴십 지원금 신청`. 본문: 대상 월·인원·총 신청금액·첨부 5종·담당자.
   첨부 순서 1 신청서 · 2 출근부(3명 병합) · 3 급여명세서(병합) · 4 가입자 명부 · 5 이체확인증(병합).
8. **위키**(`tensw-mgmt` / 재무)에 그 달 노트를 남기고 첨부는 비공개 버킷 링크(`/api/files/…`)로.

## 서식이 바뀌어 다시 서명받을 때

```bash
node scripts/gangnam-subsidy-build.mjs attendance --month 2026-09 --key-suffix _form9
node scripts/gangnam-attendance-send.mjs --month 2026-09 --key-suffix _form9 --resign \
  --due 2026-10-01 --due-label "오늘 10월 1일(목)"
```

`--resign`은 새 메일이 아니라 **인턴의 최신 회신 스레드에 답장**으로 만든다. 본문은 CEO가 정한 두 문장.
이미 보낸 서식의 서명본은 덮어쓰지 않도록 `--key-suffix`로 다른 이름을 쓴다.

## 급여이체확인증 (우리은행 기업뱅킹, 크롬)

급여 지급 뒤. 화면 캡처가 아니라 **은행 발급 PDF**를 쓴다. 로그인된 크롬 탭을 `scripts/lib/desktop.mjs`
(`chromeJavascript`, `openChromeTab`)로 다룬다.

1. 급여이체 내역 `https://nbi.wooribank.com/nbi/woori?withyou=BITRS0038` → 그 달 급여 건(대상자 수만큼) 선택.
2. `이체확인증`(id `tranConfirmMulti`) → 확인 창 "예" → "확인증 인쇄" → 보고서 창의 PDF 단추(`reportViewerIfr` 안 `pdf_button`).
3. `~/Downloads`에 새로 생긴 PDF를 `06-draft-submission/5_우리은행_급여이체확인_YYYYMM_3명.pdf`로 옮긴다.
4. 수취인·지급일·금액을 급여대장·명세서와 대조. 합계가 이체 총액과 같아야 한다.

## 4대보험 사업장 가입자 명부 (4insure, 크롬)

2026-09-30 이 순서로 발급했다(발급번호 20260930668385). 크롬 탭은 `scripts/lib/desktop.mjs`로 다룬다.

1. `https://www.4insure.or.kr/pbiz/mjon/processIdPswdLgnView.do` → **"브라우저 인증"**(`#btnCertLgn2`, CEO 지정).
   인증서 위치 `#xwup_media_localstorage`(브라우저) → 목록에서 **"텐소프트웍스"가 든 한 줄만** 고른다
   (범용기업 / 한국무역정보통신). 두 줄 이상이거나 없으면 멈춘다.
2. 암호는 `tensw-local-finance.mjs`의 `readCertificatePassword()`(텐소 키체인)로 **붙여넣고**, 가림 글자 수가
   암호 길이와 같을 때만 `#xwup_OkButton`을 **한 번** 누른다. 거부되면 재시도하지 말고 보고(5회면 잠김).
3. 증명서발급 → "증명서(가입내역확인_사업장,전체가입자) 신청/발급"(`/pbiz/cert/insertBplcCerfAplyAncView.do`)
   → 안내 "확인" → 사업장 가입자 명부 · 확인용 · 주민등록순(기본값) → "신청".
4. 네 기관(국민연금·건강·산재·고용)이 모두 **출력가능**이 될 때까지 새로고침(보통 1분 안).
   상태는 표 칸에서 읽는다 — 페이지의 절차 안내에도 같은 낱말이 있어 본문 전체를 세면 틀린다.
5. **출력은 1회뿐.** "출력"(`#btnPrint`)은 보고서 창을 팝업으로 연다 — 스크립트 `click()`은 크롬 팝업 차단에
   걸린다. `chromeElementRect`로 자리를 잡아 **실제 마우스 클릭**(`clickSettled`)으로 누른다.
6. 보고서 창(`/report/reportMarkanyPop.jsp`) → PRINT → 인쇄방식 **pdf**·전체 → "인쇄" → 크롬 미리보기
   "PDF로 저장" → "저장" → 저장 창에서 ⌘⇧G 로 `~/Downloads` 붙여넣기 → Return 두 번. 파일은 `Report.pdf`.
7. `06-draft-submission/4_4대사회보험_사업장가입자명부_YYYYMMDD.pdf`로 옮기고 발급번호·발급시각을 기록.
   대상자 3명의 네 보험 취득일이 모두 있는지 본다.

## HWP 도구 (`scripts/hwp/hwp.mjs`)

```bash
node scripts/hwp/hwp.mjs dump   양식.hwp                  # 칸 주소(r행c열)와 글자 — 새 양식이 오면 먼저 본다
node scripts/hwp/hwp.mjs fill   양식.hwp 출력.hwp 값.tsv --form "서식 13" --money r10c12 --skip r0c0,r18c0
node scripts/hwp/hwp.mjs colors 출력.hwp                  # 회색으로 남은 양식 예시 글자
node scripts/hwp/hwp.mjs pdf    출력.hwp 출력.pdf          # 한컴 "PDF로 저장하기"(저장 위치 ~/hwp-export)
python3 scripts/hwp/stamp_seal.py 입력.pdf 인감.png 출력.pdf   # 서명 줄 "형" 오른쪽에 인감(8월 위치)
```

덫:
- 양식의 예시 글자(회색)는 위치별 글자모양이 남아 새 글자 일부가 회색이 된다 — `fill`이 가장 진한 모양으로 합친다.
- 오른쪽 정렬 문단의 뒤 빈칸(전각 포함)은 무시된다. 인감 자리는 문단 오른쪽 여백(`--sign-right-margin`)으로 만든다.
- 줄 배치 정보(lineseg)를 통째로 지우고 문단까지 지우면 파일이 깨진다 — 첫 줄 하나로 줄여 둔다.
- 서식을 떼어낼 때 새 마지막 문단에 "구역 마지막" 표시를 다시 단다(빠지면 한글이 손상 파일로 거부).
- 한 칸에 두 줄을 넣으면 줄 간격이 칸마다 달라 보인다 — `fill`이 입력 칸을 가운데·100%로 맞춘다(금액은 오른쪽).
- 외장 exFAT의 `._` 파일은 PDF가 아니다.

## 완료 보고

신청 월·마감·대상자, 5종 확보 상태, 교차검증 결과, 파일 경로, 메일 수신자·제목·첨부, 발송 전 승인 필요 여부.
승인 전에는 "발송 완료"라고 쓰지 않는다. 발송 뒤에는 발송 메일과 접수 회신을 같은 월 폴더에 둔다.
