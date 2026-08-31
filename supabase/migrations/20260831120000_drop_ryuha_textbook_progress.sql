-- 류하 교재·진도 관리 제거 (2026-08-31, CEO)
--
-- 진도 관리는 리뷰노트에서 직접 한다. 대시보드 페이지(1f30cb2)와 API·MCP·봇(290fdd4)에서
-- 이미 걷어냈고, 이 마이그레이션이 읽는 곳 없이 남아 있던 테이블과 컬럼을 정리한다.
--
-- 드롭 직전 내용 (복구가 필요하면 아래 INSERT 주석을 풀어 되살린다):
--   ryuha_subjects      3행  — 초등수학 5-2 / 초등수학 4-1 / 11+ 수학
--   ryuha_textbooks     2행  — 만점왕(EBS) / Galore Park 11+ Maths Revision Guide
--   ryuha_chapters     12행  — 만점왕 단원 12개, 전부 status='pending'
--   ryuha_study_ranges  0행
--   ryuha_schedules.subject_id      값 있는 행 0건
--   ryuha_schedules.study_range_id  값 있는 행 0건
--   ryuha_schedules.chapter_id      값 있는 행 0건
--   ryuha_schedules.chapter_ids     값 있는 행 18건 — 전부 **이미 삭제된 챕터를 가리키는
--     깨진 참조**다(남은 12개 챕터와 ID가 하나도 겹치지 않음). 잃는 정보 없음.
--
-- 복구용 원본 (2026-08-31 백업):
--
-- INSERT INTO ryuha_subjects (id, name, color, icon, order_index, created_at) VALUES
--  ('2f398318-c026-4f09-8bfc-1397b92ab229','초등수학 5-2','#3b82f6','languages',2,'2026-01-18T16:12:45.615424+00'),
--  ('dd4c6995-9366-48a4-b20a-4621f01b36c0','초등수학 4-1','#22c55e','book',0,'2026-01-19T03:17:42.499227+00'),
--  ('ede99e48-d693-4ea5-a26f-f10603efc5ed','11+ 수학','#8b5cf6','book',3,'2026-05-31T16:32:38.33325+00');
--
-- INSERT INTO ryuha_textbooks (id, subject_id, name, publisher, description, order_index, created_at) VALUES
--  ('65a2305e-0a45-4ac9-bad5-606880378c88','2f398318-c026-4f09-8bfc-1397b92ab229','만점왕','EBS','EBS 초등온 인터넷강의 듣기',0,'2026-01-18T16:39:51.533106+00'),
--  ('105e1389-ddf5-4c88-855e-aae3ff0a6431','ede99e48-d693-4ea5-a26f-f10603efc5ed','Galore Park 11+ Maths Revision Guide','Galore Park','CLC(영국) 진학 대비 11+ 수학. 개념 + Test Yourself + Summary Test 구성.',0,'2026-05-31T16:32:38.545614+00');
--
-- ryuha_chapters 12행은 전부 textbook_id='65a2305e-0a45-4ac9-bad5-606880378c88'(만점왕),
-- status='pending', completed_at=null, review_completed=false 이고 (name, target_date) 만 다르다:
--  '1. 수의 범위와 어림하기 - 개념책' 2026-01-18 / '1. 수의 범위와 어림하기 - 실전책' 2026-01-18
--  '2. 분수의 곱셈 - 개념책'        2026-02-01 / '2. 분수의 곱셉 - 실전책'        2026-02-01
--  '3. 합동과 대칭 - 개념책'        2026-02-15 / '3. 합동과 대칭 - 실전책'        2026-02-15
--  '4. 소수의 곱셈 - 개념책'        2026-03-01 / '4. 소수의 곱셈 - 실전책'        2026-03-01
--  '5. 직육면체 - 개념책'           2026-03-15 / '5. 직육면체 - 실전책'           2026-03-15
--  '6. 평균과 가능성 - 개념책'      2026-03-29 / '6. 평균과 가능성 - 실전책'      2026-03-29

-- 참조하는 컬럼을 먼저 떼야 테이블이 드롭된다 (FK: schedules → subjects/chapters/study_ranges).
ALTER TABLE ryuha_schedules
  DROP COLUMN IF EXISTS subject_id,
  DROP COLUMN IF EXISTS chapter_id,
  DROP COLUMN IF EXISTS chapter_ids,
  DROP COLUMN IF EXISTS study_range_id;

-- FK 역순으로 드롭.
DROP TABLE IF EXISTS ryuha_chapters;
DROP TABLE IF EXISTS ryuha_textbooks;
DROP TABLE IF EXISTS ryuha_study_ranges;
DROP TABLE IF EXISTS ryuha_subjects;
