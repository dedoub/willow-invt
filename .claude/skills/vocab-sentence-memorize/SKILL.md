---
name: vocab-sentence-memorize
description: 영어 단어장(워드리스트) 이미지를 단어별 예문 청크 번역 + 정의 메모 CSV로 변환. "단어 정리", "워드리스트", "단어장 번역", "단어 암기 CSV", "vocab CSV", "영단어 정리" 시 사용.
metadata:
  bashPattern:
    - "vocab.*csv|word.*list.*csv"
  filePattern:
    - "**/word_list*|**/vocab*"
  priority: 5
---

# 영단어 워드리스트 → 단어별 예문 암기 CSV

청크 번역(`chunk-translation`)의 변형. 단어 학습용 워드리스트(이미지)를 받아서 단어별 예문 1행 + 청크 번역 + 단어/정의 메모 CSV로 정리.

## 트리거
- CEO가 단어장/워드리스트 이미지를 보내며 "정리해줘", "암기 CSV로", "단어장 번역" 요청 시
- 영어 단어 학습 자료 (단어 + 발음기호 + 품사 + 영어 정의 + 예문) 이미지

## 입력 (이미지 한 항목 예시)
```
acre [éikər]
n. An acre is a unit for measuring area.    ← 정의문
They lived on a 150-acre farm.              ← 예문
```

## 출력 CSV 구조

### 컬럼 (3열)
- **A: Question** — 한글 청크 번역 (예문 기준, 영어 어순 1:1 매칭)
- **B: Answer** — 영어 예문 (정의문 제외, 의미 청크별 줄바꿈)
- **C: Key Word** — 단어(품사) + 영어 정의 (줄바꿈으로 단어와 정의 구분)

### 행 규칙
- **1행 = 1단어** (예문 1개만 사용. 정의문은 B열에서 제외하고 C열 메모로 보존)
- 한 셀에 청크는 실제 줄바꿈(0x0A)으로 분리 — `\n` 리터럴 금지
- 모든 셀을 큰따옴표로 감쌈
- UTF-8 with BOM (`﻿` 접두)

### C열 형식 (필수)
```
acre (n.)
An acre is a unit for measuring area.
```
- 첫 줄: `단어 (품사약어)` — 발음기호 제외, 품사는 괄호로
- 둘째 줄: 이미지의 영어 정의문 그대로
- 품사 약어: `n.` `v.` `adj.` `adv.` 등

### 예시 행
```csv
"Question","Answer","Key Word"
"그들은 살았다
150에이커의 농장에서.","They lived
on a 150-acre farm.","acre (n.)
An acre is a unit for measuring area."
"나는 믿는다
사후세계가 있다고.","I believe
that there is an afterlife.","afterlife (n.)
The afterlife is a life that some people believe begins when a person dies."
```

### 엑셀에서 보이는 모습
| Question | Answer | Key Word |
|----------|--------|----------|
| 그들은 살았다⏎150에이커의 농장에서. | They lived⏎on a 150-acre farm. | acre (n.)⏎An acre is a unit for measuring area. |

## 번역 원칙 (청크 번역과 동일)
- 영어 청크 N의 한국어 = 영어 청크 N의 직역 (위치 1:1 매칭 필수)
- 한국어 어순으로 재배열 금지
- 고유명사·숫자·단위는 원문 유지
- 각 청크 자체는 자연스러운 한국어 (조사·어미 조정 OK)

## 워크플로우
1. 이미지 Read 도구로 단어/품사/정의/예문 추출
2. 예문만 의미 청크로 분할 (정의문은 버리지 말고 C열로)
3. 한글 청크 번역 (영어 어순 1:1)
4. CSV 작성 (UTF-8 BOM, 따옴표, 실제 줄바꿈)
5. 여러 이미지면 같은 파일에 누적 (Edit 도구로 마지막 줄 뒤에 append)

## 분량이 많을 때
- 단원/페이지별로 받아도 같은 파일에 누적
- 분량으로 거부 금지 — 청크 번역 정책과 동일

## 저장 경로
- 기본: 프로젝트 루트 `word_list_*.csv` 또는 `vocab_*.csv`
- CEO가 파일명 지정 시 그 이름 사용

## 자주 나오는 헷갈림
| 헷갈림 | 정답 |
|--------|------|
| 정의문도 B열에 넣어야 하나? | 아니. B열은 예문만. 정의문은 C열 메모. |
| 발음기호는? | 제외. C열에 단어(품사)만. |
| 한 단어에 정의/예문 두 행으로? | 아니. 1단어 = 1행 (예문 한 개만). |
| 품사 표기 위치? | 단어 뒤 괄호: `acre (n.)` |
| 단어와 정의 사이 구분? | 줄바꿈. 슬래시(`/`) 아님. |
