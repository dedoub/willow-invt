-- 리뷰노트 답변 발행. 적용처: review-notes (kumaqaizejnjrvfqhahu).
-- 대시보드 고객문의함이 이 함수만 부른다. 자체 관리자 라우트
-- (app/api/admin/inquiries/[id]/route.ts) 는 아직 Prisma 로 직접 쓴다 —
-- 그쪽을 이 함수로 옮기면 발행 순서가 DB 한 곳에만 남는다.
--
-- Prisma 스키마라 식별자가 대소문자 섞임이고 큰따옴표가 필요하다.
--   · "InquiryMessage".id 는 Prisma 가 앱에서 만드는 cuid 라 DB 기본값이 없다.
--     SQL 에서 넣을 때는 uuid 를 문자열로 쓴다 — 칼럼이 text 라 형식은 자유롭고,
--     둘이 섞여도 유일하기만 하면 된다.
--   · 시각 칼럼이 timestamp without time zone 이다. Prisma 는 UTC 를 넣으므로
--     UTC 로 못박아 기존 행과 같은 자를 쓴다.
create or replace function public.publish_inquiry_reply(
  p_thread_id text,
  p_body      text,
  p_source    text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists text;
begin
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'publish_inquiry_reply: empty body';
  end if;

  select id into v_exists
    from public."InquiryThread" where id = p_thread_id for update;
  if v_exists is null then
    raise exception 'publish_inquiry_reply: no such thread %', p_thread_id;
  end if;

  insert into public."InquiryMessage" ("id", "threadId", "sender", "body", "createdAt")
  values (gen_random_uuid()::text, p_thread_id, 'SUPPORT'::"InquirySender", p_body,
          (now() at time zone 'utc'));

  update public."InquiryThread"
     set "draftBody" = null,
         "draftAt" = null,
         "unreadForUser" = true,
         "unreadForAdmin" = false,
         "lastMessageAt" = (now() at time zone 'utc')
   where id = p_thread_id;

  return null;
end;
$$;

revoke all on function public.publish_inquiry_reply(text, text, text) from public;
grant execute on function public.publish_inquiry_reply(text, text, text) to service_role;
