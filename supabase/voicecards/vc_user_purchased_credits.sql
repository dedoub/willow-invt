-- 사용자별 구매 크레딧 누적 합 (purchase 이벤트, 봇 제외). 상품→크레딧 매핑.
-- 대시보드 사용자 테이블 '구매 크레딧' 열 총값.
-- apply: 원격 project juyitkynbavhllyjidhz
CREATE OR REPLACE FUNCTION public.vc_user_purchased_credits()
 RETURNS TABLE(user_id text, purchased_credits bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select user_id,
         sum(case properties->>'product_id'
               when 'com.monor.voicecards.credits.1000'  then 1000
               when 'com.monor.voicecards.credits.5500'  then 5500
               when 'com.monor.voicecards.credits.12000' then 12000
               else 0 end)::bigint as purchased_credits
  from anonymous_events_real_users
  where event_name = 'credits_changed'
    and properties->>'reason' = 'purchase'
    and is_likely_bot = false
    and user_id is not null
  group by user_id
$function$;
