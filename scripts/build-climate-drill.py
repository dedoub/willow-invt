# -*- coding: utf-8 -*-
"""
기후/날씨 스피치 — 반복 훈련 배열.

CEO 가 정한 차례(2026-09-14):
    문장마다  청크 ×2 → 문장 카드
    문단 끝    그 문단의 문장 카드를 한 번씩 → 문단 카드
    전체 끝    문단 카드를 한 번씩

좁은 데서 넓은 데로 올라간다. 조각을 두 바퀴 돌려 익히고 문장으로 묶고, 문단이 끝나면
그 문단의 문장들만 한 줄로 훑고 문단으로 묶고, 마지막에 문단만 훑는다.

청크가 하나뿐인 문장은 따로 문장 카드를 두지 않는다 — 방금 넘긴 카드와 글자 하나 다르지
않아서다. 다만 문단 끝 훑기에는 그 문장도 자기 자리로 들어간다.

문단 구조는 build-climate-csv.py 의 DOC 을 그대로 쓴다.
"""
import csv
import runpy

CHUNK_PASSES = 2

# 문단 구조(DOC)는 원본 빌더에 있다. 그 파일이 제 CSV 도 같이 쓰지만 무해하다.
ns = runpy.run_path('tmp/build-climate-csv.py', run_name='__not_main__')
DOC = ns['DOC']


def joined(chunks):
    """청크들을 한 셀에 실제 줄바꿈으로 묶는다. 한글·영어 줄 수가 1:1로 맞는다."""
    return ("\n".join(ko for ko, _ in chunks), "\n".join(en for _, en in chunks))


def build(doc, passes=CHUNK_PASSES):
    rows = []
    para_cards = []
    for para in doc:
        sent_cards = []
        for sent in para:
            for _ in range(passes):
                rows.extend(sent)
            card = joined(sent) if len(sent) > 1 else sent[0]
            # 청크 하나짜리 문장은 방금 두 번 지나갔다. 또 놓으면 같은 카드가 세 번 연속이다.
            if len(sent) > 1:
                rows.append(card)
            sent_cards.append(card)
        rows.extend(sent_cards)                       # 문단 끝 — 문장만 한 번씩
        pcard = joined([c for s in para for c in s])
        rows.append(pcard)                            # 문단 카드
        para_cards.append(pcard)
    rows.extend(para_cards)                           # 전체 끝 — 문단만 한 번씩
    return rows, para_cards


def write_csv(path, rows):
    # UTF-8 BOM — 엑셀·시트에서 한글이 깨지지 않게. 모든 셀은 따옴표로 감싼다.
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
        w.writerow(["Question", "Answer"])
        w.writerows(rows)


rows, para_cards = build(DOC)
write_csv("output/climate-weather-drill.csv", rows)

sentences = [s for p in DOC for s in p]
chunks = sum(len(s) for s in sentences)
singles = sum(1 for s in sentences if len(s) == 1)
expected = (chunks * CHUNK_PASSES) + (len(sentences) - singles) + len(sentences) + len(DOC) * 2

print(f"문단 {len(DOC)} · 문장 {len(sentences)} · 청크 {chunks} (청크 1개짜리 {singles}문장)")
print(f"청크 {CHUNK_PASSES}바퀴 {chunks * CHUNK_PASSES} + 문장 카드 {len(sentences) - singles}"
      f" + 문단끝 훑기 {len(sentences)} + 문단 카드 {len(DOC)} + 마지막 훑기 {len(DOC)}")
print(f"합계 {len(rows)}행 (기대 {expected})")
assert len(rows) == expected, "행 수가 셈과 다르다"

# 자가검증 — 줄 수가 어긋난 카드가 있으면 청크 짝이 깨진 것이다
bad = [en[:40] for ko, en in rows if ko.count("\n") != en.count("\n")]
print("줄 수 검증:", "통과" if not bad else bad[:3])
