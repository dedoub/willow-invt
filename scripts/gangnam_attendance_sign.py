#!/usr/bin/env python3
"""강남구 인턴십 출근부 PDF 의 담당 칸에 대표 서명을 얹는다.

  python3 scripts/gangnam_attendance_sign.py <입력.pdf> <출력.pdf> <왼쪽칸수> <오른쪽칸수> <시드> <서명폴더>

서명 표본은 저장소에 두지 않는다. 비공개 버킷 signatures/dw.kim/attendance/ 에 21장이
있으니 받아서 폴더로 넘긴다(공개 버킷에 두면 URL 만으로 누구나 가져간다).

필요한 것: pypdf, reportlab, pillow.
"""

import io, os, random, sys
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
from pdf_grid import segments

RIGHT_BAND = (490, 540)     # 오른쪽 표 담당 칸
LEFT_BAND = (237, 282)      # 왼쪽 표 담당 칸

def row_boxes(page, band):
    x0, x1 = band
    horz = [s for s in segments(page)
            if abs(s[1]-s[3]) < 0.7 and min(s[0], s[2]) <= x0+2 and max(s[0], s[2]) >= x1-2]
    ys = sorted({round(s[1], 1) for s in horz})
    ys = [y for y in ys if 130 < y < 700]           # 표 바깥의 쪽 테두리는 뺀다
    rows = [(a, b) for a, b in zip(ys, ys[1:]) if 15 < b - a < 40]
    if not rows:
        return []
    # 머리글 줄(확인/인턴·담당)은 날짜 줄보다 낮다. 줄 높이의 중앙값에서 벗어나는 줄은
    # 데이터 줄이 아니다 — 이걸 안 걸러서 서명이 한 칸씩 위로 밀렸다(2026-09-16).
    heights = sorted(b - a for a, b in rows)
    typical = heights[len(heights) // 2]
    rows = [(a, b) for a, b in rows if abs((b - a) - typical) < 1.5]
    rows.sort(key=lambda r: -r[0])                  # 위에서 아래로
    return rows

def stamp(src, dst, left_count, right_count, seed_key, samples):
    reader = PdfReader(src)
    writer = PdfWriter()
    for pno, page in enumerate(reader.pages):
        left = row_boxes(page, LEFT_BAND)[:left_count]
        right = row_boxes(page, RIGHT_BAND)[:right_count]
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(float(page.mediabox.width), float(page.mediabox.height)))
        for band, rows in ((LEFT_BAND, left), (RIGHT_BAND, right)):
            for i, (y0, y1) in enumerate(rows):
                rng = random.Random(f'{seed_key}|{pno}|{band[0]}|{i}')
                img = Image.open(rng.choice(samples)).convert('RGBA')
                cw, ch = band[1] - band[0], y1 - y0
                # 칸을 꽉 채우지 않는다. 손으로 쓴 서명은 칸 안에서 조금 남긴다.
                scale = min(cw * 0.78 / img.width, ch * 1.15 / img.height) * rng.uniform(0.94, 1.06)
                w, h = img.width * scale, img.height * scale
                cx = (band[0] + band[1]) / 2 + rng.uniform(-1.6, 1.6)
                cy = (y0 + y1) / 2 + rng.uniform(-1.2, 1.2)
                alpha = img.split()[3].point(lambda v: int(v * rng.uniform(0.82, 1.0)))
                img.putalpha(alpha)
                c.saveState()
                c.translate(cx, cy)
                c.rotate(rng.uniform(-2.0, 2.0))
                c.drawImage(ImageReader(img), -w/2, -h/2, w, h, mask='auto')
                c.restoreState()
        c.save(); buf.seek(0)
        page.merge_page(PdfReader(buf).pages[0])
        writer.add_page(page)
    with open(dst, 'wb') as f:
        writer.write(f)
    return len(left), len(right)


if __name__ == '__main__':
    import glob as _glob
    src_pdf, dst_pdf, left_n, right_n, seed, sig_dir = sys.argv[1:7]
    samples = sorted(_glob.glob(f'{sig_dir}/*.png'))
    if not samples:
        raise SystemExit(f'서명 표본이 없습니다: {sig_dir}')
    got = stamp(src_pdf, dst_pdf, int(left_n), int(right_n), seed, samples)
    print(f'찍은 칸 왼쪽 {got[0]} + 오른쪽 {got[1]} = {sum(got)}  → {dst_pdf}')
