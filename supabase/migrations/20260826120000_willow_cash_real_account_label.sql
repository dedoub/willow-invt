-- 윌로우 현금관리 계좌 표기를 실계좌번호로 통일한다.
-- 신한 수집기가 '신한 140-013-427476' 라벨로 잔액과 거래를 쌓기 시작했는데,
-- 손으로 넣던 '신한 (원화)' 와 섞이면 같은 계좌가 두 줄로 보인다.
-- 텐소프트웍스도 같은 규칙(은행명 + 실계좌번호)을 쓴다. 외화 계좌는 인터넷뱅킹
-- 전체계좌 조회에 나오지 않아 손으로 관리하므로 그대로 둔다.
update public.willow_mgmt_cash
   set account_number = '신한 140-013-427476'
 where account_number = '신한 (원화)';

delete from public.willow_mgmt_bank_balances
 where bank_name = '신한은행'
   and account_number = '신한 (원화)';
