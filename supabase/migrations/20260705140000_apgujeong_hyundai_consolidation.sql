-- 압구정 현대 명칭 통합 (3개 통합) — 호가(네이버)·실거래(MOLIT) 이름 불일치로
-- 리서치 페이지에서 반쪽씩만 보이던 문제 해결. 네이버 통합명 3개로 정규화.
-- 멱등(idempotent): 재실행 안전.

-- 1) re_complexes: 분리명 6개 untrack (통합명 3개는 이미 tracked 유지)
update re_complexes set is_tracked = false, updated_at = now()
where dong_name = '압구정동' and name in (
  '신현대9차','신현대11차',
  '현대1차(12,13,21,22,31,32,33동)','현대2차(10,11,20,23,24,25동)',
  '현대6차(78~81,83,84,86,87동)','현대7차(73~77,82,85동)'
);

-- 2) re_trades: 압구정동 분리명 → 통합명 (dong 스코핑으로 타 지역 현대 오매핑 방지)
update re_trades set complex_name = '현대1,2차'
  where dong_name = '압구정동' and complex_name in ('현대1차(12,13,21,22,31,32,33동)','현대2차(10,11,20,23,24,25동)');
update re_trades set complex_name = '현대6,7차'
  where dong_name = '압구정동' and complex_name in ('현대6차(78~81,83,84,86,87동)','현대7차(73~77,82,85동)');
update re_trades set complex_name = '신현대(9,11,12차)'
  where dong_name = '압구정동' and complex_name in ('신현대9차','신현대11차','신현대12차');

-- 3) re_rentals: 동일 정규화 (분리명이 압구정 고유라 exact 매칭 안전)
update re_rentals set complex_name = '현대1,2차'
  where complex_name in ('현대1차(12,13,21,22,31,32,33동)','현대2차(10,11,20,23,24,25동)');
update re_rentals set complex_name = '현대6,7차'
  where complex_name in ('현대6차(78~81,83,84,86,87동)','현대7차(73~77,82,85동)');
update re_rentals set complex_name = '신현대(9,11,12차)'
  where complex_name in ('신현대9차','신현대11차','신현대12차');

-- go-forward 정규화는 scripts/real-estate-pipeline.ts normalizeComplexName() 에서 처리(재유입 방지).
