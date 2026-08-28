-- 스크립타 답변 발행. 적용처: scripta (xmlbtykkgozxmjkyshfz).
-- 대시보드 고객문의함이 이 함수만 부른다 — 메시지 삽입과 미읽음 플래그가 한
-- 트랜잭션이라 "메시지는 갔는데 미읽음이 안 선" 중간 상태가 없다.
-- 정본은 보이스카드 supabase/migrations/085_inquiry.sql 의 같은 이름 함수다.
create or replace function public.publish_inquiry_reply(
  p_thread_id uuid,
  p_body      text,
  p_source    text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists uuid;
begin
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'publish_inquiry_reply: empty body';
  end if;

  select id into v_exists
    from public.scripta_inquiry_threads where id = p_thread_id for update;
  if v_exists is null then
    raise exception 'publish_inquiry_reply: no such thread %', p_thread_id;
  end if;

  insert into public.scripta_inquiry_messages (thread_id, sender, body)
  values (p_thread_id, 'support', p_body);

  update public.scripta_inquiry_threads
     set draft_body = null,
         draft_at = null,
         unread_for_user = true,
         unread_for_admin = false,
         last_message_at = now()
   where id = p_thread_id;

  -- 채널 개념이 없다. 호출부는 null 을 "이어서 할 일 없음"으로 읽는다.
  return null;
end;
$$;

-- PUBLIC 자체를 회수해야 잠긴다(anon/authenticated 는 PUBLIC 을 통해 상속받는다).
-- service_role 도 함께 끊기므로 다시 명시적으로 준다.
revoke all on function public.publish_inquiry_reply(uuid, text, text) from public;
grant execute on function public.publish_inquiry_reply(uuid, text, text) to service_role;
