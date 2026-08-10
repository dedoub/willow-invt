-- ============================================================================
-- ReviewNotes 유저별 AI 기능 사용 내역 (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: review-notes (kumaqaizejnjrvfqhahu) — 메인 willow-invt DB 아님.
-- 원장 테이블: "AiUsage" (review-notes 앱 prisma/ddl/2026-08-11-ai-usage.sql).
--   RLS만 켜고 anon 정책이 없다 → 집계만 SECURITY DEFINER로 노출한다.
-- 기간 기준: 앱의 크레딧 리셋과 같은 UTC 달(User.aiGenPeriod = 'YYYY-MM')이다.
--   KST 달로 세면 대시보드의 "이번 달 사용"이 앱이 차감한 값과 어긋난다.
-- 주의: 원장은 2026-08-11 도입 — 그 이전 AI 호출은 남아 있지 않다(누적 = 도입 이후).
-- 소비처: src/lib/reviewnotes-supabase.ts getReviewNotesUsers()
-- ============================================================================
create or replace function public.rn_user_ai_usage()
returns table(
  user_id text,
  calls_total bigint,
  credits_total bigint,
  calls_period bigint,
  credits_period bigint,
  features_period jsonb,
  features_total jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with period as (
    select to_char(now() at time zone 'utc', 'YYYY-MM') as p
  ),
  ledger as (
    select
      "userId" as user_id,
      feature,
      credits,
      to_char("createdAt" at time zone 'utc', 'YYYY-MM') = (select p from period) as in_period
    from "AiUsage"
  ),
  feat_total as (
    select user_id, jsonb_object_agg(feature, jsonb_build_object('calls', c, 'credits', cr)) as j
    from (select user_id, feature, count(*) as c, sum(credits) as cr from ledger group by 1, 2) x
    group by 1
  ),
  feat_period as (
    select user_id, jsonb_object_agg(feature, jsonb_build_object('calls', c, 'credits', cr)) as j
    from (select user_id, feature, count(*) as c, sum(credits) as cr from ledger where in_period group by 1, 2) x
    group by 1
  ),
  totals as (
    select
      user_id,
      count(*)::bigint as calls_total,
      coalesce(sum(credits), 0)::bigint as credits_total,
      count(*) filter (where in_period)::bigint as calls_period,
      coalesce(sum(credits) filter (where in_period), 0)::bigint as credits_period
    from ledger
    group by 1
  )
  select
    t.user_id, t.calls_total, t.credits_total, t.calls_period, t.credits_period,
    coalesce(fp.j, '{}'::jsonb), coalesce(ft.j, '{}'::jsonb)
  from totals t
  left join feat_period fp on fp.user_id = t.user_id
  left join feat_total  ft on ft.user_id = t.user_id
$$;
revoke all on function public.rn_user_ai_usage() from public;
grant execute on function public.rn_user_ai_usage() to anon, authenticated, service_role;
