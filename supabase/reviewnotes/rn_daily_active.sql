-- ============================================================================
-- ReviewNotes 일별 활동자 RPC (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: review-notes (kumaqaizejnjrvfqhahu) — 메인 willow-invt DB 아님.
-- 소비처: src/lib/reviewnotes-supabase.ts getReviewNotesTrafficStats() → dailyActive
--         화면: reviewnotes-block.tsx RnDauTrendCard (회원/신규/비로그인 3계열)
--
-- 세는 단위가 계열마다 다르다. 로그인 활동자는 userId, 비로그인은 sessionId 기준이라
-- active와 anon을 더한 값은 "사람 수"가 아니다. 막대는 함께 쌓되 툴팁에서 구분해 적는다.
--
-- 제외 규칙 (rn_traffic_stats와 동일하게 유지할 것):
--   관리자 = role='ADMIN' 또는 test@reviewnotes.app (스토어 심사용)
--   비로그인 쪽은 userId가 없으므로 관리자 userId가 쓴 sessionId를 통째로 뺀다.
--   비로그인 활동자는 랜딩 조회가 아니라 학습·콘텐츠 생성 등 제품 행동이 있는 세션만 센다.
--   이 기준으로 일반 봇과 자동화 랜딩 세션도 활동자에서 제외된다.
--
-- 2026-07-28: anon 계열 추가. 반환 컬럼이 늘어 drop 후 재생성해야 한다.
-- 2026-09-01: active30(롤링 30일 순 활동자 = MAU) 추가. 반환 컬럼이 늘어 또 drop 후 재생성.
--   일별 active를 30일 더하면 여러 날 온 사람이 겹쳐 잡혀 MAU가 부풀려진다 — 창 안에서
--   distinct로 다시 센다. 날짜별로 있어야 ARPMAU 추이선의 분모를 그날 값으로 맞출 수 있다.
-- ============================================================================
drop function if exists public.rn_daily_active(integer);

create function public.rn_daily_active(range_days integer default 60)
 returns table(date date, active bigint, new_users bigint, member bigint, anon bigint, active30 bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
with admins as (
  select id from "User" where role = 'ADMIN' or email = 'test@reviewnotes.app'
),
days as (
  select generate_series(
    (now() at time zone 'Asia/Seoul')::date - greatest(range_days - 1, 0),
    (now() at time zone 'Asia/Seoul')::date,
    interval '1 day'
  )::date as d
),
admin_sessions as (
  select distinct "sessionId" from "EventLog"
  where "userId" in (select id from admins) and coalesce("sessionId", '') <> ''
),
day_user as (
  -- 창을 range_days보다 30일 더 넓게 잡는다 — 시리즈 첫날의 롤링 30일 MAU도 29일 앞을 봐야
  -- 온전히 세어진다. 시리즈 밖 날짜는 아래에서 days와 조인하며 자연히 떨어진다.
  select distinct (("createdAt" at time zone 'UTC') at time zone 'Asia/Seoul')::date as d, "userId" as uid
  from "EventLog"
  where "userId" is not null and "userId" not in (select id from admins)
    and "createdAt" >= now() - make_interval(days => range_days + 30)
),
flagged as (
  select du.d, du.uid,
    (u."createdAt" is not null and ((u."createdAt" at time zone 'UTC') at time zone 'Asia/Seoul')::date = du.d) as is_new
  from day_user du left join "User" u on u.id = du.uid
),
logged as (
  select d,
    count(*)::bigint as active,
    count(*) filter (where is_new)::bigint as new_users,
    count(*) filter (where not is_new)::bigint as member
  from flagged group by d
),
-- 롤링 30일 순 활동자(MAU) — 그날을 포함한 직전 30일 창의 distinct userId.
rolling as (
  select days.d, count(distinct du.uid)::bigint as active30
  from days
  left join day_user du on du.d > days.d - 30 and du.d <= days.d
  group by days.d
),
anon_day as (
  select (("createdAt" at time zone 'UTC') at time zone 'Asia/Seoul')::date as d,
         count(distinct "sessionId")::bigint as anon
  from "EventLog"
  where "userId" is null
    and coalesce("sessionId", '') <> ''
    and "sessionId" not in (select "sessionId" from admin_sessions)
    and name in (
      'bulk_import_save', 'ai_generate', 'solve_submit', 'schedule_start',
      'note_set_create', 'note_create', 'review_set_create', 'retry_set_create',
      'set_create', 'set_add_problems', 'assignment_copy', 'practice_import_success',
      'demo_start', 'demo_complete', 'demo_round2_start', 'template_print'
    )
    and "createdAt" >= now() - make_interval(days => range_days)
  group by 1
)
select days.d as date,
  coalesce(l.active, 0) as active,
  coalesce(l.new_users, 0) as new_users,
  coalesce(l.member, 0) as member,
  coalesce(a.anon, 0) as anon,
  coalesce(r.active30, 0) as active30
from days
left join logged l on l.d = days.d
left join anon_day a on a.d = days.d
left join rolling r on r.d = days.d
order by days.d
$function$;

-- drop 후 재생성하면 ACL이 기본값(PUBLIC EXECUTE)으로 돌아간다. 2026-06-21 RLS 하드닝에서
-- anon·authenticated 실행권한을 걷어냈으므로 그 상태를 명시적으로 다시 만든다.
revoke all on function public.rn_daily_active(integer) from public;
grant execute on function public.rn_daily_active(integer) to service_role;
