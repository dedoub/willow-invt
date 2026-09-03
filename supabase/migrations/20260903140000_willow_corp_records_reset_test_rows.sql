-- 법인 서류함 시드 전 초기화: 스키마 검증·CLI 왕복 테스트로 생긴 행만 존재한다.
-- 가드 트리거를 잠시 끄고 전부 비운 뒤 다시 켠다. 이후 시드는 무결한 체인에서 시작한다.
alter table public.willow_corp_events            disable trigger willow_corp_events_guard;
alter table public.willow_corp_document_versions disable trigger willow_corp_document_versions_guard;
alter table public.willow_corp_rules             disable trigger willow_corp_rules_guard;
alter table public.willow_corp_decisions         disable trigger willow_corp_decisions_guard;
delete from public.willow_corp_links;
delete from public.willow_corp_actions;
delete from public.willow_corp_profiles;
update public.willow_corp_documents set current_version_id = null;
delete from public.willow_corp_document_versions;
delete from public.willow_corp_rules;
delete from public.willow_corp_documents;
delete from public.willow_corp_decisions;
delete from public.willow_corp_events;
delete from public.willow_corp_sequences;
alter sequence public.willow_corp_events_id_seq restart with 1;
alter table public.willow_corp_events            enable trigger willow_corp_events_guard;
alter table public.willow_corp_document_versions enable trigger willow_corp_document_versions_guard;
alter table public.willow_corp_rules             enable trigger willow_corp_rules_guard;
alter table public.willow_corp_decisions         enable trigger willow_corp_decisions_guard;
