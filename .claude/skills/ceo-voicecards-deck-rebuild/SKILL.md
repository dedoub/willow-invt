---
name: ceo-voicecards-deck-rebuild
description: CEO 보이스카드 덱(vcrd.quest/sweltering-risk-3)을 "청크 3바퀴 → 문장 카드" 모양으로 다시 세운다. "CEO 덱 업데이트", "보이스카드에 새로 추가한 문장도 청크3 + 문장으로", "덱 다시 세워줘", 영작연습에서 보이스카드 담기를 쓴 뒤 정리할 때 사용.
metadata:
  bashPattern:
    - "voicecards-sentence-cards"
  filePattern:
    - "scripts/voicecards-sentence-cards.ts"
  priority: 5
---

# CEO 보이스카드 덱 다시 세우기

영작연습(`/english`)의 **보이스카드 담기** 단추는 문장의 청크를 시트 끝에 한 바퀴만 붙인다.
덱이 쓰는 배치는 그게 아니라 **청크 3바퀴 → 그 문장 카드 1장**이다. 그래서 담은 뒤에는
한 번 다시 세워 줘야 한다.

```
c1 c2 c3 · c1 c2 c3 · c1 c2 c3 · [문장] · d1 d2 · d1 d2 · d1 d2 · [문장] · …
```

조각만 반복하면 조각은 익는데 문장이 안 익고, 한 바퀴만 돌리면 조각이 덜 익는다(CEO 2026-09-14).

## 대상

- 덱: `vcrd.quest/sweltering-risk-3`
- 스프레드시트 `1igjdCEgPeKDzcuYiDvHyct3bmE4KplsmJROwhvisrcs`, gid `1079541785`, 탭 `Voice Cards`
- 코드상의 출처는 `src/lib/english-targets.ts`의 `CEO_DECK` 하나다. 스크립트가 거기서 읽으므로
  ID를 스크립트에 옮겨 적지 않는다.
- 인증은 `.env.local`의 `GOOGLE_SA_JSON_B64` 서비스 계정. 이 문서에는 권한이 있다.

## 절차

```bash
npx tsx scripts/voicecards-sentence-cards.ts --dry   # 무엇이 바뀔지만 본다
npx tsx scripts/voicecards-sentence-cards.ts         # 시트에 쓴다
npx tsx scripts/voicecards-sentence-cards.ts --dry   # "이미 이 모양이다" 가 나와야 끝
```

1. `--dry` 로 먼저 돌린다. 문장 수·청크 수·총 행수와 문장별 첫 90자가 나온다.
2. **줄지 않는지 본다.** 아래 "쓰기가 아래를 지우지 않는다" 를 볼 것.
3. 쓴다.
4. `--dry` 를 한 번 더 돌려 `이미 이 모양이다 — 쓸 것이 없다` 를 확인한다. 이게 검증이다.
5. 바뀐 행수를 보고한다(예: 68행 → 90행, 문장 카드 4장 → 6장).

## 스크립트가 하는 일

매번 **바닥에서 다시 세운다.** 이미 놓인 것을 세어 예외로 넘기지 않는다 — 그렇게 하면
반복 횟수를 바꿀 때마다 셈이 어긋난다.

1. 문장 카드(셀 안에 줄바꿈이 있는 행)로 구간을 가른다. 카드 하나가 한 문장의 끝이다.
2. 구간 안은 같은 청크가 여러 바퀴 돌고 있으므로 **최소 주기**만 남긴다.
   몇 바퀴인지 세지 않는다 — 청크 6개를 두 바퀴 돌린 12줄과 청크 12개 한 바퀴는 겉이 같다.
3. 되찾은 한 바퀴를 `REPEATS`(현재 3)만큼 돌리고 문장 카드를 붙인다.

문장 경계는 **영어 청크의 끝 문장부호**(`.` `?` `!` + 닫는 따옴표)로 잡는다. 시트에 문장
번호가 없어서 이것이 유일한 단서다. 청크가 하나뿐인 문장은 카드를 만들지 않는다 — 방금
넘긴 카드와 글자 하나 다르지 않다.

반복 횟수를 바꾸려면 `scripts/voicecards-sentence-cards.ts` 의 `REPEATS` 하나만 고치고
다시 돌린다. 3→5 든 5→2 든 같은 자리에서 다시 선다.

## 알아 둘 것

**쓰기가 아래를 지우지 않는다.** `values.update` 는 A2부터 덮어쓸 뿐이라, 다시 세운 결과가
지금보다 **짧으면** 꼬리에 옛 행이 남는다. 지금까지는 늘 늘어나서 문제가 없었다.
`--dry` 의 총 행수가 현재 데이터 행수보다 작으면, 쓰기 전에 남는 구간을 지울 계획을 세운다.

**문장이 마침표로 끝나지 않으면 꼬리로 남는다.** 아직 안 끝난 문장으로 보고 반복도
카드도 붙이지 않는다. `--dry` 의 문장 수가 기대보다 하나 적으면 끝 청크의 문장부호를 본다.

**`scripts` 는 tsconfig 에서 빠져 있다.** `tsc --noEmit` 이 이 파일을 보지 않으므로,
스크립트를 고쳤으면 파일을 직접 가리켜 검사한다. 예전에 지운 변수를 참조한 채로 시트에
쓰기까지 성공하고 그 다음 줄에서 `ReferenceError` 가 난 적이 있다.

**기록 열은 건드리지 않는다.** 문장 카드 행의 Memo·Bookmark 등은 빈 칸으로 넣는다.
기존 청크 행의 기록은 그대로 따라간다.

## 다른 덱

이 스킬은 **CEO 덱 하나**다.

- 류하 덱(`RYUHA_DECK`)은 배치가 다르고 이 스크립트가 손대지 않는다.
- 스피치 원고 덱(`vcrd.quest/classy-epoxy-8`, 2026 KB English Presentation Contest)은 문단까지
  있는 다른 배치(청킹 2바퀴 → 문장, 문단 끝에 그 문단 문장 모음 + 문단, 마지막에 문단만
  한 바퀴)를 쓴다. `scripts/build-climate-drill.py` 로 CSV 를 만들고, **그 문서에는 서비스
  계정이 403 이라** 브라우저에서 붙여넣는다. 다른 일이다.
