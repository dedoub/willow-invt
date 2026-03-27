---
name: chunk-translation
description: 영문 텍스트를 청크별 줄바꿈 병렬 번역 CSV로 변환. "청크 번역", "chunk translation", "번역 CSV", "영어 한글 병렬" 시 사용.
metadata:
  bashPattern:
    - "chunk.*translat|translat.*csv"
  filePattern:
    - "**/chunk*translation*"
  priority: 5
---

# 영문 텍스트 → 청크별 줄바꿈 병렬 번역 CSV

## 트리거
- CEO가 영문 텍스트를 주고 "번역해서 CSV로", "청크별로 한글번역", "병렬 번역" 등 요청 시
- 영어-한국어 병렬 텍스트 CSV 생성 요청 시

## 출력 형식

### CSV 구조
- **컬럼**: `Question` (한글), `Answer` (영어)
- **인코딩**: UTF-8 with BOM (`\uFEFF` 접두) — 엑셀 한글 깨짐 방지
- **따옴표**: 모든 셀을 큰따옴표로 감쌈 (줄바꿈 포함 셀 보호)
- **1행 = 1문장**: 한 문장의 모든 청크가 하나의 셀 안에 줄바꿈으로 들어감
- **줄바꿈은 실제 newline 문자**: `\n` 리터럴(백슬래시+n) 절대 금지. CSV 셀 안에 실제 줄바꿈(0x0A)을 넣어야 엑셀에서 Alt+Enter로 보임
- **절대 금지**: 청크 하나를 개별 행으로 분리하는 것. 반드시 한 셀에 줄바꿈으로 묶을 것
- **용도**: 플래시카드(Anki 등) 임포트 — Question(한국어)=Front, Answer(영어)=Back

### 행 구성 규칙 (핵심!)
1. **한 행 = 한 문장** (마침표/물음표/느낌표로 끝나는 단위)
2. 한 문장 내에서 **의미 구절(phrase) 단위로 줄바꿈** (`\n`)
3. Question 셀의 줄바꿈 수 = Answer 셀의 줄바꿈 수 (1:1 대응)
4. 영어 원문의 줄바꿈 위치와 한글 번역의 줄바꿈 위치를 **대응**시킴

### 예시
```csv
"Question","Answer"
"이 과정은 반복되며
매 2분마다, 혹은 심지어 매 90초마다,
각 크레인은 시간당 30개에서 40개의 상자를 옮긴다
배에서 부두로.","The process is repeated
every two minutes, or even every ninety seconds,
each crane moving 30 or 40 boxes an hour
from ship to dock."
"그것이 혁명의 시작이었다.","Such was the beginning of a revolution."
```

### 엑셀에서 보이는 모습
| Question | Answer |
|----------|--------|
| 이 과정은 반복되며⏎매 2분마다...⏎각 크레인은... | The process is repeated⏎every two minutes...⏎each crane... |

→ 한 셀 안에서 Alt+Enter 줄바꿈처럼 보임. 행 수 = 문장 수.

## 번역 스타일

### 핵심 원칙
- **청크 N의 한국어 = 청크 N의 영어 직역** (위치 1:1 매칭 필수)
- 한국어 청크 순서를 영어 청크 순서와 동일하게 유지
- 한국어 어순으로 재배열 금지 — 영어 청크 순서 그대로 따라갈 것
- 각 청크 자체는 자연스러운 한국어 (조사, 어미 조정 OK)
- 전문 용어는 원어 병기 가능 (예: "컨테이너 크레인(stacking crane)")
- 고유명사는 원문 유지 (예: "Ideal-X", "Terry Malloy")
- 숫자/단위는 원문 기준 유지

### 좋은 예 vs 나쁜 예

| 영어 청크 | 나쁜 번역 (한국어 어순 재배열) | 좋은 번역 (영어 위치 1:1 매칭) |
|-----------|-------------------------------|-------------------------------|
| I tethered Frightful | 내가 호두나무로 가서 | 나는 프라이트풀을 |
| in the hickory tree | 주머니를 채우는 동안 | 히코리 나무에 묶어 두고 |
| while I went to the walnut tree | 프라이트풀을 히코리 나무에 | 호두나무로 가서 |
| and filled pouches. | 묶어 두었다. | 주머니를 채웠다. |

> 왼쪽(나쁜 예)은 한국어 어순으로 재배열해서 영어 청크 위치와 안 맞음.
> 오른쪽(좋은 예)은 각 청크가 영어와 같은 위치에서 같은 의미를 전달함.

## 분량이 많을 때
- 챕터/섹션 단위로 분할하여 **병렬 에이전트**로 처리
- 각 에이전트가 개별 CSV 생성 후, 최종적으로 하나의 통합 CSV로 병합
- 분량 때문에 거부하지 말 것 — 나눠서 처리

## 저장 경로
- 기본: 프로젝트 루트에 적절한 파일명으로 저장
- CEO가 파일명 지정 시 해당 이름 사용
- 여러 챕터일 경우 개별 파일 + 통합 파일(`*_all_chapters.csv`) 함께 생성

## 파일 전송
- 생성 후 자동으로 `send_file` 액션으로 텔레그램 전송
