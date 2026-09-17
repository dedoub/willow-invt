"""세무법인이 보내 주는 확정 급여대장 PDF 를 사람별 숫자로 읽는다.

이 PDF 는 표를 선으로만 그리고 칸 구분을 남기지 않는다. -layout 로 뽑으면 숫자
가운데에 공백이 끼기도 한다("3 3,130"). 그래서 글자 좌표(-bbox-layout)로 읽고,
머리글의 x 위치에 숫자를 맞춰 칸을 정한다.

한 사람이 세 줄이다.
  1줄: 사원번호 성명 | 기본급 식대 자가운전 … | 국민연금 건강보험 고용보험 장기요양 소득세 지방소득세
  2줄: 입사일 직급 | 정산 항목들 | 공제합계
  3줄: 퇴사일 부서 | 지급합계 | 차인지급액
"""
import re
import subprocess
import xml.etree.ElementTree as ET

# 머리글 글자 → 우리가 쓰는 이름. 같은 x 줄에 세 줄짜리 머리글이 겹쳐 있어서
# 세 줄 각각에서 고른다.
PAY_COLUMNS = ('기본급', '식대', '자가운전', '지급합계')
DEDUCT_COLUMNS = ('국민연금', '건강보험', '고용보험', '장기요양보험료', '소득세', '지방소득세',
                  '연금보험정산', '건강보험정산', '요양보험정산', '고용보험정산', '두루누리(연금)',
                  '두루누리(고용)', '원단위절사', '연말정산소득세', '연말정산지방세', '학자금상환',
                  '공제합계', '차인지급액')

NUMBER = re.compile(r'^-?[\d,]+$')


def _words(pdf_path):
    xml = subprocess.run(['pdftotext', '-bbox-layout', pdf_path, '-'],
                         capture_output=True, check=True).stdout.decode('utf-8')
    root = ET.fromstring(xml)
    out = []
    for page in root.iter('{http://www.w3.org/1999/xhtml}page'):
        for word in page.iter('{http://www.w3.org/1999/xhtml}word'):
            out.append({
                'text': word.text or '',
                'x0': float(word.get('xMin')),
                'x1': float(word.get('xMax')),
                'y': (float(word.get('yMin')) + float(word.get('yMax'))) / 2,
            })
    return out


def _lines(words, tolerance=3.0):
    """같은 높이의 글자를 한 줄로 묶는다."""
    lines = []
    for word in sorted(words, key=lambda w: (w['y'], w['x0'])):
        if lines and abs(word['y'] - lines[-1]['y']) <= tolerance:
            lines[-1]['words'].append(word)
            lines[-1]['y'] = (lines[-1]['y'] + word['y']) / 2
        else:
            lines.append({'y': word['y'], 'words': [word]})
    for line in lines:
        line['words'].sort(key=lambda w: w['x0'])
    return lines


def _merge_split_numbers(line_words, gap=2.0):
    """PDF 가 숫자 가운데를 갈라 놓는다("3 3,130"). 붙어 있으면 도로 붙인다."""
    merged = []
    for word in line_words:
        previous = merged[-1] if merged else None
        joinable = (previous
                    and word['x0'] - previous['x1'] < gap
                    and re.fullmatch(r'[\d,]+', previous['text'])
                    and re.fullmatch(r'[\d,]+', word['text']))
        if joinable:
            previous['text'] += word['text']
            previous['x1'] = word['x1']
        else:
            merged.append(dict(word))
    return merged


def _amount(text):
    return int(text.replace(',', '')) if text.replace(',', '').lstrip('-').isdigit() else 0


# 머리글도 세 줄이고, 그 세 줄의 칸이 서로 다른 x 에 있다. 사람의 n번째 줄은
# 머리글의 n번째 줄이 가진 칸에만 값을 놓는다.
HEADER_KEYS = ('사원번호', '입사일', '퇴사일')


def _header_anchors(lines):
    """머리글 세 줄에서 각각 {칸 이름: 오른쪽 끝 x} 를 뽑는다."""
    known = set(PAY_COLUMNS + DEDUCT_COLUMNS)
    rows = []
    for key in HEADER_KEYS:
        line = next((l for l in lines[:20] if any(w['text'] == key for w in l['words'])), None)
        if line is None:
            raise SystemExit(f'급여대장 머리글 줄을 못 찾았어요: {key}')
        rows.append({w['text']: w['x1'] for w in line['words'] if w['text'] in known})
    return rows


def _assign(line_words, anchors, limit=16.0):
    """숫자를 오른쪽 끝이 가장 가까운 칸에 넣는다. 숫자는 오른쪽 맞춤이다."""
    values = {}
    for word in line_words:
        if not NUMBER.fullmatch(word['text']):
            continue
        name, distance = min(
            ((key, abs(word['x1'] - x1)) for key, x1 in anchors.items()),
            key=lambda pair: pair[1],
            default=(None, limit + 1),
        )
        if name is None or distance > limit:
            continue
        values[name] = _amount(word['text'])
    return values


DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
EMPLOYEE_NUMBER = re.compile(r'^\d{1,4}$')


def read_ledger(pdf_path):
    """사람별로 {name, 직급, 입사일, 지급, 공제} 를 돌려준다. 합계 줄은 뺀다."""
    lines = _lines(_words(pdf_path))
    header = _header_anchors(lines)
    found = set().union(*header)
    missing = [name for name in ('기본급', '지급합계', '공제합계', '차인지급액') if name not in found]
    if missing:
        raise SystemExit(f'급여대장 머리글을 못 찾았어요: {missing}')

    people = []
    for index, line in enumerate(lines):
        words = _merge_split_numbers(line['words'])
        if len(words) < 2:
            continue
        # 사람 줄은 "사원번호 성명" 으로 시작하고, 바로 다음 줄이 입사일로 시작한다.
        following = _merge_split_numbers(lines[index + 1]['words']) if index + 1 < len(lines) else []
        if not (EMPLOYEE_NUMBER.fullmatch(words[0]['text']) and following and DATE.fullmatch(following[0]['text'])):
            continue
        third = _merge_split_numbers(lines[index + 2]['words']) if index + 2 < len(lines) else []

        values = {}
        for row, anchors in zip((words[2:], following[2:], third), header):
            values.update(_assign(row, anchors))

        people.append({
            'employee_no': words[0]['text'],
            # 재직 구분으로 이름 뒤에 "(재)" 가 붙는 달이 있다.
            'name': re.sub(r'\(.*?\)$', '', words[1]['text']),
            'hired_on': following[0]['text'],
            'rank': following[1]['text'] if len(following) > 1 and not NUMBER.fullmatch(following[1]['text']) else '',
            'values': values,
        })
    return people
