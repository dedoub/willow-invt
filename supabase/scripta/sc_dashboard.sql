-- ============================================================================
-- Scripta 대시보드 집계 (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: scripta (xmlbtykkgozxmjkyshfz) — 메인 willow-invt DB 아님.
-- 원격 migration: sc_dashboard_stats (2026-08-27)
-- 유저는 auth.users에 있어 REST로 직접 못 읽는다(auth 스키마 미노출) → 집계를
-- SECURITY DEFINER로 노출하고 실행권한은 service_role에만 준다 (rn_* 패턴).
-- 소비처: src/lib/scripta-supabase.ts / src/app/api/scripta/stats/route.ts
--
-- 통계 제외 계정(2026-08-27 CEO): 아래 sc__admin_ids()의 운영 계정은 모든 집계에서 뺀다.
-- 사용자 테이블에는 그대로 보이고(관리자 배지) 숫자에서만 빠진다 — 리뷰노트와 같은 규칙.
-- TS 쪽 동일 목록: src/lib/scripta-types.ts 의 SC_EXCLUDED_EMAILS — 두 곳이 항상 일치해야 함.
--
-- 리뷰노트와 다른 점: Scripta는 랜딩 트래픽(PageView)·결제 원장이 아직 없다.
-- 그래서 퍼널은 방문이 아니라 가입에서 시작하고, 활성화는 "글 등록", 그 다음
-- 단계는 "연습 시작"이다. 트래픽이 붙으면 앞단에 방문·유입을 덧대면 된다.
-- ============================================================================

-- 0) 공통 헬퍼 — KST 일자 배열 하나를 {총계, 오늘, 7일, 일별}로 접는다.
--    호출부가 "무엇을 셀지"만 배열로 넘기면 되게 해서 지표마다 같은 문법을 쓴다.
create or replace function public.sc__metric(p_days date[])
returns jsonb
language sql
stable
as $$
  with x as (select unnest(p_days) as d),
       g as (select d, count(*)::int as n from x group by d)
  select jsonb_build_object(
    'total', (select count(*)::int from x),
    'today', coalesce((select n from g where d = (now() at time zone 'Asia/Seoul')::date), 0),
    'd7',    coalesce((select sum(n)::int from g where d >= (now() at time zone 'Asia/Seoul')::date - 6), 0),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'), 'n', n) order by d) from g
    ), '[]'::jsonb)
  )
$$;

-- 0-1) 통계에서 뺄 운영 계정 id. 이메일로 잡는다 — auth.users에 role 개념이 없다.
create or replace function public.sc__admin_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users
  where lower(email) = any (array['dwkim.august@gmail.com', 'lactea82@gmail.com'])
$$;

-- 1) 대시보드 전체 집계 — 한 번의 왕복으로 퍼널·콘텐츠·연습·크레딧을 모두 돌려준다.
create or replace function public.sc_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
with
-- 유저별 첫 글 등록(활성화) — 글은 Cortex를 통해 유저에 귀속된다
first_text as (
  select c.user_id, min(t.created_at) as first_at
  from scripta_texts t join scripta_cortices c on c.id = t.cortex_id
  where c.user_id not in (select sc__admin_ids())
  group by c.user_id
),
-- 유저별 첫 연습 시도(연습 시작)
first_attempt as (
  select user_id, min(created_at) as first_at from scripta_attempts
  where user_id not in (select sc__admin_ids())
  group by user_id
),
-- 활동 = 글 등록 · 연습 · 크레딧 소비 (KST 일자 단위, 셋 중 하나라도 있으면 그날 활동자)
activity as (
  select * from (
    select c.user_id, (t.created_at at time zone 'Asia/Seoul')::date as d
      from scripta_texts t join scripta_cortices c on c.id = t.cortex_id
    union all
    select a.user_id, (a.created_at at time zone 'Asia/Seoul')::date from scripta_attempts a
    union all
    select l.user_id, (l.created_at at time zone 'Asia/Seoul')::date
      from scripta_credit_ledger l where l.source = 'practice'
  ) x where x.user_id not in (select sc__admin_ids())
),
signup as (select id, (created_at at time zone 'Asia/Seoul')::date as d from auth.users),
daily_active as (
  select act.d,
         count(*)::int as active,
         count(*) filter (where s.d = act.d)::int as new_users
  from (select distinct user_id, d from activity) act
  left join signup s on s.id = act.user_id
  group by act.d
)
select jsonb_build_object(
  'users', sc__metric(array(select (created_at at time zone 'Asia/Seoul')::date from auth.users
    where id not in (select sc__admin_ids()))),
  'content', jsonb_build_object(
    'cortices',   sc__metric(array(select (c.created_at at time zone 'Asia/Seoul')::date from scripta_cortices c
      where c.user_id not in (select sc__admin_ids()))),
    'texts',      sc__metric(array(select (t.created_at at time zone 'Asia/Seoul')::date from scripta_texts t
      join scripta_cortices c on c.id = t.cortex_id where c.user_id not in (select sc__admin_ids()))),
    'paragraphs', sc__metric(array(select (u.created_at at time zone 'Asia/Seoul')::date from scripta_units u
      join scripta_texts t on t.id = u.text_id join scripta_cortices c on c.id = t.cortex_id
      where u.unit_type = 'paragraph' and c.user_id not in (select sc__admin_ids()))),
    'sentences',  sc__metric(array(select (u.created_at at time zone 'Asia/Seoul')::date from scripta_units u
      join scripta_texts t on t.id = u.text_id join scripta_cortices c on c.id = t.cortex_id
      where u.unit_type = 'sentence' and c.user_id not in (select sc__admin_ids()))),
    'chunks',     sc__metric(array(select (u.created_at at time zone 'Asia/Seoul')::date from scripta_units u
      join scripta_texts t on t.id = u.text_id join scripta_cortices c on c.id = t.cortex_id
      where u.unit_type = 'chunk' and c.user_id not in (select sc__admin_ids())))
  ),
  'attempts', sc__metric(array(select (created_at at time zone 'Asia/Seoul')::date from scripta_attempts
    where user_id not in (select sc__admin_ids()))),
  'aiGrades', sc__metric(array(select (requested_at at time zone 'Asia/Seoul')::date from scripta_ai_grade_requests
    where user_id not in (select sc__admin_ids()))),
  'practice', (
    select jsonb_build_object(
      'passed', coalesce(count(*) filter (where passed), 0)::int,
      'avgScore', coalesce(round(avg(score)::numeric, 1), 0)
    ) from scripta_attempts where user_id not in (select sc__admin_ids())
  ),
  -- 연습 단위별(문장/문단/전체 글) 성적. unit_id가 null인 시도는 글 전체 재구성이다.
  'byLevel', coalesce((
    select jsonb_agg(jsonb_build_object(
      'level', lvl, 'attempts', n, 'passed', p, 'avgScore', avg_score) order by n desc)
    from (
      select coalesce(u.unit_type, 'text') as lvl,
             count(*)::int as n,
             count(*) filter (where a.passed)::int as p,
             round(avg(a.score)::numeric, 1) as avg_score
      from scripta_attempts a left join scripta_units u on u.id = a.unit_id
      where a.user_id not in (select sc__admin_ids())
      group by 1
    ) s), '[]'::jsonb),
  'credits', jsonb_build_object(
    'balance',   (select coalesce(sum(balance), 0)::bigint from scripta_credit_accounts
                   where user_id not in (select sc__admin_ids())),
    'spent',     (select coalesce(-sum(delta), 0)::bigint from scripta_credit_ledger
                   where delta < 0 and user_id not in (select sc__admin_ids())),
    'refunded',  (select coalesce(sum(delta), 0)::bigint from scripta_credit_ledger
                   where delta > 0 and reason like '%refund%' and user_id not in (select sc__admin_ids())),
    'granted',   (select coalesce(sum(delta), 0)::bigint from scripta_credit_ledger
                   where delta > 0 and source = 'admin_adjustment' and user_id not in (select sc__admin_ids())),
    -- 구매 = 관리자 지급도 연습 환불도 아닌 유입분. 결제 연동 전이라 지금은 0이다.
    'purchased', (select coalesce(sum(delta), 0)::bigint from scripta_credit_ledger
                   where delta > 0 and source not in ('admin_adjustment', 'practice')
                     and user_id not in (select sc__admin_ids())),
    'byReason', coalesce((
      select jsonb_agg(jsonb_build_object('reason', reason, 'calls', n, 'credits', c) order by c desc)
      from (select reason, count(*)::int n, (-sum(delta))::bigint c
            from scripta_credit_ledger where delta < 0 and user_id not in (select sc__admin_ids())
            group by reason) r), '[]'::jsonb),
    'dailySpent', coalesce((
      select jsonb_agg(jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'), 'n', c) order by d)
      from (select (created_at at time zone 'Asia/Seoul')::date d, (-sum(delta))::bigint c
            from scripta_credit_ledger where delta < 0 and user_id not in (select sc__admin_ids())
            group by 1) x), '[]'::jsonb)
  ),
  'payments', (
    select jsonb_build_object(
      'events', count(*)::int,
      'processed', count(*) filter (where status = 'processed')::int
    ) from scripta_payment_events
  ),
  'languages', coalesce((
    select jsonb_agg(jsonb_build_object('language', target_language, 'n', n) order by n desc)
    from (select target_language, count(*)::int n from scripta_cortices
          where user_id not in (select sc__admin_ids()) group by 1) l), '[]'::jsonb),
  'activation', coalesce((
    select jsonb_agg(jsonb_build_object('userId', user_id, 'at', first_at)) from first_text), '[]'::jsonb),
  'practiceStart', coalesce((
    select jsonb_agg(jsonb_build_object('userId', user_id, 'at', first_at)) from first_attempt), '[]'::jsonb),
  'dailyActive', coalesce((
    select jsonb_agg(jsonb_build_object(
      'date', to_char(d, 'YYYY-MM-DD'), 'active', active,
      'newUsers', new_users, 'member', active - new_users) order by d)
    from daily_active), '[]'::jsonb)
)
$$;

-- 2) 사용자 테이블 — 가입/활동 + 유저별 콘텐츠·연습·크레딧
create or replace function public.sc_users()
returns table(
  user_id uuid,
  email text,
  name text,
  avatar_url text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  last_activity timestamptz,
  cortices int,
  texts int,
  sentences int,
  attempts int,
  attempts_today int,
  passed int,
  avg_score numeric,
  balance bigint,
  spent bigint,
  ai_calls int,
  is_admin boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with cx as (
    select user_id, count(*)::int n from scripta_cortices group by 1
  ),
  tx as (
    select c.user_id, count(*)::int n, max(t.created_at) last_at
    from scripta_texts t join scripta_cortices c on c.id = t.cortex_id group by 1
  ),
  sn as (
    select c.user_id, count(*)::int n
    from scripta_units u
    join scripta_texts t on t.id = u.text_id
    join scripta_cortices c on c.id = t.cortex_id
    where u.unit_type = 'sentence' group by 1
  ),
  att as (
    select user_id, count(*)::int n,
           count(*) filter (
             where (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
           )::int today,
           count(*) filter (where passed)::int p,
           round(avg(score)::numeric, 1) avg_score,
           max(created_at) last_at
    from scripta_attempts group by 1
  ),
  led as (
    select user_id, coalesce(-sum(delta) filter (where delta < 0), 0)::bigint spent, max(created_at) last_at
    from scripta_credit_ledger group by 1
  ),
  ai as (
    select user_id, count(*)::int n from scripta_ai_grade_requests group by 1
  )
  select
    u.id,
    u.email::text,
    coalesce(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name'),
    u.raw_user_meta_data->>'avatar_url',
    u.created_at,
    u.last_sign_in_at,
    -- 활동 = 로그인·글 등록·연습·크레딧 사용 중 가장 최근 (greatest는 null을 건너뛴다)
    greatest(u.last_sign_in_at, tx.last_at, att.last_at, led.last_at),
    coalesce(cx.n, 0), coalesce(tx.n, 0), coalesce(sn.n, 0),
    coalesce(att.n, 0), coalesce(att.today, 0), coalesce(att.p, 0), coalesce(att.avg_score, 0),
    coalesce(acc.balance, 0)::bigint, coalesce(led.spent, 0)::bigint, coalesce(ai.n, 0),
    -- 통계 제외 계정 표시. 테이블에는 그대로 두고 숫자에서만 빠진다.
    u.id in (select sc__admin_ids())
  from auth.users u
  left join cx  on cx.user_id  = u.id
  left join tx  on tx.user_id  = u.id
  left join sn  on sn.user_id  = u.id
  left join att on att.user_id = u.id
  left join led on led.user_id = u.id
  left join ai  on ai.user_id  = u.id
  left join scripta_credit_accounts acc on acc.user_id = u.id
  order by u.created_at desc
$$;

-- 3) 실행 권한 — 이메일이 나오는 집계라 anon/authenticated에는 절대 열지 않는다.
revoke all on function public.sc__metric(date[])   from public, anon, authenticated;
revoke all on function public.sc__admin_ids()     from public, anon, authenticated;
revoke all on function public.sc_dashboard_stats() from public, anon, authenticated;
revoke all on function public.sc_users()           from public, anon, authenticated;
grant execute on function public.sc__metric(date[])   to service_role;
grant execute on function public.sc__admin_ids()     to service_role;
grant execute on function public.sc_dashboard_stats() to service_role;
grant execute on function public.sc_users()           to service_role;
