# BIBLOBOOK Supabase RLS 보안 조치 안내 (담당자용)

- **프로젝트**: BIBLOBOOK (`zghartrwhjfqydlbhigs`)
- **경보 출처**: Supabase Security — `rls_disabled_in_public` (Critical), 2026-07-20 기준
- **작성일**: 2026-07-22
- **작성**: 윌로우 대시보드 세션에서 진단 (조치는 미실행 — 아래 판단 후 담당자가 실행)

---

## 1. 요약 (무슨 일인가)

`public` 스키마의 **테이블 111개에 RLS(Row-Level Security)가 꺼져 있고, 정책도 0개**입니다.
확인 결과 **111개 전부 `anon` 역할이 SELECT·DELETE 가능**합니다.

즉, **프로젝트 URL과 anon 공개키만 있으면 누구나** PostgREST(`/rest/v1/...`)로 이 테이블들의
**전체 데이터를 읽고, 수정·삭제**할 수 있습니다. anon 키는 클라이언트에 노출되는 키라 사실상 공개입니다.

- 총 노출 규모: 약 **4,000만 행 이상** (최대 `skku_charge` 9.2M, `facet_word_df` 6.4M, `books` 1.57M 등)
- **개인정보(PII) 포함 가능 테이블**: `skku_patron`(약 43만, 도서관 이용자), `school_reviews`(2.6만),
  `search_feedback`, `md_comments`, `handwritten_emotional_texts`, `poem_letters` → **우선 차단 대상**

> 참고: voice-cards 프로젝트의 동일 경보(`vc_purchase_signal_snapshots` 1건)는 2026-07-22 조치 완료(RLS 활성 + anon 권한 회수).

---

## 2. ⚠️ 조치 전 반드시 확인할 것 (앱이 깨질 수 있음)

RLS를 켜면 동작 원리상:
- **`service_role` 키는 RLS를 우회** → 서버(백엔드/크론/SSR)가 service 키로 접근하면 **영향 없음**.
- **`anon` / `authenticated` 키는 정책이 없으면 전부 거부** → 프런트엔드가 anon 키로 이 테이블을 직접 읽고 있으면 **읽기가 전부 막힘(앱 장애)**.

**그래서 무작정 RLS를 켜면 안 되고, 먼저 접근 패턴을 판별해야 합니다:**

BIBLOBOOK 코드베이스에서 다음을 확인하세요.
```bash
# 1) 클라이언트가 anon 키로 테이블을 직접 조회하는지
grep -rniE "createClient|SUPABASE_ANON|NEXT_PUBLIC_SUPABASE" <repo> | grep -v node_modules
grep -rniE "\.from\('(books|authors|works|skku_|book_|search_)" <repo> | grep -v node_modules

# 2) 서버 전용(service_role)만 쓰는지
grep -rniE "SERVICE_ROLE|SUPABASE_SERVICE" <repo> | grep -v node_modules
```

- **케이스 A — 서버(service_role)만 사용**: RLS를 켜도 앱 무영향. → **3-A** 진행(전체 RLS 활성, 정책 불필요). 가장 안전·권장.
- **케이스 B — 프런트가 anon으로 직접 조회**: 공개해도 되는 콘텐츠 테이블에는 **읽기 전용 정책**을 부여하고,
  민감/내부 테이블은 anon 권한을 회수해야 함. → **3-B** 진행.

#### 사전 조사 결과 (2026-07-22, 로컬 repo 기준 — 케이스 A로 추정)
- 고객 대면 프런트 `biblo-rims-front`는 **다른** Supabase 프로젝트(`avepusjmfaqdbfiitvch`)를 anon으로 사용 → **BIBLOBOOK(`zghartrwhjfqydlbhigs`)이 아님**.
- 로컬 biblo repo들(`biblo-chatbot`, `biblo-rims-data`, `biblo-mapping-workflow` 등)에서 `zghartrwhjfqydlbhigs` **참조가 발견되지 않음** (env·코드 모두).
- → BIBLOBOOK은 프런트가 anon으로 직접 읽는 프로젝트가 **아닐 가능성이 높음**(서버/파이프라인·툴링이 service_role로 접근하는 데이터 프로젝트로 추정). **케이스 A(3-A)일 확률이 큼.**
- **단, 확정은 담당자가**: 이 프로젝트에 **쓰기(수집/증강 파이프라인)를 하는 프로세스가 service_role 키를 쓰는지** 반드시 확인 후 3-A 실행. (미커밋 env·별도 머신·크론일 수 있음)

---

## 3. 조치 방법

### 3-A. (권장, 케이스 A) 전체 테이블 RLS 활성 + anon/authenticated 권한 회수

RLS만 켜면 정책이 없어 anon은 거부되지만, **테이블 GRANT까지 회수**하면 이중 방어가 됩니다.
아래는 `public` 스키마의 **RLS 꺼진 모든 테이블**에 한 번에 적용하는 스크립트입니다.

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated;', r.relname);
  END LOOP;
END $$;
```

> service_role 접근은 그대로 유지됩니다. 프런트가 service 키만 쓰면 이걸로 끝입니다.

### 3-B. (케이스 B) 공개 콘텐츠는 읽기 정책, 민감은 차단

공개해도 되는 콘텐츠(예: `books`, `authors`, `works`, `genre` …)만 **anon 읽기 전용** 허용:
```sql
-- 예시: 공개 콘텐츠 테이블 1개
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.books FROM anon, authenticated;  -- 쓰기 차단
CREATE POLICY "public read" ON public.books FOR SELECT TO anon, authenticated USING (true);
```
민감/내부/PII/백업 테이블(아래 4장 분류의 ②③④)은 **3-A 방식(RLS + 권한 회수, 정책 없음)** 으로 완전 차단.

### 3-C. 백업·임시 테이블은 삭제 또는 스키마 이동 권장

아래 테이블들은 마이그레이션 잔재/백업으로 보입니다. `public`에 두면 계속 노출되니
**삭제하거나 별도 스키마(예: `archive`)로 옮기는 것**을 권장(옮기면 PostgREST 노출에서 제외됨):
`authors_bio_backup`, `bibloai_toc_backup`, `bf_bak_20260612`, `fp_cleanup_backup_202606`,
`fp_demote_concept_nokr_202606`, `fp_fake_template_leak_202606`, `fp_promote_claude_opus_202606`,
`codex_manual_vec_cleared_202606`, `zz_backup_book_character_migrated`, `zz_backup_title_slash_migrated`,
`_migration_log`, `_bio_map`.

---

## 4. 테이블 분류 (우선순위)

### ① 최우선 — PII/사용자 데이터 (즉시 차단)
`skku_patron`(≈432k, 도서관 이용자), `school_reviews`(≈26k), `search_feedback`, `md_comments`,
`skku_md_comment`, `las2_md_comment`, `handwritten_emotional_texts`, `poem_letters`, `search_miss_log`

### ② 대용량 코어/서지 데이터 (읽기는 공개 가능성, 쓰기는 반드시 차단)
`skku_charge`(9.2M), `facet_word_df`(6.4M), `skku_item`(2.5M), `concept_freq`(2.2M),
`book_authors`(2.1M), `book_authors_v2`(1.8M), `books`(1.57M), `frbr_book_map`(1.48M),
`augment_queue`(1.48M), `frbr_works`(1.42M), `authors_v2`(1.29M), `book_aladin`(1.22M),
`book_concept_cards`(1.16M), `book_augmented`(1.16M), `book_kyobo`(1.11M), `paper_blocks`(1.01M),
`las2_skku_biblio`(1.0M), `authors`(968k), `skku_biblio_author`(934k), `school_holdings`(909k),
`book_fingerprint`(896k), `nlsh_relations`(795k), `skku_work`/`works`(789k) 외 다수

### ③ 내부 파이프라인/큐/설정 (전부 차단)
`fp_regen_queue`, `gen_missing_targets`, `collect_state`, `daily_api_count`, `augment_queue`,
`search_weights_config`, `search_blocklist`, `search_synonyms`, `search_clusters`,
`domain_lexicon`, `pollution_rerank_terms`, `single_char_allow`, `query_presets`, `fp_quality_scores`,
`fp_dashboard_cache`, `susu_dashboard_stats`, `library_stats`, `marc_gen`, `marc_eval` 외

### ④ 백업/임시 (삭제 또는 archive 스키마 이동 — 3-C)
`*_backup`, `bf_bak_20260612`, `*_202606`, `zz_backup_*`, `_migration_log`, `_bio_map`

> 전체 111개 목록과 행수는 부록(6장) 참고.

---

## 5. 조치 후 검증

```sql
-- (1) RLS 꺼진 public 테이블이 0이어야 함
SELECT count(*) AS rls_off
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false;

-- (2) anon이 SELECT/DELETE 가능한 public 테이블이 0이어야 함(권한 회수까지 한 경우)
SELECT count(*) AS anon_readable
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND has_table_privilege('anon', c.oid, 'SELECT');
```
그리고 **Supabase 대시보드 → Advisors → Security** 에서 `rls_disabled_in_public` 경보가 사라졌는지 확인.
마지막으로 **앱 주요 화면(검색/도서 상세 등)이 정상 동작**하는지 스모크 테스트.

---

## 6. 참고: 남은 관련 경보 (같이 처리 권장)

Advisor에는 이 외에도 다음이 있었습니다(치명도 낮음):
- `rls_enabled_no_policy` 13건 — RLS는 켜졌는데 정책이 없어 anon이 접근 못 함(콘텐츠면 정책 필요, 내부면 정상)
- `function_search_path_mutable` 117건, `security_definer_view` 다수 — 함수 `search_path` 고정 권장
- `extension_in_public` 7건 — 확장은 `extensions` 스키마로 이동 권장

이들은 이번 Critical(전체 공개 노출) 처리 후 후속으로 다루면 됩니다.

---

## 7. 한 줄 요약

> **anon 키만으로 111개 테이블 전체가 읽기·삭제 가능한 상태.** 서버가 service_role만 쓰면 **3-A 스크립트 한 번**으로
> 전부 안전해지고 앱도 안 깨짐. 프런트가 anon으로 직접 읽는 테이블이 있으면 그 테이블만 읽기 정책(3-B)으로 예외 처리.
> 백업/임시 테이블은 삭제·이동(3-C). PII 테이블(`skku_patron` 등)부터 최우선.
