/**
 * 비즈니스 에세이 씨드 문항.
 *
 * 생성은 보이스카드의 llm-json 프록시를 타는데 그쪽이 gemini-2.5-flash 에 thinking 0 으로
 * 고정돼 있다. 프롬프트를 네 번 강화해도 논증이 올라오지 않아, 목표 수준의 문장을 손으로
 * 써서 넣는다(CEO 2026-09-14 "씨드를 너가 만들어서 넣어줘").
 *
 * 기준은 Marc Levinson, *The Box* 의 산문이다. 문장마다:
 *   · 22~34 낱말, 종속절·분사구가 둘 이상
 *   · 관계를 말하는 데 그치지 않고 **왜 그런지**, 그리고 **누가 값을 치렀는지**를 말한다
 *   · 크레인·궤간·선하증권처럼 만질 수 있는 명사를 쓴다. '이해관계자'·'효율성'은 쓰지 않는다
 *   · 3인칭. 독자에게 권하지 않는다
 *
 * 청킹은 영어 어순 그대로다. 청크 N 의 한국어는 청크 N 의 영어를 그 자리에서 옮긴 것이고,
 * 한국어 어순으로 재배열하지 않는다(.claude/skills/chunk-translation).
 *
 * 사용법:
 *   npx tsx scripts/seed-english-essays.ts          # 넣기 (이미 있는 문장은 건너뜀)
 *   npx tsx scripts/seed-english-essays.ts --dry    # 검증만
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const PROFILE = 'ceo_written'
const SOURCE = 'business_topics'

interface Seed {
  topic: string
  chunks: { en: string; ko: string }[]
  korean_full: string
}

const SEEDS: Seed[] = [
  {
    topic: '항만과 내륙 연결',
    korean_full: '항만은 해안에서 가장 높은 크레인을 들이고도 물동량을 잃을 수 있었다. 그토록 빠르게 들어 올린 상자들이 어떤 항만 당국도 통제하지 못하는 철도로 떠나야 했기 때문이다.',
    chunks: [
      { en: 'A port could install the tallest cranes on the coast', ko: '항만은 해안에서 가장 높은 크레인을 들일 수 있었다' },
      { en: 'and still lose traffic,', ko: '그러고도 물동량을 잃을 수 있었다,' },
      { en: 'because the boxes it lifted so quickly', ko: '그토록 빠르게 들어 올린 상자들이' },
      { en: 'had to leave on railways', ko: '철도로 떠나야 했기 때문이다' },
      { en: 'that no harbour authority controlled.', ko: '어떤 항만 당국도 통제하지 못하는.' },
    ],
  },
  {
    topic: '정시율 지표',
    korean_full: '항공사가 정시에 도착한 항공편의 비율로 순위 매겨지자 운항 시각표는 조용히 길어졌고, 그리하여 네 시간이 걸리던 여정이 이제 다섯 시간에 정시가 되었다.',
    chunks: [
      { en: 'Once airlines were ranked', ko: '항공사가 순위 매겨지자' },
      { en: 'by the share of flights arriving on time,', ko: '정시에 도착한 항공편의 비율로,' },
      { en: 'schedules quietly lengthened,', ko: '운항 시각표는 조용히 길어졌다,' },
      { en: 'so that a journey which had taken four hours', ko: '그리하여 네 시간이 걸리던 여정이' },
      { en: 'was now punctual at five.', ko: '이제 다섯 시간에 정시가 되었다.' },
    ],
  },
  {
    topic: '재고의 이전',
    korean_full: '재고를 거의 두지 않는다고 자랑하던 소매업체들은 창고를 없앤 것이 아니었다. 그들은 그것을 공급업체로 되밀었을 뿐이고, 공급업체는 이제 같은 물건의 자금을 더 얇은 마진으로 대게 되었다.',
    chunks: [
      { en: 'Retailers that boasted of carrying almost no inventory', ko: '재고를 거의 두지 않는다고 자랑하던 소매업체들은' },
      { en: 'had not abolished the warehouse;', ko: '창고를 없앤 것이 아니었다;' },
      { en: 'they had pushed it back onto suppliers', ko: '그들은 그것을 공급업체로 되밀었을 뿐이다' },
      { en: 'who now financed the same goods', ko: '이제 같은 물건의 자금을 대게 된' },
      { en: 'on thinner margins.', ko: '더 얇은 마진으로.' },
    ],
  },
  {
    topic: '수수료와 유인',
    korean_full: '영업사원에게 이익이 아니라 매출 기준으로 수수료를 지급하는 것은 그들에게 응대하기 가장 어려운 거래처를 따내도록 가르쳤고, 회사는 최고의 고객이 최악이었음을 발견했다.',
    chunks: [
      { en: 'Paying salesmen a commission on revenue', ko: '영업사원에게 매출 기준 수수료를 지급하는 것은' },
      { en: 'rather than on profit', ko: '이익 기준이 아니라' },
      { en: 'taught them to win the accounts', ko: '그들에게 거래처를 따내도록 가르쳤다' },
      { en: 'that were hardest to serve,', ko: '응대하기 가장 어려운,' },
      { en: 'and the firm discovered its best customers were its worst.', ko: '그리고 회사는 최고의 고객이 최악이었음을 발견했다.' },
    ],
  },
  {
    topic: '선발 이익의 수명',
    korean_full: '트랜지스터를 가장 먼저 줄인 회사는 어떤 경쟁자도 따를 수 없는 마진을 누렸다. 그러나 그 장비는 자본을 모을 수 있는 누구에게나 팔리고 있었고, 모두가 삼 년 안에 그것을 갖게 되었다.',
    chunks: [
      { en: 'The first firm to shrink its transistors', ko: '트랜지스터를 가장 먼저 줄인 회사는' },
      { en: 'enjoyed a margin no competitor could match,', ko: '어떤 경쟁자도 따를 수 없는 마진을 누렸다,' },
      { en: 'though that equipment was for sale', ko: '그러나 그 장비는 팔리고 있었다' },
      { en: 'to anyone who could raise the capital,', ko: '자본을 모을 수 있는 누구에게나,' },
      { en: 'and everyone had it within three years.', ko: '그리고 모두가 삼 년 안에 그것을 갖게 되었다.' },
    ],
  },
  {
    topic: '실제 제약',
    korean_full: '전력회사들은 정전의 원인을 수요로 돌렸다. 그러나 실제 제약은 1974년에 승인된 송전선이었고, 아무도 그것을 교체할 비용을 대려 하지 않았다.',
    chunks: [
      { en: 'Utilities blamed demand for the blackouts,', ko: '전력회사들은 정전의 원인을 수요로 돌렸다,' },
      { en: 'but the binding constraint', ko: '그러나 실제 제약은' },
      { en: 'was a transmission line approved in 1974', ko: '1974년에 승인된 송전선이었다' },
      { en: 'that nobody had been willing to pay to replace.', ko: '아무도 교체 비용을 대려 하지 않았던.' },
    ],
  },
  {
    topic: '예금 보호와 대출',
    korean_full: '예금이 보호되자 예금자들은 어느 은행이 건전한지 묻기를 그만두었고, 가장 빠르게 성장한 은행은 신중한 쪽이 나서지 않는 자리에 기꺼이 대출하려는 곳들이었다.',
    chunks: [
      { en: 'Once deposits were insured,', ko: '예금이 보호되자,' },
      { en: 'savers stopped asking which bank was sound,', ko: '예금자들은 어느 은행이 건전한지 묻기를 그만두었다,' },
      { en: 'and the banks that grew fastest', ko: '그리고 가장 빠르게 성장한 은행은' },
      { en: 'were those willing to lend', ko: '기꺼이 대출하려는 곳들이었다' },
      { en: 'where the cautious would not.', ko: '신중한 쪽이 나서지 않는 자리에.' },
    ],
  },
  {
    topic: '때가 만든 성공',
    korean_full: '화상 전화는 두 번 실패했다. 나중에 기술이 나아져서가 아니라, 신호를 나르는 비용이 충분히 낮아져 그럴 값어치가 있는지 아무도 따질 필요가 없어졌기 때문이다.',
    chunks: [
      { en: 'The picture telephone failed twice,', ko: '화상 전화는 두 번 실패했다,' },
      { en: 'not because the engineering later improved', ko: '나중에 기술이 나아져서가 아니라' },
      { en: 'but because the cost of carrying a signal', ko: '신호를 나르는 비용이' },
      { en: 'had fallen so far', ko: '충분히 낮아져서' },
      { en: 'that nobody needed to decide whether it was worth paying for.', ko: '그럴 값어치가 있는지 아무도 따질 필요가 없어졌기 때문이다.' },
    ],
  },
  {
    topic: '같은 자산 다른 운명',
    korean_full: '두 출판사가 같은 해에 같은 인쇄 공장을 사들였다. 편집자를 건물에 남겨 둔 쪽은 살아남았고, 인쇄를 자산으로 여긴 쪽은 그러지 못했다.',
    chunks: [
      { en: 'Two publishers bought the same printing plant', ko: '두 출판사가 같은 인쇄 공장을 사들였다' },
      { en: 'in the same year;', ko: '같은 해에;' },
      { en: 'the one that kept its editors in the building survived,', ko: '편집자를 건물에 남겨 둔 쪽은 살아남았고,' },
      { en: 'while the one that treated printing as the asset', ko: '인쇄를 자산으로 여긴 쪽은' },
      { en: 'did not.', ko: '그러지 못했다.' },
    ],
  },
  {
    topic: '문턱을 넘는 망',
    korean_full: '전화망은 마을의 삼분의 일가량이 가입하기 전까지 거의 아무 가치가 없었다. 그 지점에서 남은 가구들은 결정이 이미 자신들 대신 내려져 있음을 알게 되었다.',
    chunks: [
      { en: 'A telephone network was worth almost nothing', ko: '전화망은 거의 아무 가치가 없었다' },
      { en: 'until roughly a third of a town had joined,', ko: '마을의 삼분의 일가량이 가입하기 전까지는,' },
      { en: 'at which point the remaining households', ko: '그 지점에서 남은 가구들은' },
      { en: 'found the decision had been made for them.', ko: '결정이 이미 내려져 있음을 알게 되었다.' },
    ],
  },
  {
    topic: '보험과 부주의',
    korean_full: '화재 보험은 보험계리인이 값으로 매기지 못한 방식으로 소유주를 부주의하게 만들었다. 그리하여 보험료가 올랐고, 가장 조심스러운 소유주들이 풀을 떠나 부주의한 이들만 남았다.',
    chunks: [
      { en: 'Fire insurance made owners careless', ko: '화재 보험은 소유주를 부주의하게 만들었다' },
      { en: 'in a way the actuaries had not priced,', ko: '보험계리인이 값으로 매기지 못한 방식으로,' },
      { en: 'so that premiums rose', ko: '그리하여 보험료가 올랐다' },
      { en: 'until the most careful owners left the pool', ko: '가장 조심스러운 소유주들이 풀을 떠날 때까지' },
      { en: 'and only the careless remained.', ko: '그리고 부주의한 이들만 남았다.' },
    ],
  },
  {
    topic: '보조금의 되먹임',
    korean_full: '경작 면적당 지급된 보조금은 농부들이 척박한 땅을 계속 경작하도록 보상했다. 산식의 어디에서도 그 땅이 실제로 무엇을 냈는지 묻지 않았기 때문이고, 그것이 만들어 낸 잉여가 다음 보조금을 정당화했다.',
    chunks: [
      { en: 'A subsidy paid per acre planted', ko: '경작 면적당 지급된 보조금은' },
      { en: 'rewarded farmers for holding poor land in production,', ko: '농부들이 척박한 땅을 계속 경작하도록 보상했다,' },
      { en: 'because nothing in the formula asked', ko: '산식의 어디에서도 묻지 않았기 때문이다' },
      { en: 'what the land actually yielded,', ko: '그 땅이 실제로 무엇을 냈는지를,' },
      { en: 'and the surplus it created justified the next subsidy.', ko: '그리고 그것이 만들어 낸 잉여가 다음 보조금을 정당화했다.' },
    ],
  },
  {
    topic: '특허와 대기열',
    korean_full: '약을 이십 년간 보호한 특허는 동시에 그 가격이 무너질 날짜를 정했다. 그래서 연구소의 진짜 상품은 그 화합물이 아니라 그 뒤에 늘어선 대기열이었다.',
    chunks: [
      { en: 'The patent that protected a drug for twenty years', ko: '약을 이십 년간 보호한 특허는' },
      { en: 'also set the date', ko: '동시에 날짜를 정했다' },
      { en: 'on which its price would collapse,', ko: '그 가격이 무너질,' },
      { en: "so the laboratory's real product", ko: '그래서 연구소의 진짜 상품은' },
      { en: 'was not the compound but the queue behind it.', ko: '그 화합물이 아니라 그 뒤의 대기열이었다.' },
    ],
  },
  {
    topic: '임금과 기계',
    korean_full: '부두에서 가장 높은 임금을 따낸 노동조합은 동시에 십분의 일의 인원만 필요로 할 기계 도입에 합의했고, 조합원들은 사라지는 대가로 후하게 보상받았다.',
    chunks: [
      { en: 'The union that won the highest wages at the docks', ko: '부두에서 가장 높은 임금을 따낸 노동조합은' },
      { en: 'also agreed to the machines', ko: '동시에 기계 도입에 합의했다' },
      { en: 'that would need a tenth as many men,', ko: '십분의 일의 인원만 필요로 할,' },
      { en: 'and its members were paid handsomely', ko: '그리고 조합원들은 후하게 보상받았다' },
      { en: 'to disappear.', ko: '사라지는 대가로.' },
    ],
  },
  {
    topic: '세기 쉬운 자리',
    korean_full: '광고주가 마침내 클릭을 셀 수 있게 되자 지출은 세기 쉬운 자리로 옮겨 갔는데, 그곳이 늘 설득이 일어나는 자리는 아니었다.',
    chunks: [
      { en: 'When advertisers could finally count the clicks,', ko: '광고주가 마침내 클릭을 셀 수 있게 되자,' },
      { en: 'spending moved to the places', ko: '지출은 그 자리로 옮겨 갔다' },
      { en: 'where counting was easy,', ko: '세기 쉬운,' },
      { en: 'which were not always the places', ko: '그곳이 늘 그 자리는 아니었다' },
      { en: 'where persuading happened.', ko: '설득이 일어나는.' },
    ],
  },
  {
    topic: '궤간과 환적',
    korean_full: '서로 다른 궤간으로 놓인 철도는 경계에서 모든 화차를 부려야 했고, 선로 비용이 아니라 그 환적 비용이 어느 읍이 도시가 될지를 결정했다.',
    chunks: [
      { en: 'Railways built to different gauges', ko: '서로 다른 궤간으로 놓인 철도는' },
      { en: 'had to unload every wagon at the border,', ko: '경계에서 모든 화차를 부려야 했다,' },
      { en: 'and the cost of that transfer,', ko: '그리고 그 환적 비용이,' },
      { en: 'not the cost of the track,', ko: '선로 비용이 아니라,' },
      { en: 'decided which towns became cities.', ko: '어느 읍이 도시가 될지를 결정했다.' },
    ],
  },
  {
    topic: '수직 통합의 반전',
    korean_full: '한때 제철소를 소유했던 자동차 회사들은 그것을 팔았다. 소유가 더는 존재하지 않는 부족으로부터 자신들을 지켜 주면서, 동시에 거절할 수 없는 가격에 묶어 두었음을 알게 되면서였다.',
    chunks: [
      { en: 'Carmakers that had once owned their steel mills', ko: '한때 제철소를 소유했던 자동차 회사들은' },
      { en: 'sold them,', ko: '그것을 팔았다,' },
      { en: 'discovering that ownership had protected them', ko: '소유가 그들을 지켜 주었음을 알게 되면서' },
      { en: 'from a shortage which no longer existed', ko: '더는 존재하지 않는 부족으로부터' },
      { en: 'while binding them to a price they could not refuse.', ko: '그러면서 거절할 수 없는 가격에 묶어 두었음을.' },
    ],
  },
  {
    topic: '신용 평점의 그늘',
    korean_full: '신용 평점은 대출기관이 한 번도 만난 적 없는 차입자를 상대할 수 있게 했다. 그러나 그것은 한 가정의 대출 접근이 바로잡을 현실적 방법이 없는 기록에 달리게 되었음을 뜻하기도 했다.',
    chunks: [
      { en: 'Credit scoring let lenders serve borrowers', ko: '신용 평점은 대출기관이 차입자를 상대할 수 있게 했다' },
      { en: 'they had never met,', ko: '한 번도 만난 적 없는,' },
      { en: "but it also meant that a family's access to a loan", ko: '그러나 그것은 한 가정의 대출 접근이' },
      { en: 'now depended on records', ko: '이제 기록에 달리게 되었음을 뜻했다' },
      { en: 'it had no practical way to correct.', ko: '바로잡을 현실적 방법이 없는.' },
    ],
  },
  {
    topic: '마지막 일 마일',
    korean_full: '대양을 가로질러 광케이블을 놓는 일은 교외 거리의 마지막 일 마일에 그것을 놓는 것보다 저렴했다. 그래서 대역폭은 고르게 분배되기 훨씬 전에 풍부해졌다.',
    chunks: [
      { en: 'Laying fibre across an ocean', ko: '대양을 가로질러 광케이블을 놓는 일은' },
      { en: 'proved cheaper than laying it', ko: '그것을 놓는 것보다 저렴했다' },
      { en: 'down the last mile of a suburban street,', ko: '교외 거리의 마지막 일 마일에,' },
      { en: 'which is why bandwidth grew abundant', ko: '그래서 대역폭은 풍부해졌다' },
      { en: 'long before it grew evenly distributed.', ko: '고르게 분배되기 훨씬 전에.' },
    ],
  },
  {
    topic: '규격을 정한 고객',
    korean_full: '업계는 군이 자체 규격으로 수송을 시작하기 전까지 컨테이너 규격에 합의하지 못했다. 그 지점에서 논쟁은 끝났는데, 누가 설득되어서가 아니라 한 고객이 결정했기 때문이었다.',
    chunks: [
      { en: 'The industry could not agree on a container size', ko: '업계는 컨테이너 규격에 합의하지 못했다' },
      { en: 'until the army began shipping its own,', ko: '군이 자체 규격으로 수송을 시작하기 전까지는,' },
      { en: 'at which point the argument ended', ko: '그 지점에서 논쟁은 끝났다' },
      { en: 'not because anyone was persuaded', ko: '누가 설득되어서가 아니라' },
      { en: 'but because a customer had decided.', ko: '한 고객이 결정했기 때문에.' },
    ],
  },
]

/* ── 검증 ──────────────────────────────────────────────────── */

const MIN_WORDS = 20
const MAX_WORDS = 34
const BANNED = /(depends on|is determined by|leads to|plays a (vital|key) role|is (important|crucial|essential))/i
const SUBORDINATOR = /\b(although|even though|because|since|whereas|while|insofar as|unless|so that|which|whose|who|that|until|though)\b/i

function sentenceOf(seed: Seed): string {
  return seed.chunks.map(c => c.en).join(' ')
}

function problems(seed: Seed): string[] {
  const out: string[] = []
  const en = sentenceOf(seed)
  const n = en.trim().split(/\s+/).length
  if (n < MIN_WORDS) out.push(`짧다(${n})`)
  if (n > MAX_WORDS) out.push(`길다(${n})`)
  if (BANNED.test(en)) out.push('금지된 꼴')
  if (!SUBORDINATOR.test(en)) out.push('종속절 없음')
  if (/\b(we|our|us|I|my)\b/i.test(en)) out.push('1인칭')
  if (seed.chunks.some(c => !c.en.trim() || !c.ko.trim())) out.push('빈 청크')
  // 한국어 힌트는 문어체여야 한다 — 해요체가 섞이면 답도 구어로 끌려간다
  if (/(해요|거예요|이에요|예요)\b/.test(seed.korean_full)) out.push('구어체 한국어')
  return out
}

async function main() {
  const dry = process.argv.includes('--dry')

  let bad = 0
  for (const seed of SEEDS) {
    const found = problems(seed)
    if (found.length > 0) {
      bad += 1
      console.error(`✗ [${seed.topic}] ${found.join(' · ')}\n  ${sentenceOf(seed)}`)
    }
  }
  const words = SEEDS.map(s => sentenceOf(s).split(/\s+/).length)
  console.log(`씨드 ${SEEDS.length}개 · 평균 ${(words.reduce((a, b) => a + b, 0) / words.length).toFixed(1)}낱말 · 최소 ${Math.min(...words)} 최대 ${Math.max(...words)}`)
  if (bad > 0) {
    console.error(`검증 실패 ${bad}개 — 넣지 않는다`)
    process.exit(1)
  }
  console.log('검증 통과')
  if (dry) return

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  )

  // 같은 문장을 두 번 넣지 않는다 — 여러 번 돌려도 안전해야 한다
  const { data: existing, error: readErr } = await supabase
    .from('english_practice_items')
    .select('reference_english')
    .eq('profile', PROFILE)
  if (readErr) throw new Error(readErr.message)
  const have = new Set((existing ?? []).map(r => r.reference_english))

  const rows = SEEDS
    .filter(seed => !have.has(sentenceOf(seed)))
    .map(seed => ({
      korean_full: seed.korean_full,
      korean_chunks: seed.chunks.map(c => c.ko),
      english_chunks: seed.chunks.map(c => c.en),
      reference_english: sentenceOf(seed),
      topic: seed.topic,
      source_type: SOURCE,
      profile: PROFILE,
    }))

  if (rows.length === 0) {
    console.log('이미 다 들어 있다')
    return
  }
  const { error } = await supabase.from('english_practice_items').insert(rows)
  if (error) throw new Error(error.message)
  console.log(`${rows.length}개 넣음 (${SEEDS.length - rows.length}개는 이미 있었다)`)
}

main().catch(e => { console.error(e); process.exit(1) })
