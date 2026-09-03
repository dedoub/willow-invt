-- 법인 서류함 fixups after review: company default on sequences, decision status index
alter table public.willow_corp_sequences alter column company set default 'willow';
create index if not exists willow_corp_decisions_status_idx on public.willow_corp_decisions (company, status);
