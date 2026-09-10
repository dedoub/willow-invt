-- 텐소 일정 분류를 finance/other → revenue/expense/other 로 나눈다 (CEO 2026-09-10).
-- 매출: 돈이 들어오는 일(매출대금 입금·수금·매출 세금계산서), 비용: 나가는 일(매입·이체·세금·보험·급여·카드·이자).
alter table public.tensw_mgmt_schedules
  drop constraint if exists tensw_mgmt_schedules_category_check;

update public.tensw_mgmt_schedules
set category = case
  when source_key like 'tensw-finance:tax-invoice:%' and title ~ '매출 세금계산서' then 'revenue'
  when source_key like 'tensw-finance:tax-invoice:%' then 'expense'
  when source_key like 'tensw-finance:tax-obligation:%' then 'expense'
  when title ~ '(매출|입금|수금|정산금|매출대금)' then 'revenue'
  when title ~ '(매입|이체|납부|세금계산서|급여|상여|부가세|부가가치세|법인세|소득세|지방세|원천징수|국세|세금|4대보험|국민연금|건강보험|고용보험|산재보험|법인카드|카드.*(대금|결제)|대출.*이자|대여금.*이자|이자.*상환)' then 'expense'
  else 'other'
end
where category = 'finance' or category is null;

alter table public.tensw_mgmt_schedules
  add constraint tensw_mgmt_schedules_category_check
  check (category in ('revenue', 'expense', 'other'));

comment on column public.tensw_mgmt_schedules.category is '일정 탭 분류: revenue(매출) · expense(비용) · other(기타거래)';
