"""PDF 본문 스트림을 훑어 표의 선을 페이지 좌표로 옮긴다.

선 좌표는 q/Q/cm 로 겹겹이 변환된 공간에 적혀 있다. 변환행렬을 스택으로 따라가지 않으면
같은 숫자가 전혀 다른 자리를 가리킨다(끝점 x 가 0 과 71 에만 몰려 나오던 이유).
"""
import re, sys
from pypdf import PdfReader

def mul(a, b):
    return (a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3],
            a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3],
            a[4]*b[0]+a[5]*b[2]+b[4], a[4]*b[1]+a[5]*b[3]+b[5])

def apply(m, x, y):
    return (m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5])

NUM = r'-?\d*\.?\d+'
TOKEN = re.compile(rf'({NUM})|([A-Za-z\'"*]+)|(<<|>>|\[|\]|/[^\s/\[\]<>()]*|\(|\))')

def segments(page):
    data = page.get_contents().get_data().decode('latin-1')
    ctm = (1, 0, 0, 1, 0, 0)
    stack, args, out = [], [], []
    cur = None
    for m in TOKEN.finditer(data):
        num, op, _ = m.groups()
        if num is not None:
            args.append(float(num)); continue
        if op is None:
            args = []; continue
        if op == 'q':
            stack.append(ctm)
        elif op == 'Q':
            if stack: ctm = stack.pop()
        elif op == 'cm' and len(args) >= 6:
            ctm = mul(tuple(args[-6:]), ctm)
        elif op == 'm' and len(args) >= 2:
            cur = apply(ctm, args[-2], args[-1])
        elif op == 'l' and len(args) >= 2 and cur is not None:
            nxt = apply(ctm, args[-2], args[-1])
            out.append((*cur, *nxt)); cur = nxt
        elif op == 're' and len(args) >= 4:
            x, y, w, h = args[-4:]
            p = [apply(ctm, x, y), apply(ctm, x+w, y), apply(ctm, x+w, y+h), apply(ctm, x, y+h)]
            for i in range(4):
                out.append((*p[i], *p[(i+1) % 4]))
        args = []
    return out

if __name__ == '__main__':
    page = PdfReader(sys.argv[1]).pages[int(sys.argv[2]) if len(sys.argv) > 2 else 0]
    segs = segments(page)
    vert = [s for s in segs if abs(s[0]-s[2]) < 0.7 and abs(s[1]-s[3]) > 5]
    horz = [s for s in segs if abs(s[1]-s[3]) < 0.7 and abs(s[0]-s[2]) > 5]
    print(f'선 {len(segs)}  세로 {len(vert)}  가로 {len(horz)}')
    xs = sorted({round(s[0]) for s in vert})
    print('세로선 x:', xs)
    ys = sorted({round(s[1]) for s in horz})
    print('가로선 y:', ys)
