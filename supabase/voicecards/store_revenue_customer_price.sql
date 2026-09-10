-- Store the per-unit amount charged to the customer in the store's customer currency.
-- NULL means an older report row has not been backfilled yet.
alter table public.store_revenue
  add column if not exists customer_price numeric,
  alter column proceeds drop not null;

comment on column public.store_revenue.customer_price is
  'Total amount charged to customers represented by the row, denominated in currency.';

comment on column public.store_revenue.proceeds is
  'Total developer proceeds represented by the row; NULL until a proceeds report is available.';
