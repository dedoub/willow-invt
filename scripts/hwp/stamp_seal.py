"""신청서 PDF 의 서명 줄 이름("김 철 형") 오른쪽에 법인인감을 얹는다. 위치는 8월 제출본에서 잰 이름 대비 자리.
  python stamp_seal.py 입력.pdf 인감.png 출력.pdf
"""
import io, subprocess, sys, re
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

src, seal, dst = sys.argv[1:4]
# 서명 줄의 "형" 글자(아래쪽 것 = 서명 칸) 위치를 읽는다
xml = subprocess.run(['pdftotext', '-bbox', src, '-'], capture_output=True, text=True, check=True).stdout
words = [(float(a), float(b), float(c), float(d)) for a, b, c, d in
         re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">형</word>', xml)]
if len(words) < 2:
    sys.exit('서명 줄의 "형" 을 찾지 못했어요')
x0, y0, x1, y1 = max(words, key=lambda w: w[1])       # 가장 아래 줄
reader = PdfReader(src); page = reader.pages[0]
H = float(page.mediabox.height)
# 8월 제출본: 인감 57.45×60.89pt, 중심은 "형" 오른쪽 끝에서 +38.5pt, 이름 줄 아래끝에서 +3.2pt 위
w = 57.45
cx, cy = x1 + 38.5, (H - y1) + 3.2
buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=(float(page.mediabox.width), H))
c.drawImage(seal, cx - w / 2, cy - w / 2, width=w, height=w, mask='auto', preserveAspectRatio=True)
c.save(); buf.seek(0)
page.merge_page(PdfReader(buf).pages[0])
out = PdfWriter(); out.add_page(page)
out.add_metadata({'/Title': '정규직 전환 지원금 신청서'})
with open(dst, 'wb') as fh: out.write(fh)
print(f'인감 중심 ({cx:.1f}, {cy:.1f})pt → {dst}')
