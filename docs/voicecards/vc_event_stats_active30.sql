-- 보이스카드 DB(juyitkynbavhllyjidhz)에 2026-08-30 적용한 변경 기록.
-- 이 저장소의 supabase/migrations 는 윌로우 DB 전용이라 여기 남긴다.
--
-- 롤링 30일 활동자에 기기 계정을 포함한 active30 을 vc_event_stats 에 추가한다.
-- memberActive30 은 has_login 인 디바이스만 세어 로그인 없이 쓰는 사용자가 빠져 있었다.
-- 보이스카드는 로그인 없이도 쓸 수 있고 그 사용자도 크레딧을 사므로, MAU 분모에서 빼면
-- 1인당 지표(CPMAU)가 부풀려진다. 학습 활성화 카드가 구글 경로와 기기 계정을 합산하는
-- 것과 같은 이유다. 적용 시점 값: memberActive30 133 vs active30 285.
--
-- memberActive30 은 로그인율 분모로 계속 쓰이므로 그대로 두고 키만 더한다.
-- 함수 본문을 손으로 옮겨 적지 않고 현재 정의를 읽어 치환한다(나머지 12KB 가
-- 한 글자도 바뀌지 않도록). 적용 후 mv_event_stats 를 refresh 해야 반영된다.
do $do$
declare src text; out text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'vc_event_stats_live' and n.nspname = 'public';

  if src is null then raise exception 'vc_event_stats_live 를 찾지 못했어요'; end if;
  if position('all_active30' in src) > 0 then raise notice '이미 적용됨'; return; end if;

  out := replace(src, 'member_active30 as (',
$cte$all_active30 as (
  select d.kdate,
    (select count(distinct f.device_id)
       from dev_day_flag f
      where f.kdate <= d.kdate and f.kdate > d.kdate - 30) as base
  from all_dates d
),
member_active30 as ($cte$);

  out := replace(out, '''memberActive30'',coalesce(ma.base,0)',
                      '''memberActive30'',coalesce(ma.base,0),''active30'',coalesce(aa.base,0)');

  out := replace(out, 'left join member_active30 ma using(kdate)',
                      'left join member_active30 ma using(kdate) left join all_active30 aa using(kdate)');

  if out = src then raise exception '치환이 하나도 일어나지 않았어요'; end if;
  execute out;
end
$do$;

refresh materialized view public.mv_event_stats;
