-- Minimal read model for the local COO bot. It exposes only the user id and
-- first non-sample problem timestamp; labels come from the existing User API.
create or replace view public.reviewnotes_activated_users
with (security_invoker = on) as
select
  u.id as user_id,
  min(p."createdAt") as first_problem_at
from public."User" u
join public."Note" n on n."userId" = u.id
join public."Problem" p on p."noteId" = n.id
where p."createdAt" >= u."createdAt"
  and n.origin is distinct from 'sample'
  and u.role <> 'ADMIN'
  and lower(u.email) <> 'test@reviewnotes.app'
group by u.id;

revoke all on public.reviewnotes_activated_users from public, anon, authenticated;
grant select on public.reviewnotes_activated_users to service_role;

notify pgrst, 'reload schema';
