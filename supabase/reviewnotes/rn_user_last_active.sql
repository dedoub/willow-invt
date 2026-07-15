-- ============================================================================
-- ReviewNotes 유저별 마지막 활동 시각 (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: review-notes (kumaqaizejnjrvfqhahu) — 메인 willow-invt DB 아님.
-- EventLog는 RLS로 raw 접근 불가(anon 정책 없음) → 집계만 SECURITY DEFINER로 노출.
-- 주의: EventLog 트래킹은 2026-06-24 시작 — 그 이전 활동은 잡히지 않음 (null = 활동 기록 없음).
-- 소비처: src/lib/reviewnotes-supabase.ts getReviewNotesUsers()
-- ============================================================================
create or replace function public.rn_user_last_active()
returns table(user_id text, last_active timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select "userId" as user_id, max("createdAt") as last_active
  from "EventLog"
  where "userId" is not null
  group by "userId"
$$;
revoke all on function public.rn_user_last_active() from public;
grant execute on function public.rn_user_last_active() to anon, authenticated, service_role;
