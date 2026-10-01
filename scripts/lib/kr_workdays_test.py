# python3 -m unittest scripts/lib/kr_workdays_test.py
import datetime, sys, os, unittest
sys.path.insert(0, os.path.dirname(__file__))
from kr_workdays import holidays, month_facts

D = datetime.date

class SubstituteHolidays(unittest.TestCase):
    def test_chuseok_on_saturday_has_no_substitute(self):
        h = holidays(2026)
        self.assertNotIn(D(2026, 9, 28), h)          # 추석 9/24~26, 26일 토요일 → 대체 없음
        self.assertIn(28, month_facts(2026, 9)['workdays'])
        self.assertEqual(month_facts(2026, 9)['workdayCount'], 20)

    def test_lunar_holiday_on_sunday_gets_one_substitute(self):
        self.assertEqual(holidays(2025)[D(2025, 10, 8)], '추석 대체공휴일')   # 10/5 일요일
        h = holidays(2027)                                                      # 설 2/6(토)~8, 7일 일요일
        self.assertIn(D(2027, 2, 9), h)
        self.assertNotIn(D(2027, 2, 10), h)

    def test_national_day_on_saturday_gets_substitute(self):
        self.assertIn(D(2026, 10, 5), holidays(2026))   # 개천절 10/3 토
        self.assertIn(D(2027, 12, 27), holidays(2027))  # 성탄절 12/25 토

    def test_two_holidays_same_day_one_substitute(self):
        h = holidays(2025)                              # 5/5 어린이날·부처님오신날
        self.assertIn(D(2025, 5, 6), h)
        self.assertNotIn(D(2025, 5, 7), h)
        h = holidays(2028)                              # 추석 10/2~4 와 개천절 10/3
        self.assertIn(D(2028, 10, 5), h)
        self.assertNotIn(D(2028, 10, 6), h)

    def test_election_day(self):
        self.assertIn(D(2026, 6, 3), holidays(2026))

if __name__ == '__main__':
    unittest.main()
