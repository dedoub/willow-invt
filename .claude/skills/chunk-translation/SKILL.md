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
- **1행 = 1문장**: 한 문장의 모든 청크가 하나의 셀 안에 줄바꿈(`\n`)으로 들어감
- **절대 금지**: 청크 하나를 개별 행으로 분리하는 것. 반드시 한 셀에 줄바꿈으로 묶을 것

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
- **각 청크가 독립적으로 자연스러운 한국어**여야 함
- 영어 어순 직역 금지 — 한국어 어순으로 재구성
- 한국어 청크 순서가 영어와 달라도 OK — **의미 대응만 정확하면 됨**
- 전문 용어는 원어 병기 가능 (예: "컨테이너 크레인(stacking crane)")
- 고유명사는 원문 유지 (예: "Ideal-X", "Terry Malloy")
- 숫자/단위는 원문 기준 유지

### 좋은 예 vs 나쁜 예

| 영어 | 나쁜 번역 (직역) | 좋은 번역 (자연스러운 한국어) |
|------|------------------|------------------------------|
| The process is repeated | 이 과정은 반복된다 | 이 과정은 반복되며 |
| every two minutes | 매 2분마다 | 매 2분마다, 혹은 심지어 매 90초마다 |
| each crane moving 30 boxes an hour | 각 크레인이 30개의 상자를 이동시키며 한 시간에 | 각 크레인은 시간당 30~40개의 상자를 옮긴다 |
| from ship to dock | 배로부터 부두로 | 배에서 부두로 |

| 영어 | 나쁜 번역 (영어 어순 그대로) | 좋은 번역 (한국어 어순) |
|------|----------------------------|------------------------|
| It was a sight that | 그것은 광경이었다 | ~하는 광경이 |
| would have astounded | 놀라게 했을 것이다 | ~을 놀라게 했을 것이다 |
| anyone familiar with the docks | 부두에 익숙한 누구라도 | 부두를 잘 아는 사람이라면 누구라도 |

## 저장 경로
- 기본: 프로젝트 루트에 적절한 파일명으로 저장
- CEO가 파일명 지정 시 해당 이름 사용

## 파일 전송
- 생성 후 자동으로 `send_file` 액션으로 텔레그램 전송
