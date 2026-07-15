-- ============================================================================
-- ReviewNotes 활성화 집계 (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: review-notes (kumaqaizejnjrvfqhahu) — 메인 willow-invt DB 아님.
-- 활성화 정의(2026-07-15 CEO): 문제를 하나라도 등록한 유저. Problem→Note→userId 경유.
-- Problem/Note는 RLS로 raw 접근 불가 → 유저별 첫 문제 등록 시각만 SECURITY DEFINER로 노출.
-- 소비처: src/lib/reviewnotes-supabase.ts getReviewNotesTrafficStats() (activation 필드)
-- ============================================================================
create or replace function public.rn_activation()
returns table(user_id text, first_problem_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select n."userId" as user_id, min(p."createdAt") as first_problem_at
  from "Problem" p
  join "Note" n on n.id = p."noteId"
  where n."userId" is not null
  group by n."userId"
$$;
revoke all on function public.rn_activation() from public;
grant execute on function public.rn_activation() to anon, authenticated, service_role;
