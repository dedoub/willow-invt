-- 외화 계좌도 실계좌번호 표기로 통일한다.
-- 전체계좌 조회의 외화예금 표를 읽기 시작하면서 수집기가
-- '신한 180-011-030723 (USD)' 로 잔액을 쌓는데, 손으로 넣던 '신한 (외화 USD)' 와
-- 섞이면 같은 계좌가 두 줄로 보인다. 원화 계좌는 앞서 같은 방식으로 정리했다.
update public.willow_mgmt_cash
   set account_number = '신한 180-011-030723 (USD)'
 where account_number = '신한 (외화 USD)';

delete from public.willow_mgmt_bank_balances
 where account_number = '신한 (외화 USD)';
