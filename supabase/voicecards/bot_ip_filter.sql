-- 봇/심사 트래픽 필터 — 정본 CIDR 목록 + 합성 기기 ID 목록.
--
-- 이게 왜 파일로 있나: 대역을 하나 추가하려면 네 군데를 같이 고쳐야 하는데,
-- 그동안 정의가 프로덕션에만 있어서 매번 pg_get_functiondef로 떠서 손댔다.
-- 하나라도 빠뜨리면 조용히 새는 구조라 목록을 버전관리로 끌고 온다.
--
--   ① 트리거 capture_anonymous_event_ip  → 신규 이벤트의 is_likely_bot
--   ② 백필 update anonymous_events       → 기존 행
--   ③ 뷰 anonymous_events_real_users     → 실유저 집계 (여길 빠뜨리면 통계에 그대로 남는다)
--   ④ refresh materialized view mv_real_users
--
-- 주의: ①과 ③은 서로 다른 기준으로 판단한다. 트리거는 is_likely_bot 컬럼을 쓰고,
-- 뷰는 IP를 직접 다시 본다. 그래서 트리거만 고치면 뷰가 놓친다.
--
-- apply: 원격 project juyitkynbavhllyjidhz
--
-- 별도 레이어 주의: 유저 테이블/유저별 통계는 이 IP 필터를 안 본다.
-- src/lib/voicecards-server.ts 의 EXCLUDED_VOICECARDS_EMAILS(JS 이메일 목록)가 담당한다.
-- 심사 계정처럼 로그인까지 한 케이스는 양쪽 다 등록해야 한다.

-- ── CIDR 목록 ────────────────────────────────────────────────────────────
--   17.0.0.0/8        Apple infra
--   144.178.0.0/16    Apple — App Store 심사 (2026-07-27 추가, 3대가 실사용자로 새어 들어옴)
--   34.0.0.0/9        Google Cloud
--   35.190.0.0/16     Google Cloud
--   44.232.0.0/11     AWS us-west-2
--   52.8.0.0/13       AWS us-west-1
--   54.144.0.0/12     AWS us-east-1
--   64.233.160.0/19   Google Play 심사/프리런치 안드로이드 (2026-08-04 추가)
--   66.102.0.0/20     Google
--   66.249.0.0/16     Google crawler
--   74.125.0.0/16     Google
--   104.132.16.0/20   Google Play 심사/프리런치 (2026-08-04 추가)
--   139.178.128.0/19  datacenter
--   192.178.0.0/16    Google
--
-- 104.132.16.0/20 근거: 릴리스마다 정확히 한 번, 제출 당일 최신 버전으로 2~8분 훑고
-- 사라지는 버스트가 2026-05-12부터 13회. 같은 /24인데 geo가 PH→IN→PL→US로 튄다
-- (프록시 출구 노드라 지오 신뢰 불가). 애플 심사 대역과 같은 성격의 구글판.
-- 심사자는 카드 생성·학습까지 실제로 돌려보기 때문에 행동만으로는 실사용자와 구분이 안 된다.
--
-- 64.233.160.0/19 근거: 104.132.16/20을 막은 당일(2026-08-04) 같은 성격의 안드로이드 트래픽이
-- 64.233.172.96~108에서 또 들어왔다. 2026-06-05부터 10회, 릴리스 버전(1.1.41·42·43·47·49·71·
-- 79·99·101·119)마다 정확히 한 번씩 수초~수분 버스트. 전부 android/US/비로그인이고 대시보드
-- 비로그인 여정 표에 실유저처럼 잡혔다(is_likely_bot=false로 새 대역이라 트리거가 못 잡음).
-- 1.1.119는 스토어 미배포 상태였는데 이 대역 기기가 그 버전을 돌리고 있었다 — 미배포 버전은
-- 심사 트래픽의 강한 신호다. 06-30 버스트에선 로그인까지 했는데(lulamontgomery.32292@gmail.com)
-- 그 계정은 기존 숫자 정규식에 이미 걸려서 유저 테이블 쪽은 손댈 게 없었다.

-- ── 합성 기기 ID 목록 ────────────────────────────────────────────────────
--   00000000-0000-4000-8000-000000000000   Google Play 심사/프리런치 폴백 (2026-08-04 추가)
--
-- 근거: IP로는 못 잡는 케이스다. 위 CIDR들과 달리 이 기기는 출구 IP가 매번 다른 나라의
-- 일반 회선이다 (MY 203.82 / GB 62.254 / PL 77.237 / GB 82.15 / PH 1.37 ×2 / PT 212.113).
-- 그런데 device_id는 전부 이 하나의 제로 UUID다. 앱이 기기 식별자를 못 얻을 때 쓰는
-- 폴백값으로 보이고, 구글 플레이 심사 환경이 매번 거기 걸린다.
--
-- 패턴: 2026-06-20부터 7회, 릴리스 버전(1.1.55·63·67·86·106·120)마다 정확히 한 번,
-- 2~5분 버스트 후 소멸. 뷰가 device_id로 묶으니 이 7회가 한 행으로 뭉쳐서
-- '7일 활동한 기기'로 대시보드 비로그인 여정 표에 실유저처럼 올라왔다.
-- 08-04 버스트에선 로그인까지 했는데(jaimenorris.78037@gmail.com) 그 계정은 기존
-- 숫자 정규식(\.[0-9]{5,}@gmail\.com)에 이미 걸려서 유저 테이블은 손댈 게 없었다.
--
-- 실기기가 같은 폴백값을 쓸 가능성은 남는다. 그래도 여러 기기가 한 행으로 뭉치는 데이터라
-- 어차피 해석이 안 된다. 빼는 쪽이 맞다.

-- ① 트리거
create or replace function public.capture_anonymous_event_ip()
returns trigger
language plpgsql
security definer
as $function$
declare
  hdrs jsonb;
  raw_ip text;
begin
  if new.ip_address is null then
    begin
      hdrs := current_setting('request.headers', true)::jsonb;
    exception when others then
      hdrs := null;
    end;
    if hdrs is not null then
      raw_ip := coalesce(
        hdrs->>'cf-connecting-ip',
        split_part(hdrs->>'x-forwarded-for', ',', 1),
        hdrs->>'x-real-ip'
      );
      raw_ip := nullif(trim(raw_ip), '');
      if raw_ip is not null then
        begin
          new.ip_address := raw_ip::inet;
        exception when others then
          new.ip_address := null;
        end;
      end if;
    end if;
  end if;

  -- 합성 기기 ID는 IP와 무관하게 봇 (출구 IP가 매번 다른 일반 회선이라 CIDR로 못 잡는다)
  if new.device_id = '00000000-0000-4000-8000-000000000000'::uuid then
    new.is_likely_bot := true;
    return new;
  end if;

  if new.ip_address is not null then
    new.is_likely_bot :=
         new.ip_address <<= inet '17.0.0.0/8'
      or new.ip_address <<= inet '144.178.0.0/16'
      or new.ip_address <<= inet '34.0.0.0/9'
      or new.ip_address <<= inet '35.190.0.0/16'
      or new.ip_address <<= inet '44.232.0.0/11'
      or new.ip_address <<= inet '52.8.0.0/13'
      or new.ip_address <<= inet '54.144.0.0/12'
      or new.ip_address <<= inet '64.233.160.0/19'
      or new.ip_address <<= inet '66.102.0.0/20'
      or new.ip_address <<= inet '66.249.0.0/16'
      or new.ip_address <<= inet '74.125.0.0/16'
      or new.ip_address <<= inet '104.132.16.0/20'
      or new.ip_address <<= inet '139.178.128.0/19'
      or new.ip_address <<= inet '192.178.0.0/16';
  end if;

  return new;
end;
$function$;

-- ② 백필 (대역 추가 시 새 CIDR로 바꿔 실행)
-- update anonymous_events
-- set is_likely_bot = true
-- where ip_address <<= inet '64.233.160.0/19' and is_likely_bot is not true;
--
-- update anonymous_events
-- set is_likely_bot = true
-- where device_id = '00000000-0000-4000-8000-000000000000'::uuid and is_likely_bot is not true;

-- ③ 뷰
create or replace view public.anonymous_events_real_users as
 select id, created_at, device_id, raw_device_id, session_id, user_id, event_name,
        properties, app_version, platform, locale, ip_address, country, is_likely_bot
   from anonymous_events_deduped
  where device_id is distinct from '00000000-0000-4000-8000-000000000000'::uuid
    and (ip_address is null
     or not (ip_address <<= '17.0.0.0/8'::inet
          or ip_address <<= '144.178.0.0/16'::inet
          or ip_address <<= '34.0.0.0/9'::inet
          or ip_address <<= '35.190.0.0/16'::inet
          or ip_address <<= '44.232.0.0/11'::inet
          or ip_address <<= '52.8.0.0/13'::inet
          or ip_address <<= '54.144.0.0/12'::inet
          or ip_address <<= '64.233.160.0/19'::inet
          or ip_address <<= '66.102.0.0/20'::inet
          or ip_address <<= '66.249.0.0/16'::inet
          or ip_address <<= '74.125.0.0/16'::inet
          or ip_address <<= '104.132.16.0/20'::inet
          or ip_address <<= '139.178.128.0/19'::inet
          or ip_address <<= '192.178.0.0/16'::inet));

-- ④ refresh materialized view mv_real_users;

-- 검증 (셋 다 0이어야 한다)
-- select
--   (select count(*) from anonymous_events where ip_address <<= inet '64.233.160.0/19' and is_likely_bot is not true) as trigger_leftover,
--   (select count(*) from anonymous_events_real_users where ip_address <<= inet '64.233.160.0/19') as view_leftover,
--   (select count(*) from mv_real_users where ip_address <<= inet '64.233.160.0/19') as mv_leftover;
--
-- select
--   (select count(*) from anonymous_events where device_id = '00000000-0000-4000-8000-000000000000'::uuid and is_likely_bot is not true) as trigger_leftover,
--   (select count(*) from anonymous_events_real_users where device_id = '00000000-0000-4000-8000-000000000000'::uuid) as view_leftover,
--   (select count(*) from mv_real_users where device_id = '00000000-0000-4000-8000-000000000000'::uuid) as mv_leftover;
