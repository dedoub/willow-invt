#!/usr/bin/env python3
"""확정 급여대장 PDF 로 급여일 아침에 보낼 것 두 가지를 만든다.

  python3 scripts/tensw_payroll_payday.py 2026 8 8월급여대장.pdf \
      --register 급여내역_202608.xlsx --accounts 계좌.json --out 폴더

  1) 우리은행 대량이체 .xls — 머리글 없는 여덟 칸, 한 줄에 한 사람
  2) 개인별 급여명세서 .xlsx — 회사 서식(scripts/templates/tensw-payslip.xlsx)

이체 금액은 **차인지급액**이다. 우리가 다시 계산하지 않는다. 대장에 적힌 숫자를 옮긴다.
주민번호와 계좌번호는 깃·로그·위키에 적지 않는다. 계좌는 밖에서 받아 온 json 으로만 온다.
"""
import argparse
import datetime
import json
import re
import shutil
import sys
from pathlib import Path

import openpyxl
import xlwt
from openpyxl.drawing.image import Image as XlsxImage
from openpyxl.drawing.spreadsheet_drawing import AnchorMarker, TwoCellAnchor

sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
from kr_workdays import month_facts                                 # noqa: E402
from payroll_ledger import read_ledger                               # noqa: E402

TEMPLATE = Path(__file__).resolve().parent / 'templates' / 'tensw-payslip.xlsx'
COMPANY = '텐소프트웍스'

# 급여대장의 칸 → 명세서의 칸
PAY_ROWS = {'기본급': 'D7', '식대': 'D8', '자가운전': 'D9'}
DEDUCT_ROWS = {
    '국민연금': 'I7', '건강보험': 'I8', '장기요양보험료': 'I9',
    '고용보험': 'I10', '소득세': 'I11', '지방소득세': 'I12',
}
PAY_OTHER = 'D16'          # 서식에 자리가 없는 지급 항목은 기타로 모은다
DEDUCT_OTHER = 'I15'

# 원래 서식이 인감을 놓던 자리. 인감 이미지는 저장소에 두지 않는다(비공개 버킷
# signatures/tensw/corp-seal.png). --seal 로 받아 그 자리에 얹는다.
SEAL_ANCHOR = TwoCellAnchor(
    editAs='oneCell',
    _from=AnchorMarker(col=5, colOff=171449, row=29, rowOff=114300),
    to=AnchorMarker(col=7, colOff=6350, row=33, rowOff=25400),
)

DIGITS = '영일이삼사오육칠팔구'
SMALL_UNITS = ('', '십', '백', '천')
BIG_UNITS = ('', '만', '억', '조')


def korean_amount(value):
    """2,737,525 → 이백칠십삼만칠천오백이십오. 십 앞의 1 은 떼고 백·천 앞의 1 은 붙인다."""
    if value == 0:
        return '영'
    groups = []
    remainder = value
    while remainder:
        groups.append(remainder % 10_000)
        remainder //= 10_000
    parts = []
    for index in range(len(groups) - 1, -1, -1):
        group = groups[index]
        if not group:
            continue
        text = ''
        for place in range(3, -1, -1):
            digit = group // (10 ** place) % 10
            if not digit:
                continue
            text += ('' if digit == 1 and place == 1 else DIGITS[digit]) + SMALL_UNITS[place]
        parts.append(text + BIG_UNITS[index])
    return ''.join(parts)


def read_register(path):
    """급여내역 xlsx 에서 주민번호를 가져온다. 대장 PDF 에는 없다."""
    workbook = openpyxl.load_workbook(path, data_only=True)
    sheet = workbook.worksheets[0]
    header = {str(cell.value).strip(): cell.column for cell in sheet[1] if cell.value}
    name_col, id_col = header.get('이름'), header.get('주민번호')
    if not name_col or not id_col:
        raise SystemExit(f'급여내역에 이름·주민번호 칸이 없어요: {list(header)}')
    out = {}
    for row in range(2, sheet.max_row + 1):
        name = sheet.cell(row, name_col).value
        if not name:
            continue
        out[str(name).strip()] = str(sheet.cell(row, id_col).value or '').strip()
    return out


def write_transfer(people, accounts, residents, year, month, destination):
    """우리은행 대량이체 — 은행, 계좌, 금액, 이름, 생년월일6자리, 빈칸, 보내는이, 적요.

    실제로 올라가는 파일은 여덟 칸이 모두 **글자**다. 금액을 숫자로 적으면 서식에 따라
    다르게 읽힌다. 계좌번호도 앞의 0 이 날아간다.
    """
    book = xlwt.Workbook(encoding='utf-8')
    sheet = book.add_sheet('Sheet1')
    note = f'{month}월급여'
    missing = []
    mismatched = []
    for index, person in enumerate(people):
        account = accounts.get(person['name'])
        if not account:
            missing.append(person['name'])
            account = {}
        # 생년월일은 계좌 장부에 적힌 것을 쓴다. 은행에 등록된 생년월일이 주민번호와
        # 다른 사람이 있어서, 주민번호에서 잘라 만들면 조용히 틀린다.
        resident = re.sub(r'\D', '', residents.get(person['name'], ''))[:6]
        birth = account.get('birth') or resident
        if account.get('birth') and resident and account['birth'] != resident:
            mismatched.append((person['name'], account['birth'], resident))
        cells = [
            account.get('bank', ''),
            account.get('number', ''),
            str(person['values']['차인지급액']),
            person['name'],
            birth,
            '',
            COMPANY,
            note,
        ]
        for column, value in enumerate(cells):
            sheet.write(index, column, value)
    book.save(destination)
    return missing, mismatched


def write_payslip(person, year, month, paid_on, destination, seal=None):
    shutil.copyfile(TEMPLATE, destination)
    workbook = openpyxl.load_workbook(destination)
    sheet = workbook.worksheets[0]
    values = person['values']

    sheet['C4'] = person['department']
    sheet['F4'] = person['title']
    sheet['J4'] = person['name']

    def won(amount):
        return f'{amount:,}원'

    placed_pay = 0
    for key, coordinate in PAY_ROWS.items():
        amount = values.get(key, 0)
        if amount:
            sheet[coordinate] = won(amount)
            placed_pay += amount
    placed_deduct = 0
    for key, coordinate in DEDUCT_ROWS.items():
        amount = values.get(key, 0)
        if amount:
            sheet[coordinate] = won(amount)
            placed_deduct += amount

    # 서식에 자리가 없는 항목(정산·두루누리·연말정산 등)은 조용히 버리지 않고 기타로 남긴다.
    pay_rest = values['지급합계'] - placed_pay
    deduct_rest = values['공제합계'] - placed_deduct
    if pay_rest:
        sheet[PAY_OTHER] = won(pay_rest)
    if deduct_rest:
        sheet[DEDUCT_OTHER] = won(deduct_rest)

    sheet['D19'] = won(values['지급합계'])
    sheet['I19'] = won(values['공제합계'])
    sheet['D21'] = f'{year}.{month:02d}.01~{year}.{month:02d}.{month_end(year, month):02d}'
    sheet['D22'] = won(values['지급합계'])
    sheet['D23'] = won(values['공제합계'])
    net = values['차인지급액']
    sheet['D24'] = f'     일금   {korean_amount(net)}원정 (\\  {net:,})'
    sheet['B28'] = f'{paid_on.year}년 {paid_on.month:02d}월 {paid_on.day:02d}일'
    if seal:
        image = XlsxImage(seal)
        image.anchor = SEAL_ANCHOR
        sheet.add_image(image)
    workbook.save(destination)
    return pay_rest, deduct_rest


def month_end(year, month):
    import calendar
    return calendar.monthrange(year, month)[1]


ROSTER = {
    # 명세서의 부서·직책. 대장에는 직급만 있고 부서는 비어 있다.
    '김철형': ('경영지원실', '대표이사'),
    '김의향': ('경영지원실', '이사'),
    '김정한': ('경영지원실', '이사'),
    '박선영': ('경영지원실', '이사'),
    '김경수': ('AI검색연구소', '선임 연구원'),
    '권지민': ('AI검색연구소', '연구원'),
    '조성민': ('AI검색연구소', '연구원'),
    '이승무': ('AI검색연구소', '연구원'),
    '전희나': ('AI검색연구소', '연구원'),
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('year', type=int)
    parser.add_argument('month', type=int)
    parser.add_argument('ledger', help='세무법인이 보낸 확정 급여대장 PDF')
    parser.add_argument('--register', required=True, help='그 달 급여내역 xlsx (주민번호를 여기서 가져온다)')
    parser.add_argument('--accounts', help='{"이름": {"bank": "우리은행", "number": "1002…", "birth": "770818"}} 형태의 json')
    parser.add_argument('--seal', help='법인인감 png. 비공개 버킷에서 받아 온다:\n'
                        '  node scripts/fetch-private-file.mjs signatures tensw/corp-seal.png /tmp/seal.png')
    parser.add_argument('--out', required=True)
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    people = read_ledger(args.ledger)
    residents = read_register(args.register)
    accounts = json.loads(Path(args.accounts).read_text()) if args.accounts else {}

    for person in people:
        department, title = ROSTER.get(person['name'], ('', person['rank']))
        person['department'] = department
        person['title'] = title

    paid_on = datetime.date.fromisoformat(month_facts(args.year, args.month)['payDate'])
    label = f'{args.year}{args.month:02d}'

    transfer = out / f'{COMPANY}_대량이체_{label}.xls'
    missing, mismatched = write_transfer(people, accounts, residents, args.year, args.month, transfer)

    print(f'{args.year}년 {args.month}월 · 지급일 {paid_on}')
    print(f'\n대량이체 → {transfer.name}  ({len(people)}명, 합계 '
          f'{sum(p["values"]["차인지급액"] for p in people):,}원)')
    if missing:
        print(f'  계좌를 모르는 사람: {", ".join(missing)}  ← 채워 넣어야 올릴 수 있어요')
    for name, birth, resident in mismatched:
        print(f'  {name}: 계좌 장부의 생년월일 {birth} 이 주민번호 앞자리 {resident} 와 달라요 (장부를 따랐어요)')

    print('\n급여명세서')
    for person in people:
        destination = out / f'급여명세서_{label}_{person["name"]}.xlsx'
        pay_rest, deduct_rest = write_payslip(person, args.year, args.month, paid_on, destination, args.seal)
        extra = []
        if pay_rest:
            extra.append(f'지급 기타 {pay_rest:,}')
        if deduct_rest:
            extra.append(f'공제 기타 {deduct_rest:,}')
        note = f'   ({", ".join(extra)})' if extra else ''
        print(f'  {person["name"]}  실수령 {person["values"]["차인지급액"]:,}원{note}')


if __name__ == '__main__':
    main()
