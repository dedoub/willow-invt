#!/usr/bin/env python3
"""한 달의 근무일·공휴일·지급일·마지막 영업일을 JSON 으로 낸다.

  python3 scripts/lib/kr_workdays.py 2026 9

출근부와 발송 스크립트가 같은 달력을 봐야 한다. 두 곳에서 따로 계산하면 언젠가 갈린다.
대체공휴일까지 본다 — 2026년 추석은 토요일과 겹쳐 9월 28일(월)이 대체공휴일이고,
이걸 빠뜨리면 9월 근무일이 하루 늘어난다.
"""
import calendar, datetime, json, sys
from korean_lunar_calendar import KoreanLunarCalendar

# 대체공휴일(「관공서의 공휴일에 관한 규정」 제3조).
# - 설날·추석 연휴: 일요일 또는 다른 공휴일과 겹칠 때만. 토요일과 겹치는 건 대체하지 않는다.
#   (2026-09-26 추석이 토요일이라 9/28 을 휴일로 잘못 넣었던 일이 있었다.)
# - 어린이날·국경일(삼일절·광복절·개천절·한글날)·부처님오신날·성탄절: 토·일 또는 다른 공휴일과 겹칠 때.
LUNAR_HOLIDAY_SUBSTITUTE = {'설날', '추석'}
WEEKEND_SUBSTITUTE = {'어린이날', '삼일절', '광복절', '개천절', '한글날', '부처님오신날', '성탄절'}
# 선거일·임시공휴일처럼 계산으로 나오지 않는 공휴일. src/lib/kr-holidays.ts 의 EXTRA 와 같게 둔다.
EXTRA = {datetime.date(2026, 6, 3): '지방선거일'}

def _lunar(y, m, d):
    c = KoreanLunarCalendar(); c.setLunarDate(y, m, d, False)
    return datetime.date(c.solarYear, c.solarMonth, c.solarDay)

def holidays(year):
    chuseok, seollal = _lunar(year, 8, 15), _lunar(year, 1, 1)
    entries = [
        (datetime.date(year, 1, 1), '신정'), (datetime.date(year, 3, 1), '삼일절'),
        (datetime.date(year, 5, 5), '어린이날'), (datetime.date(year, 6, 6), '현충일'),
        (datetime.date(year, 8, 15), '광복절'), (datetime.date(year, 10, 3), '개천절'),
        (datetime.date(year, 10, 9), '한글날'), (datetime.date(year, 12, 25), '성탄절'),
        (_lunar(year, 4, 8), '부처님오신날'),
    ]
    for base, label in ((seollal, '설날'), (chuseok, '추석')):
        for off in (-1, 0, 1):
            entries.append((base + datetime.timedelta(days=off), label))
    entries += [(d, label) for d, label in EXTRA.items() if d.year == year]
    count = {}
    for d, _ in entries:
        count[d] = count.get(d, 0) + 1
    days = {}
    for d, label in entries:
        days[d] = f'{days[d]}·{label}' if d in days and label not in days[d] else days.get(d, label)
    # 겹친 날마다 대체공휴일 하루씩. 날짜순으로 처리해 연이은 대체일이 서로 밀리게 한다.
    subs = []
    for d, label in sorted(entries):
        overlap = count[d] > 1
        if label in LUNAR_HOLIDAY_SUBSTITUTE and (d.weekday() == 6 or overlap):
            subs.append((d, label))
        elif label in WEEKEND_SUBSTITUTE and (d.weekday() >= 5 or overlap):
            subs.append((d, label))
    seen = set()
    for d, label in subs:
        if d in seen:  # 같은 날 두 공휴일이 겹쳐도 대체공휴일은 하루(2025-05-05 어린이날·부처님오신날 → 5/6)
            continue
        seen.add(d)
        nxt = d + datetime.timedelta(days=1)
        while nxt.weekday() >= 5 or nxt in days:
            nxt += datetime.timedelta(days=1)
        days[nxt] = f'{label} 대체공휴일'
    return days

def month_facts(year, month):
    hol = holidays(year)
    last = calendar.monthrange(year, month)[1]
    work = [d for d in range(1, last + 1)
            if datetime.date(year, month, d).weekday() < 5 and datetime.date(year, month, d) not in hol]
    skipped = [{'day': d, 'label': hol[datetime.date(year, month, d)]}
               for d in range(1, last + 1)
               if datetime.date(year, month, d).weekday() < 5 and datetime.date(year, month, d) in hol]
    pay = datetime.date(year, month, 25)
    while pay.weekday() >= 5 or pay in hol:
        pay -= datetime.timedelta(days=1)
    send = datetime.date(year, month, last)
    while send.weekday() >= 5 or send in hol:
        send -= datetime.timedelta(days=1)
    ny, nm = (year + 1, 1) if month == 12 else (year, month + 1)
    due, nh = datetime.date(ny, nm, 5), holidays(ny)
    while due.weekday() >= 5 or due in nh:
        due += datetime.timedelta(days=1)
    return {
        'year': year, 'month': month, 'lastDay': last,
        'workdays': work, 'workdayCount': len(work),
        # 그 달의 모든 공휴일(주말에 겹친 날 포함) — 달력 전체를 적는 출근부가 쓴다
        'holidays': [{'day': d, 'label': hol[datetime.date(year, month, d)]}
                     for d in range(1, last + 1) if datetime.date(year, month, d) in hol],
        'skippedHolidays': skipped,
        'payDate': pay.isoformat(),
        'sendDate': send.isoformat(),      # 그 달의 마지막 영업일
        'replyDue': due.isoformat(),       # 다음 달 5일, 쉬는 날이면 다음 영업일
        'leftCells': min(10, len(work)),
        'rightCells': max(0, len(work) - min(10, len(work))),
    }

if __name__ == '__main__':
    print(json.dumps(month_facts(int(sys.argv[1]), int(sys.argv[2])), ensure_ascii=False))
