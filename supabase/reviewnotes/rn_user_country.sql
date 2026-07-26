-- ============================================================================
-- ReviewNotes 유저별 국가 RPC (source of truth)
-- ----------------------------------------------------------------------------
-- 대상 프로젝트: review-notes (kumaqaizejnjrvfqhahu) — 메인 willow-invt DB 아님.
-- 목적: 유저 테이블 '국가' 열. 리뷰노트는 로그인 후에만 활동이라 유저 프로필에
--   국가/언어 컬럼이 없다. 방문(PageView)만 IP 기반 country를 가지므로,
--   EventLog(userId)와 PageView가 공유하는 방문자 ID(sessionId)로 조인해
--   유저별 first-touch(가장 이른 방문) 국가를 귀속한다.
--   rn_traffic_stats.sql 의 user_touch CTE와 동일한 귀속 규칙(회원 국가 파이와 일치).
-- 국가가 비어있는 방문은 제외하고, 국가가 있는 가장 이른 방문을 채택 → 랜딩을
--   국가 미상으로 처음 밟았어도 이후 국가가 잡히면 표시된다. 방문 이력이 없거나
--   country가 전부 비면 해당 유저는 결과에 없음(테이블에서 '—').
-- RLS 하드닝(2026-06-21)으로 PageView/EventLog raw select가 막혀 있어 집계 전용
--   SECURITY DEFINER 함수로 노출한다(rn_traffic_stats 패턴).
-- 소비처: src/lib/reviewnotes-supabase.ts getReviewNotesUsers()
-- ============================================================================
create or replace function public.rn_user_country()
returns table(user_id text, country text)
language sql
stable
security definer
set search_path = public
as $$
  with user_sessions as (
    select distinct "userId", "sessionId" from "EventLog"
    where "userId" is not null and coalesce("sessionId", '') <> ''
  )
  select distinct on (us."userId") us."userId" as user_id, pv.country
  from user_sessions us
  join "PageView" pv on pv."sessionId" = us."sessionId"
  where coalesce(nullif(pv.country, ''), '') <> ''
  order by us."userId", pv."createdAt" asc
$$;
revoke all on function public.rn_user_country() from public;
grant execute on function public.rn_user_country() to anon, authenticated, service_role;
