"""급여명세서 PDF 를 직접 그린다.

LibreOffice 는 이 맥에서 한글 글리프를 한 자도 못 그린다. 텍스트 레이어에는 한글이 들어가서
pdftotext 로는 멀쩡해 보이지만, PDF 에 박히는 폰트는 LinuxLibertine 뿐이라 화면·인쇄에는
아무것도 안 나온다(샌드박스 문제가 아니라 LibreOffice 가 CJK 폰트를 못 잡는다).

그래서 워드 문서는 편집용으로 두고, 보낼 PDF 는 여기서 폰트를 직접 박아 그린다.
서식은 scripts/lib/payslip_docx.py 와 같은 인자를 받아 같은 모양으로 그린다.
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from payslip_docx import PAY_LABELS, DEDUCT_LABELS

FONT_FILE = '/System/Library/Fonts/Supplemental/AppleGothic.ttf'
FONT = 'PayslipKR'
HEAD_FILL = colors.HexColor('#DCE6F1')
LINE = colors.HexColor('#BFBFBF')
TITLE_COLOR = colors.HexColor('#1F497D')

_registered = False


def _font():
    global _registered
    if not _registered:
        pdfmetrics.registerFont(TTFont(FONT, FONT_FILE))
        _registered = True
    return FONT


def _cell(pdf, x, y, w, h, text, *, size=9, bold=False, align='center', fill=None):
    if fill:
        pdf.setFillColor(fill)
        pdf.rect(x, y, w, h, stroke=0, fill=1)
    pdf.setStrokeColor(LINE)
    pdf.setLineWidth(0.5)
    pdf.rect(x, y, w, h, stroke=1, fill=0)
    if text == '':
        return
    pdf.setFillColor(colors.black)
    pdf.setFont(_font(), size)
    ty = y + (h - size) / 2 + 1.5
    if align == 'center':
        pdf.drawCentredString(x + w / 2, ty, text)
    elif align == 'right':
        pdf.drawRightString(x + w - 3 * mm, ty, text)
    else:
        pdf.drawString(x + 3 * mm, ty, text)


def _won(amount):
    return f'{amount:,}원' if amount else '원'


def build_payslip_pdf(*, path, name, department, title, period, paid_on,
                      pays, deducts, pay_total, deduct_total, net, net_korean,
                      company, ceo_title, seal=None):
    width, height = A4
    pdf = canvas.Canvas(str(path), pagesize=A4)
    pdf.setTitle(f'급여명세서 {period[:7]} {name}')

    left = 24 * mm
    right = width - 24 * mm
    inner = right - left
    y = height - 30 * mm

    pdf.setFont(_font(), 20)
    pdf.setFillColor(TITLE_COLOR)
    pdf.drawCentredString(width / 2, y, '급 여 명 세 서')
    y -= 14 * mm

    # 인적사항
    row = 8 * mm
    widths = [20 * mm, 40 * mm, 20 * mm, 30 * mm, 20 * mm, inner - 130 * mm]
    values = [('부    서', department), ('직    책', title), ('성    명', name)]
    x = left
    for index, (label, value) in enumerate(values):
        _cell(pdf, x, y - row, widths[index * 2], row, label, fill=HEAD_FILL)
        x += widths[index * 2]
        _cell(pdf, x, y - row, widths[index * 2 + 1], row, value)
        x += widths[index * 2 + 1]
    y -= row + 7 * mm

    pdf.setFillColor(colors.black)
    pdf.setFont(_font(), 9.5)
    pdf.drawString(left, y, '■ 지급 및 공제내역')
    y -= 4 * mm

    # 지급·공제
    label_w = inner * 0.24
    amount_w = inner * 0.26
    columns = [left, left + label_w, left + label_w + amount_w, left + label_w * 2 + amount_w]
    sizes = [label_w, amount_w, label_w, amount_w]

    _cell(pdf, columns[0], y - row, label_w + amount_w, row, '지 급 항 목', size=9.5, fill=HEAD_FILL)
    _cell(pdf, columns[2], y - row, label_w + amount_w, row, '공 제 항 목', size=9.5, fill=HEAD_FILL)
    y -= row

    pay_map = {k.replace(' ', ''): v for k, v in pays}
    deduct_map = {k.replace(' ', ''): v for k, v in deducts}
    for index in range(max(len(PAY_LABELS), len(DEDUCT_LABELS))):
        pay_label = PAY_LABELS[index] if index < len(PAY_LABELS) else ''
        deduct_label = DEDUCT_LABELS[index] if index < len(DEDUCT_LABELS) else ''
        cells = [
            (pay_label, HEAD_FILL, 'center'),
            (_won(pay_map.get(pay_label.replace(' ', ''), 0)), None, 'right'),
            (deduct_label, HEAD_FILL, 'center'),
            (_won(deduct_map.get(deduct_label.replace(' ', ''), 0)), None, 'right'),
        ]
        for column, (text, fill, align) in zip(range(4), cells):
            _cell(pdf, columns[column], y - row, sizes[column], row, text, fill=fill, align=align)
        y -= row

    totals = [('지급합계', HEAD_FILL, 'center'), (_won(pay_total), None, 'right'),
              ('공제합계', HEAD_FILL, 'center'), (_won(deduct_total), None, 'right')]
    for column, (text, fill, align) in zip(range(4), totals):
        _cell(pdf, columns[column], y - row, sizes[column], row, text, size=9.5, fill=fill, align=align)
    y -= row + 7 * mm

    pdf.setFillColor(colors.black)
    pdf.setFont(_font(), 9.5)
    pdf.drawString(left, y, '■ 종합내역')
    y -= 4 * mm

    summary = [
        ('기본근무 산출근거', period),
        ('총    액', f'{pay_total:,}원'),
        ('공제총액', f'{deduct_total:,}원'),
        ('실수령액', f'일금  {net_korean}원정  (\\ {net:,})'),
    ]
    for label, value in summary:
        _cell(pdf, left, y - row, label_w, row, label, fill=HEAD_FILL)
        _cell(pdf, left + label_w, y - row, inner - label_w, row, value)
        y -= row
    y -= 16 * mm

    pdf.setFont(_font(), 9.5)
    pdf.drawCentredString(width / 2, y, '귀하의 노고에 감사 드립니다.')
    y -= 12 * mm
    pdf.drawCentredString(width / 2, y, f'{paid_on.year}년 {paid_on.month:02d}월 {paid_on.day:02d}일')
    y -= 20 * mm

    pdf.setFont(_font(), 13)
    pdf.drawCentredString(width / 2, y, company)
    y -= 8 * mm
    signature = f'{ceo_title} (인)'
    pdf.drawCentredString(width / 2, y, signature)
    if seal:
        # 이름 오른쪽 "(인)" 자리에 겹쳐 찍는다. 종이 명세서가 그렇게 생겼다.
        size = 17 * mm
        anchor = width / 2 + pdfmetrics.stringWidth(signature, _font(), 13) / 2
        pdf.drawImage(ImageReader(seal), anchor - size * 0.52, y - size * 0.35,
                      width=size, height=size, mask='auto')

    pdf.showPage()
    pdf.save()
    return path
