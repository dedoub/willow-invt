-- 해시체인 불변식: 한 회사 안에서 같은 prev_hash를 가진 이벤트는 하나뿐이다.
-- 동시 쓰기가 체인을 분기(fork)시키는 대신 두 번째 insert가 실패한다.
create unique index if not exists willow_corp_events_company_prev_hash_uidx
  on public.willow_corp_events (company, prev_hash);
