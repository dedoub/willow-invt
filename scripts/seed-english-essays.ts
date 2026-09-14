/**
 * 비즈니스 에세이 씨드 문항.
 *
 * 생성은 보이스카드의 llm-json 프록시를 타는데 그쪽이 gemini-2.5-flash 에 thinking 0 으로
 * 고정돼 있다. 프롬프트를 네 번 강화해도 논증이 올라오지 않아, 목표 수준의 문장을 손으로
 * 써서 넣는다(CEO 2026-09-14 "씨드를 너가 만들어서 넣어줘").
 *
 * 기준은 CEO 가 이름을 댄 세 권이다 — Marc Levinson *The Box*,
 * Thales Teixeira *Unlocking the Customer Value Chain*, Peter Thiel *Zero to One*.
 * 셋이 공유하는 것을 맞춘다: 기제를 구체로 설명하고, 예상 밖의 말을 기꺼이 한다. 문장마다:
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
  {
    topic: '트럭 규제 완화',
    korean_full: '트럭 운송 규제 완화는 한 해 만에 화물 운임을 낮추었다. 그러나 그 절감의 대부분은 이제 자기 차를 소유하고 공차로 돌아오는 모든 구간의 비용을 떠안게 된 운전사들에게서 나왔다.',
    chunks: [
      { en: 'Deregulating trucking cut freight rates within a year,', ko: '트럭 운송 규제 완화는 한 해 만에 화물 운임을 낮추었다,' },
      { en: 'though the saving came largely from drivers', ko: '그러나 그 절감은 대체로 운전사들에게서 나왔다' },
      { en: 'who now owned their rigs', ko: '이제 자기 차를 소유하게 된' },
      { en: 'and absorbed the cost of every empty return leg.', ko: '그리고 공차로 돌아오는 모든 구간의 비용을 떠안은.' },
    ],
  },
  {
    topic: '신용평가의 유인',
    korean_full: '평가사가 자신이 등급을 매기는 채권의 발행자에게서 보수를 받았기 때문에, 너무 엄격하게 매긴 회사는 일감을 잃었고, 시장은 그 글자들이 한때 무엇을 뜻했는지 천천히 잊었다.',
    chunks: [
      { en: 'Because the agencies were paid by the issuers', ko: '평가사가 발행자에게서 보수를 받았기 때문에' },
      { en: 'whose bonds they rated,', ko: '자신이 등급을 매기는 채권의,' },
      { en: 'a firm that graded too strictly lost the business,', ko: '너무 엄격하게 매긴 회사는 일감을 잃었다,' },
      { en: 'and the market slowly forgot', ko: '그리고 시장은 천천히 잊었다' },
      { en: 'what the letters had once meant.', ko: '그 글자들이 한때 무엇을 뜻했는지를.' },
    ],
  },
  {
    topic: '곡물 창고의 힘',
    korean_full: '농부들은 낮은 값을 철도 탓으로 돌렸다. 그러나 실제 제약은 측선에 선 곡물 창고였고, 그것은 하루 운반 거리 안의 유일한 매수자였으며 스스로 그것을 알고 있었다.',
    chunks: [
      { en: 'Farmers blamed the railways for low prices,', ko: '농부들은 낮은 값을 철도 탓으로 돌렸다,' },
      { en: 'but the binding constraint was the elevator at the siding,', ko: '그러나 실제 제약은 측선에 선 곡물 창고였다,' },
      { en: 'which was the only buyer within a day\'s haul', ko: '하루 운반 거리 안의 유일한 매수자였고' },
      { en: 'and knew it.', ko: '스스로 그것을 알고 있던.' },
    ],
  },
  {
    topic: '규격 부품과 숙련',
    korean_full: '병기창이 모든 부품을 손으로 맞추는 대신 게이지에 맞춰 만들라고 고집하자, 숙련된 줄질공은 불필요해졌고 그 산업의 임금 구조는 한 세대 안에 뒤집혔다.',
    chunks: [
      { en: 'Once the armoury insisted that every part be made to gauge', ko: '병기창이 모든 부품을 게이지에 맞춰 만들라고 고집하자' },
      { en: 'rather than fitted by hand,', ko: '손으로 맞추는 대신,' },
      { en: 'the skilled filer became unnecessary', ko: '숙련된 줄질공은 불필요해졌다' },
      { en: "and the industry's wage structure inverted within a generation.", ko: '그리고 그 산업의 임금 구조는 한 세대 안에 뒤집혔다.' },
    ],
  },
  {
    topic: '케이블 채널의 문턱',
    korean_full: '케이블 채널은 가구의 육십 퍼센트가량에 닿기 전까지 아무 값어치가 없었다. 그래서 광고가 아니라 송출료가 한 방송망이 셋째 해를 넘기는지를 결정했다.',
    chunks: [
      { en: 'A cable channel was worthless', ko: '케이블 채널은 아무 값어치가 없었다' },
      { en: 'unless it reached roughly sixty percent of households,', ko: '가구의 육십 퍼센트가량에 닿지 않는 한,' },
      { en: 'which is why carriage fees, not advertising,', ko: '그래서 광고가 아니라 송출료가' },
      { en: 'decided whether a network survived its third year.', ko: '한 방송망이 셋째 해를 넘기는지를 결정했다.' },
    ],
  },
  {
    topic: '주파수 경매의 뒤끝',
    korean_full: '주파수 경매는 어떤 면허 심사보다도 많은 돈을 국고에 안겼다. 그러나 가장 공격적으로 응찰한 낙찰자들은 이후 자신들이 약속한 망을 지을 자본이 없었다.',
    chunks: [
      { en: 'Auctioning spectrum raised more for the treasury', ko: '주파수 경매는 국고에 더 많은 돈을 안겼다' },
      { en: 'than any licence hearing ever had,', ko: '어떤 면허 심사보다도,' },
      { en: 'but the winners who had bid most aggressively', ko: '그러나 가장 공격적으로 응찰한 낙찰자들은' },
      { en: 'then lacked the capital', ko: '이후 자본이 없었다' },
      { en: 'to build the networks they had promised.', ko: '자신들이 약속한 망을 지을.' },
    ],
  },
  {
    topic: '재고의 이동',
    korean_full: '네 시간치 부품만 두던 공장은 경제에서 재고를 없앤 것이 아니었다. 그것을 고속도로 위로 옮겼을 뿐이고, 거기서 공급업체의 트럭들이 이제 굴러가는 창고로 대기했다.',
    chunks: [
      { en: 'A factory that held four hours of parts', ko: '네 시간치 부품만 두던 공장은' },
      { en: 'had not removed the inventory from the economy;', ko: '경제에서 재고를 없앤 것이 아니었다;' },
      { en: 'it had moved it onto the motorway,', ko: '그것을 고속도로 위로 옮겼을 뿐이다,' },
      { en: "where suppliers' trucks now waited as rolling warehouses.", ko: '거기서 공급업체의 트럭들이 이제 굴러가는 창고로 대기했다.' },
    ],
  },
  {
    topic: '먼저 낸 쪽',
    korean_full: '가장 먼저 신청한 제네릭 제조사가 여섯 달의 독점권을 얻었다. 그래서 경주는 어느 쪽도 공장을 짓기 여러 해 전에 특허청에서 결판났다.',
    chunks: [
      { en: 'The generic manufacturer that filed first', ko: '가장 먼저 신청한 제네릭 제조사가' },
      { en: 'won six months of exclusivity,', ko: '여섯 달의 독점권을 얻었다,' },
      { en: 'so the race was decided in a patent office', ko: '그래서 경주는 특허청에서 결판났다' },
      { en: 'years before either firm had built a plant.', ko: '어느 쪽도 공장을 짓기 여러 해 전에.' },
    ],
  },
  {
    topic: '수가와 병동',
    korean_full: '병원이 결과가 아니라 행위별로 보상받게 되자, 가장 많은 수익을 낸 병동은 환자가 가장 빨리 회복한 병동이 아니었다.',
    chunks: [
      { en: 'When hospitals were reimbursed by the procedure', ko: '병원이 행위별로 보상받게 되자' },
      { en: 'rather than the outcome,', ko: '결과가 아니라,' },
      { en: 'the wards that generated the most revenue', ko: '가장 많은 수익을 낸 병동은' },
      { en: 'were not the wards where patients recovered fastest.', ko: '환자가 가장 빨리 회복한 병동이 아니었다.' },
    ],
  },
  {
    topic: '판단을 미룬 쪽',
    korean_full: '인덱스 펀드는 기업에 대해 아무런 판단을 하지 않았기에 거의 아무것도 받지 않았다. 그리하여 판단은 줄어드는 액티브 운용자들에게 남겨졌고, 인덱스 쪽은 조용히 그들의 보수에 기대고 있었다.',
    chunks: [
      { en: 'Index funds charged almost nothing', ko: '인덱스 펀드는 거의 아무것도 받지 않았다' },
      { en: 'because they made no judgement about companies,', ko: '기업에 대해 아무런 판단을 하지 않았기 때문이다,' },
      { en: 'which left the judging to a shrinking group of active managers', ko: '그리하여 판단은 줄어드는 액티브 운용자들에게 남겨졌다' },
      { en: 'whose fees the indexers quietly depended on.', ko: '인덱스 쪽이 조용히 기대고 있던 보수의.' },
    ],
  },
  {
    topic: '허가라는 희소재',
    korean_full: '건설업자들은 목재 값을 탓했다. 그러나 희소한 투입물은 허가였다. 합법적으로 여섯 가구를 담을 수 있는 땅은 두 가구를 담는 땅의 네 배 값이 나갔다.',
    chunks: [
      { en: 'Builders complained about the cost of timber,', ko: '건설업자들은 목재 값을 탓했다,' },
      { en: 'yet the scarce input was permission:', ko: '그러나 희소한 투입물은 허가였다:' },
      { en: 'a lot that could legally hold six flats', ko: '합법적으로 여섯 가구를 담을 수 있는 땅은' },
      { en: 'was worth four times one that could hold two.', ko: '두 가구를 담는 땅의 네 배 값이 나갔다.' },
    ],
  },
  {
    topic: '학습곡선의 보상',
    korean_full: '누적 생산량이 두 배가 될 때마다 태양광 패널의 원가는 오분의 일씩 떨어졌다. 그것은 가장 먼저 지은 쪽에 보상했지만, 동시에 그 보상이 오래가지 않을 것을 보장했다.',
    chunks: [
      { en: 'Each doubling of cumulative output', ko: '누적 생산량이 두 배가 될 때마다' },
      { en: 'cut the cost of a solar panel by a fifth,', ko: '태양광 패널의 원가는 오분의 일씩 떨어졌다,' },
      { en: 'which rewarded whoever built first', ko: '그것은 가장 먼저 지은 쪽에 보상했다' },
      { en: 'but guaranteed that the reward would not last.', ko: '그러나 그 보상이 오래가지 않을 것을 보장했다.' },
    ],
  },
  {
    topic: '편의치적',
    korean_full: '선주가 한 번도 가 본 적 없는 나라에 배를 등록할 수 있게 되자, 기국의 임금과 안전 규정은 제약이 아니라 가격표가 되었다.',
    chunks: [
      { en: 'Once a shipowner could register in a country', ko: '선주가 어느 나라에 등록할 수 있게 되자' },
      { en: 'he had never visited,', ko: '한 번도 가 본 적 없는,' },
      { en: 'the wage and safety rules of the flag state', ko: '기국의 임금과 안전 규정은' },
      { en: 'became a price list rather than a constraint.', ko: '제약이 아니라 가격표가 되었다.' },
    ],
  },
  {
    topic: '안내 광고의 두 신문',
    korean_full: '두 신문이 같은 십 년 동안 안내 광고 수입을 잃었다. 이미 별도의 목록 사업을 세워 둔 쪽은 독자를 지켰고, 기자를 줄인 쪽은 둘 다 잃었다.',
    chunks: [
      { en: 'Two newspapers lost their classified revenue in the same decade;', ko: '두 신문이 같은 십 년 동안 안내 광고 수입을 잃었다;' },
      { en: 'the one that had already built a separate listings business', ko: '이미 별도의 목록 사업을 세워 둔 쪽은' },
      { en: 'kept its readers,', ko: '독자를 지켰다,' },
      { en: 'while the one that cut reporters lost both.', ko: '기자를 줄인 쪽은 둘 다 잃었다.' },
    ],
  },
  {
    topic: '이십 년 뒤의 약속',
    korean_full: '이십 년이 지나야 수급권이 생기는 연금은 제시되던 날에는 후해 보였다. 그러나 그것을 약속받은 이들 대부분은 그 약속이 누구를 구속하기 전에 떠났다.',
    chunks: [
      { en: 'A pension that vested only after twenty years', ko: '이십 년이 지나야 수급권이 생기는 연금은' },
      { en: 'looked generous on the day it was offered,', ko: '제시되던 날에는 후해 보였다,' },
      { en: 'though most of those who were promised it', ko: '그러나 그것을 약속받은 이들 대부분은' },
      { en: 'left before the promise ever bound anyone.', ko: '그 약속이 누구를 구속하기 전에 떠났다.' },
    ],
  },
  {
    topic: '나가는 값',
    korean_full: '자료를 넣어 두는 데는 값을 받지 않고 빼내는 데 크게 받는다는 것은, 남아 있는 고객이 만족한 고객은 아니라는 뜻이었고, 사업자는 그 충성에서 배울 것이 적었다.',
    chunks: [
      { en: 'Charging nothing to store data', ko: '자료를 넣어 두는 데는 값을 받지 않고' },
      { en: 'but a great deal to move it out', ko: '빼내는 데 크게 받는다는 것은' },
      { en: 'meant customers who stayed were not the satisfied ones,', ko: '남아 있는 고객이 만족한 고객은 아니라는 뜻이었다,' },
      { en: 'and the provider learned little from their loyalty.', ko: '그리고 사업자는 그 충성에서 배울 것이 적었다.' },
    ],
  },
  {
    topic: '냉장차와 도축',
    korean_full: '소고기가 산 채로가 아니라 냉장 상태로 옮겨질 수 있게 되자, 도축장은 대초원으로 옮겨 갔고 냉장차에 맞섰던 동부의 정육업자들은 그 장사를 그것에 빼앗겼다.',
    chunks: [
      { en: 'Once beef could travel chilled rather than on the hoof,', ko: '소고기가 산 채로가 아니라 냉장 상태로 옮겨질 수 있게 되자,' },
      { en: 'the slaughterhouse moved to the prairie', ko: '도축장은 대초원으로 옮겨 갔다' },
      { en: 'and the eastern butchers who had fought the railcars', ko: '그리고 냉장차에 맞섰던 동부의 정육업자들은' },
      { en: 'lost their trade to it.', ko: '그 장사를 그것에 빼앗겼다.' },
    ],
  },
  {
    topic: '면허가 지킨 쪽',
    korean_full: '어떤 업을 면허로 묶는 것은 이미 면허 있는 사람을 쓸 여유가 있던 고객을 지켰다. 그럴 여유가 없던 이들은 그냥 없이 지냈고, 그것은 품질 통계에 결코 나타나지 않았다.',
    chunks: [
      { en: 'Licensing a trade protected the customers', ko: '어떤 업을 면허로 묶는 것은 고객을 지켰다' },
      { en: 'who could already afford a licensed practitioner,', ko: '이미 면허 있는 사람을 쓸 여유가 있던,' },
      { en: 'while those who could not simply went without,', ko: '그럴 여유가 없던 이들은 그냥 없이 지냈다,' },
      { en: 'which never appeared in the statistics on quality.', ko: '그것은 품질 통계에 결코 나타나지 않았다.' },
    ],
  },
  {
    topic: '특허가 아니었던 것',
    korean_full: '회사에 특허를 자유롭게 실시하도록 강제한 판결은 그 회사가 아끼던 무엇도 앗아 가지 않았다. 실제로 쥐고 있던 우위는 어떤 특허도 적지 않은 제조 공정에 있었기 때문이다.',
    chunks: [
      { en: 'The decree that forced the company to license its patents freely', ko: '회사에 특허를 자유롭게 실시하도록 강제한 판결은' },
      { en: 'cost it nothing it valued,', ko: '그 회사가 아끼던 무엇도 앗아 가지 않았다,' },
      { en: 'since the advantage it actually held', ko: '실제로 쥐고 있던 우위는' },
      { en: 'lay in a manufacturing process no patent described.', ko: '어떤 특허도 적지 않은 제조 공정에 있었기 때문이다.' },
    ],
  },
  {
    topic: '체화료의 역효과',
    korean_full: '컨테이너가 터미널에 놓인 날마다 화주에게 값을 물리자 야적장은 빠르게 비었다. 그 값이 충분히 커지자 이번에는 빈 상자들이 거기 버려졌다.',
    chunks: [
      { en: 'Charging the shipper for every day a container sat at the terminal', ko: '컨테이너가 터미널에 놓인 날마다 화주에게 값을 물리자' },
      { en: 'cleared the yard quickly,', ko: '야적장은 빠르게 비었다,' },
      { en: 'until the charge grew large enough', ko: '그 값이 충분히 커지기 전까지는' },
      { en: 'that empty boxes were abandoned there instead.', ko: '이번에는 빈 상자들이 거기 버려질 만큼.' },
    ],
  },
  {
    topic: '증권화의 거리',
    korean_full: '대출을 묶어 팔 수 있게 되자, 그것을 조성한 이는 더 이상 그것이 상환되는지를 개의치 않았고, 살필 유인은 그것을 만난 적 없는 이에게 넘어갔다.',
    chunks: [
      { en: 'Once loans could be bundled and sold,', ko: '대출을 묶어 팔 수 있게 되자,' },
      { en: 'whoever originated one no longer cared', ko: '그것을 조성한 이는 더 이상 개의치 않았다' },
      { en: 'whether it was repaid,', ko: '그것이 상환되는지를,' },
      { en: 'and the incentive to check passed to someone who never met it.', ko: '그리고 살필 유인은 그것을 만난 적 없는 이에게 넘어갔다.' },
    ],
  },
  {
    topic: '카탈로그와 철도',
    korean_full: '통신판매 회사는 아무것도 발명하지 않았다. 다만 우편 요금이 시골 상점의 가격 우위보다 빠르게 떨어졌음을 알아차렸고, 그 상점들은 여러 해 동안 자신이 무엇과 싸우는지 몰랐다.',
    chunks: [
      { en: 'The mail-order house invented nothing;', ko: '통신판매 회사는 아무것도 발명하지 않았다;' },
      { en: 'it merely noticed that postal rates had fallen faster', ko: '다만 우편 요금이 더 빠르게 떨어졌음을 알아차렸다' },
      { en: "than the country store's advantage in price,", ko: '시골 상점의 가격 우위보다,' },
      { en: 'and those stores spent years unsure what they were fighting.', ko: '그리고 그 상점들은 여러 해 동안 무엇과 싸우는지 몰랐다.' },
    ],
  },
  {
    topic: '진열대의 임대료',
    korean_full: '제조사가 진열대 자리에 값을 치르기 시작하자, 소매업체의 진짜 상품은 더 이상 파는 물건이 아니라 그 물건이 놓인 선반이 되었고, 마진은 조용히 옮겨 갔다.',
    chunks: [
      { en: 'Once manufacturers began paying for shelf position,', ko: '제조사가 진열대 자리에 값을 치르기 시작하자,' },
      { en: "the retailer's real product was no longer the goods it sold", ko: '소매업체의 진짜 상품은 더 이상 파는 물건이 아니었다' },
      { en: 'but the shelf they sat on,', ko: '그 물건이 놓인 선반이었다,' },
      { en: 'and the margin quietly moved.', ko: '그리고 마진은 조용히 옮겨 갔다.' },
    ],
  },
  {
    topic: '원자로의 원가',
    korean_full: '원자로 건설비는 산업이 배우면서 내려가지 않고 올라갔다. 설계가 부지마다 바뀌었기 때문이고, 따라서 지난번에 배운 것이 이번에 지을 것에는 거의 들어맞지 않았다.',
    chunks: [
      { en: 'The cost of building reactors rose rather than fell', ko: '원자로 건설비는 내려가지 않고 올라갔다' },
      { en: 'as the industry learned,', ko: '산업이 배우면서,' },
      { en: 'because the design changed at every site,', ko: '설계가 부지마다 바뀌었기 때문이다,' },
      { en: 'so that what had been learned last time barely fitted the next.', ko: '따라서 지난번에 배운 것이 다음 것에는 거의 들어맞지 않았다.' },
    ],
  },
  {
    topic: '외상 장부',
    korean_full: '백화점은 물건을 팔아서보다 외상 장부로 더 많이 벌었다. 그래서 판매원에게 무엇을 권하라고 가르쳤는지는 그 고객이 상환할 것인지에 달려 있었지, 마진에 달려 있지 않았다.',
    chunks: [
      { en: 'The department store earned more from its credit ledger', ko: '백화점은 외상 장부로 더 많이 벌었다' },
      { en: 'than from selling goods,', ko: '물건을 팔아서보다,' },
      { en: 'so what it taught its clerks to recommend', ko: '그래서 판매원에게 무엇을 권하라고 가르쳤는지는' },
      { en: 'turned on whether the customer would repay,', ko: '그 고객이 상환할 것인지에 달려 있었다,' },
      { en: 'not on the margin.', ko: '마진이 아니라.' },
    ],
  },
  {
    topic: '공짜 배송의 값',
    korean_full: '무료 반품은 미심쩍은 물건까지 사게 만들었다. 그리하여 모든 배송이 결국 돌아올 물건의 값을 떠안게 되었고, 그 값은 아무것도 돌려보내지 않는 고객이 치렀다.',
    chunks: [
      { en: 'Free returns made shoppers buy what they doubted,', ko: '무료 반품은 미심쩍은 물건까지 사게 만들었다,' },
      { en: 'so that every delivery came to carry', ko: '그리하여 모든 배송이 떠안게 되었다' },
      { en: 'the price of goods that would come back,', ko: '결국 돌아올 물건의 값을,' },
      { en: 'which the customer who returned nothing paid.', ko: '그 값은 아무것도 돌려보내지 않는 고객이 치렀다.' },
    ],
  },
  {
    topic: '항만 연금',
    korean_full: '부두 노동자의 연금은 그들이 하역하는 톤수로 조달되었다. 그리하여 기계가 인원을 줄일수록 남은 이들은 자신의 일을 없앤 바로 그 물동량에 기대게 되었다.',
    chunks: [
      { en: "The dockers' pension was funded by the tonnage they handled,", ko: '부두 노동자의 연금은 그들이 다룬 톤수로 조달되었다,' },
      { en: 'so that as machines cut their number,', ko: '그리하여 기계가 그 수를 줄일수록,' },
      { en: 'those who remained came to depend on the very traffic', ko: '남은 이들은 바로 그 물동량에 기대게 되었다' },
      { en: 'that had abolished their work.', ko: '자신의 일을 없앤.' },
    ],
  },
  {
    topic: '관세와 부품',
    korean_full: '완성차에는 관세를 물리고 부품에는 물리지 않자, 외국 제조사들은 조립 공장을 국경 안에 세웠고, 보호하려던 산업은 조립만 얻고 설계는 얻지 못했다.',
    chunks: [
      { en: 'Taxing finished cars but not their parts', ko: '완성차에는 관세를 물리고 부품에는 물리지 않자' },
      { en: 'brought foreign manufacturers to build assembly plants inside the border,', ko: '외국 제조사들은 국경 안에 조립 공장을 세웠다,' },
      { en: 'and the industry that was being protected', ko: '그리고 보호받던 산업은' },
      { en: 'gained the assembly but not the design.', ko: '조립은 얻었으나 설계는 얻지 못했다.' },
    ],
  },
  {
    topic: '수도 계량기',
    korean_full: '수도가 계량되지 않는 동안 농부들은 물이 공짜인 것처럼 심었다. 계량기가 붙자 심는 작물이 한 철 만에 바뀌었는데, 값이 달라져서가 아니라 마침내 값이 보였기 때문이다.',
    chunks: [
      { en: 'While water went unmetered, farmers planted as though it were free;', ko: '수도가 계량되지 않는 동안 농부들은 공짜인 것처럼 심었다;' },
      { en: 'when the meters arrived the crops changed within a season,', ko: '계량기가 붙자 작물은 한 철 만에 바뀌었다,' },
      { en: 'not because the price had changed', ko: '값이 달라져서가 아니라' },
      { en: 'but because it had finally become visible.', ko: '마침내 값이 보이게 되었기 때문이다.' },
    ],
  },
  {
    topic: '두 공항의 갈림',
    korean_full: '두 공항이 같은 해에 같은 활주로를 놓았다. 항공사에 탑승동 배정을 넘긴 쪽은 환승 거점이 되었고, 그것을 쥐고 있던 쪽은 계속 지방 공항으로 남았다.',
    chunks: [
      { en: 'Two airports laid the same runway in the same year;', ko: '두 공항이 같은 해에 같은 활주로를 놓았다;' },
      { en: 'the one that handed gate assignment to the airlines', ko: '항공사에 탑승동 배정을 넘긴 쪽은' },
      { en: 'became a hub,', ko: '환승 거점이 되었다,' },
      { en: 'while the one that kept it remained a regional field.', ko: '그것을 쥐고 있던 쪽은 계속 지방 공항으로 남았다.' },
    ],
  },
  {
    topic: '표준을 늦춘 쪽',
    korean_full: '가장 큰 제조사는 공통 규격을 막지 않았다. 다만 위원회가 몇 해를 논의하도록 두었을 뿐이고, 그 세월이 누가 전환 비용을 치를지 이미 설비를 갖춘 회사에 유리하게 정했다.',
    chunks: [
      { en: 'The largest manufacturer did not block the common standard;', ko: '가장 큰 제조사는 공통 규격을 막지 않았다;' },
      { en: 'it merely let the committee deliberate for years,', ko: '다만 위원회가 몇 해를 논의하도록 두었을 뿐이다,' },
      { en: 'and those years settled who would pay to convert,', ko: '그리고 그 세월이 누가 전환 비용을 치를지 정했다,' },
      { en: 'favouring the firm already tooled.', ko: '이미 설비를 갖춘 회사에 유리하게.' },
    ],
  },
  {
    topic: '재보험의 사슬',
    korean_full: '한 보험사는 자신이 인수한 위험을 재보험에 넘겼다. 재보험사는 그것을 다시 넘겼고, 폭풍이 닥쳤을 때 아무도 자신이 결국 무엇을 들고 있는지 확실히 말하지 못했다.',
    chunks: [
      { en: 'One insurer passed the risk it had written to a reinsurer,', ko: '한 보험사는 자신이 인수한 위험을 재보험사에 넘겼다,' },
      { en: 'which passed it on again,', ko: '재보험사는 그것을 다시 넘겼다,' },
      { en: 'so that when the storm came', ko: '그리하여 폭풍이 닥쳤을 때' },
      { en: 'nobody could say with confidence what they finally held.', ko: '아무도 자신이 결국 무엇을 들고 있는지 확실히 말하지 못했다.' },
    ],
  },
  {
    topic: '기계값의 감가',
    korean_full: '금형 값을 첫해에 털어 낸 회사는 장부상 손실을 냈다. 그러나 이후 몇 해 동안 아무 부담 없이 값을 낮출 수 있었고, 천천히 감가한 경쟁사는 그것을 따라갈 수 없었다.',
    chunks: [
      { en: 'The firm that wrote off its tooling in the first year', ko: '금형 값을 첫해에 털어 낸 회사는' },
      { en: 'showed a loss on paper,', ko: '장부상 손실을 냈다,' },
      { en: 'yet could cut prices for years afterwards without pain,', ko: '그러나 이후 몇 해 동안 아무 부담 없이 값을 낮출 수 있었다,' },
      { en: 'which its slower-depreciating rival could not match.', ko: '천천히 감가한 경쟁사는 따라갈 수 없는 것이었다.' },
    ],
  },
  {
    topic: '공동 배선망',
    korean_full: '전화 회사가 경쟁사에 자기 선로를 빌려주도록 강제되자, 선로를 새로 놓는 일은 아무 이익이 없어졌고, 규칙이 열려고 했던 바로 그 경쟁이 놓을 것을 남기지 않았다.',
    chunks: [
      { en: 'Once the telephone company was compelled to lease its lines to rivals,', ko: '전화 회사가 경쟁사에 자기 선로를 빌려주도록 강제되자,' },
      { en: 'there was no profit in laying new ones,', ko: '선로를 새로 놓는 일에는 이익이 없어졌다,' },
      { en: 'and the competition the rule had meant to open', ko: '그리고 규칙이 열려고 했던 경쟁은' },
      { en: 'left nothing to lay.', ko: '놓을 것을 남기지 않았다.' },
    ],
  },
  {
    topic: '재고 회전율',
    korean_full: '재고 회전율로 점포장을 평가하자, 그들은 천천히 팔리지만 이윤이 큰 물건을 치웠고, 본사는 회전율이 오르는 동안 이익이 떨어지는 것을 지켜보았다.',
    chunks: [
      { en: 'Judging store managers by inventory turnover', ko: '재고 회전율로 점포장을 평가하자' },
      { en: 'led them to clear out the goods that sold slowly', ko: '그들은 천천히 팔리는 물건을 치웠다' },
      { en: 'but earned the most,', ko: '그러나 가장 많이 벌던,' },
      { en: 'and head office watched profit fall while the ratio rose.', ko: '그리고 본사는 비율이 오르는 동안 이익이 떨어지는 것을 지켜보았다.' },
    ],
  },
  {
    topic: '항생제의 셈',
    korean_full: '아껴 써야 가치가 유지되는 약은 제약사에게 나쁜 사업이었다. 그리하여 가장 필요한 항생제가 가장 적게 연구되었고, 그 부족은 과학이 아니라 산술에서 비롯되었다.',
    chunks: [
      { en: 'A drug whose value depended on being used sparingly', ko: '아껴 써야 가치가 유지되는 약은' },
      { en: 'made a poor business for whoever made it,', ko: '만드는 쪽에게는 나쁜 사업이었다,' },
      { en: 'so the antibiotics most needed were least researched,', ko: '그리하여 가장 필요한 항생제가 가장 적게 연구되었다,' },
      { en: 'and that shortage came from arithmetic.', ko: '그리고 그 부족은 산술에서 비롯되었다.' },
    ],
  },
  {
    topic: '주차 규정',
    korean_full: '모든 신축 건물에 주차면을 요구한 조례는 도시가 감당할 수 있는 밀도를 정해 버렸고, 그 결정은 주차에 대한 것이 아니라 그 도시에 살 수 있는 사람에 대한 것이었다.',
    chunks: [
      { en: 'The ordinance that required parking spaces with every new building', ko: '모든 신축 건물에 주차면을 요구한 조례는' },
      { en: 'set the density the city could reach,', ko: '그 도시가 다다를 수 있는 밀도를 정했다,' },
      { en: 'and that decision was not about parking', ko: '그리고 그 결정은 주차에 대한 것이 아니라' },
      { en: 'but about who could afford to live there.', ko: '누가 거기 살 여유가 있는지에 대한 것이었다.' },
    ],
  },
  {
    topic: '두 제철소',
    korean_full: '두 제철소가 같은 해에 같은 전기로를 들였다. 스크랩 공급을 확보한 쪽은 살아남았고, 용량만 사들인 쪽은 경기 하강 내내 쓸모없는 설비를 안고 있었다.',
    chunks: [
      { en: 'Two mills installed the same electric furnace in the same year;', ko: '두 제철소가 같은 해에 같은 전기로를 들였다;' },
      { en: 'the one that had secured its scrap supply survived,', ko: '스크랩 공급을 확보한 쪽은 살아남았다,' },
      { en: 'while the one that bought only capacity', ko: '용량만 사들인 쪽은' },
      { en: 'held useless plant through the downturn.', ko: '경기 하강 내내 쓸모없는 설비를 안고 있었다.' },
    ],
  },
  {
    topic: '보증 기간',
    korean_full: '보증을 삼 년으로 늘린 제조사는 품질에 값을 치른 것이 아니었다. 대부분의 결함이 셋째 해가 끝난 뒤에 나타난다는 것을 알고 있었고, 그 약속은 광고비였을 뿐이다.',
    chunks: [
      { en: 'The manufacturer that extended its warranty to three years', ko: '보증을 삼 년으로 늘린 제조사는' },
      { en: 'had not paid for quality;', ko: '품질에 값을 치른 것이 아니었다;' },
      { en: 'it knew that most failures appeared after the third year ended,', ko: '대부분의 결함이 셋째 해가 끝난 뒤에 나타남을 알고 있었다,' },
      { en: 'and the promise was an advertising expense.', ko: '그리고 그 약속은 광고비였다.' },
    ],
  },
  {
    topic: '측정된 생산성',
    korean_full: '공장이 시간당 산출로 측정되자 정비는 미뤄졌다. 미룬 값은 여러 달 뒤 다른 줄에 나타났고, 그 줄의 감독은 자신이 왜 뒤처지는지 설명하지 못했다.',
    chunks: [
      { en: 'Once the plant was measured by output per hour,', ko: '공장이 시간당 산출로 측정되자,' },
      { en: 'maintenance was deferred,', ko: '정비는 미뤄졌다,' },
      { en: 'and the cost of deferring it appeared months later on another line', ko: '미룬 값은 여러 달 뒤 다른 줄에 나타났다' },
      { en: 'whose supervisor could not explain why he was behind.', ko: '그 감독이 왜 뒤처지는지 설명하지 못한.' },
    ],
  },
  {
    topic: '환적항의 운명',
    korean_full: '환적으로 번성한 항만은 두 개의 다른 항로가 거기서 만났기 때문에 번성했다. 그리하여 어느 한쪽이 노선을 바꾸기로 하는 날, 그 항만이 한 일 가운데 무엇도 그것을 구하지 못했다.',
    chunks: [
      { en: 'A port that prospered on transhipment prospered', ko: '환적으로 번성한 항만은 번성했다' },
      { en: 'because two different routes happened to meet there,', ko: '두 개의 다른 항로가 거기서 만났기 때문에,' },
      { en: 'so that on the day either line chose to change,', ko: '그리하여 어느 한쪽이 바꾸기로 한 날,' },
      { en: 'nothing the port had done could save it.', ko: '그 항만이 한 무엇도 그것을 구하지 못했다.' },
    ],
  },
  {
    topic: '분할 납부',
    korean_full: '월 납입금으로 자동차를 팔자 구매자가 묻는 질문이 바뀌었다. 값이 아니라 납입금을 견주게 되었고, 기간을 늘려 무엇이든 감당 가능해 보이게 만들 수 있음을 판매원이 배웠다.',
    chunks: [
      { en: 'Selling cars by the monthly payment changed the question buyers asked;', ko: '월 납입금으로 자동차를 팔자 구매자가 묻는 질문이 바뀌었다;' },
      { en: 'they compared instalments rather than prices,', ko: '그들은 값이 아니라 납입금을 견주었다,' },
      { en: 'and the salesman learned that a longer term', ko: '그리고 판매원은 배웠다, 기간을 늘리면' },
      { en: 'could make anything appear affordable.', ko: '무엇이든 감당 가능해 보이게 만들 수 있음을.' },
    ],
  },
  {
    topic: '환율과 조립',
    korean_full: '통화가 절하되자 부품 수입이 비싸졌고, 수출로 번다고 여겨진 조립 공장은 국내에서 거의 아무것도 조달하지 않았기에 도움을 받은 만큼 값을 치렀다.',
    chunks: [
      { en: 'When the currency fell, imported components grew dearer,', ko: '통화가 떨어지자 수입 부품이 비싸졌다,' },
      { en: 'and the assembly plant thought to earn by exporting', ko: '그리고 수출로 번다고 여겨진 조립 공장은' },
      { en: 'sourced almost nothing at home,', ko: '국내에서 거의 아무것도 조달하지 않았기에,' },
      { en: 'so it paid as much as it gained.', ko: '도움받은 만큼 값을 치렀다.' },
    ],
  },
  {
    topic: '컨설턴트의 보고서',
    korean_full: '어느 산업에나 팔린 보고서는 그 산업의 어느 회사에도 우위를 주지 못했다. 모두가 같은 권고를 같은 분기에 실행했기 때문이고, 그 비용만이 그들을 갈라놓았다.',
    chunks: [
      { en: 'A report sold into every firm in an industry', ko: '어느 산업의 모든 회사에 팔린 보고서는' },
      { en: 'gave none of them an advantage,', ko: '그중 누구에게도 우위를 주지 못했다,' },
      { en: 'because all acted on the same recommendation in the same quarter,', ko: '모두가 같은 권고를 같은 분기에 실행했기 때문이다,' },
      { en: 'and only its cost distinguished them.', ko: '그리고 그 비용만이 그들을 갈라놓았다.' },
    ],
  },
  {
    topic: '표준 시각',
    korean_full: '철도가 시간을 표준화하기 전까지 모든 읍은 자기 정오를 지켰다. 시각표가 그것을 견딜 수 없게 되자, 하루를 정한 것은 천문학자가 아니라 운수업자였다.',
    chunks: [
      { en: 'Until the railways standardised time, every town kept its own noon;', ko: '철도가 시간을 표준화하기 전까지 모든 읍은 자기 정오를 지켰다;' },
      { en: 'once the timetable could not tolerate it,', ko: '시각표가 그것을 견딜 수 없게 되자,' },
      { en: 'it was the carriers rather than the astronomers', ko: '천문학자가 아니라 운수업자가' },
      { en: 'who settled what the day was.', ko: '하루가 무엇인지 정했다.' },
    ],
  },
  {
    topic: '보조 배터리',
    korean_full: '충전기를 상자에서 뺀 제조사는 환경을 이유로 들었다. 그러나 절감의 대부분은 운임에서 나왔고, 구매자들은 어차피 이미 갖고 있던 것을 따로 샀다.',
    chunks: [
      { en: 'The manufacturer that removed the charger from the box', ko: '충전기를 상자에서 뺀 제조사는' },
      { en: 'gave the environment as its reason,', ko: '환경을 이유로 들었다,' },
      { en: 'though most of the saving came from freight,', ko: '그러나 절감의 대부분은 운임에서 나왔다,' },
      { en: 'and buyers bought separately what they already owned.', ko: '그리고 구매자들은 이미 가진 것을 따로 샀다.' },
    ],
  },
  {
    topic: '중고차 값',
    korean_full: '새 차의 임대 조건이 삼 년 뒤의 잔존가를 정해 두었기 때문에, 중고차 시장의 값은 그 차를 팔기 오래전에 회계 부서에서 결정되었다.',
    chunks: [
      { en: 'Because the lease on a new car fixed its residual value three years out,', ko: '새 차의 임대가 삼 년 뒤 잔존가를 정해 두었기 때문에,' },
      { en: 'the price in the used market', ko: '중고차 시장의 값은' },
      { en: 'was decided in an accounting department', ko: '회계 부서에서 결정되었다' },
      { en: 'long before the car was sold.', ko: '그 차가 팔리기 오래전에.' },
    ],
  },
  {
    topic: '무이자 할부',
    korean_full: '무이자 할부는 이자를 없애지 않았다. 다만 그것을 정가 안으로 옮겼을 뿐이고, 현금으로 사는 이가 이제 빌리는 이의 몫을 치렀다.',
    chunks: [
      { en: 'Interest-free instalments did not abolish the interest;', ko: '무이자 할부는 이자를 없애지 않았다;' },
      { en: 'they merely moved it inside the list price,', ko: '다만 그것을 정가 안으로 옮겼을 뿐이다,' },
      { en: 'so that whoever paid cash', ko: '그리하여 현금으로 치른 이가' },
      { en: 'now covered the borrower\'s share.', ko: '이제 빌리는 이의 몫을 치렀다.' },
    ],
  },
  {
    topic: '항공 마일리지',
    korean_full: '항공사는 마일리지를 은행에 팔아 좌석보다 많이 벌었고, 그리하여 그 사업의 진짜 고객은 비행하는 사람이 아니라 카드를 발급하는 쪽이 되었다.',
    chunks: [
      { en: 'The airline earned more selling miles to banks than seats,', ko: '항공사는 좌석보다 마일리지를 은행에 팔아 더 벌었다,' },
      { en: 'so that the real customer of the business', ko: '그리하여 그 사업의 진짜 고객은' },
      { en: 'was not the person who flew', ko: '비행하는 사람이 아니라' },
      { en: 'but the one who issued the card.', ko: '카드를 발급하는 쪽이었다.' },
    ],
  },
  {
    topic: '공장 부지 보조',
    korean_full: '한 주가 공장을 유치하려 세금을 감면하자 이웃 주도 같은 일을 했다. 그리하여 공장은 어차피 왔을 곳에 자리 잡았고, 두 주 모두 세수를 잃었다.',
    chunks: [
      { en: 'When one state abated taxes to attract a plant,', ko: '한 주가 공장을 유치하려 세금을 감면하자,' },
      { en: 'the neighbouring state did the same,', ko: '이웃 주도 같은 일을 했다,' },
      { en: 'so the plant settled where it would have settled anyway', ko: '그리하여 공장은 어차피 자리 잡았을 곳에 자리 잡았다' },
      { en: 'and both states lost the revenue.', ko: '그리고 두 주 모두 세수를 잃었다.' },
    ],
  },
  {
    topic: '원가 절감의 자리',
    korean_full: '구매 부서가 절감액으로 평가되자 부품 값은 내려갔다. 그러나 보증 청구는 올라갔고, 그 비용은 아무도 그 부서의 성과로 셈하지 않는 계정에 쌓였다.',
    chunks: [
      { en: 'Once purchasing was judged by the savings it booked, part prices fell,', ko: '구매 부서가 절감액으로 평가되자 부품 값은 내려갔다,' },
      { en: 'but warranty claims rose,', ko: '그러나 보증 청구는 올라갔다,' },
      { en: 'and that cost accumulated in an account', ko: '그리고 그 비용은 어느 계정에 쌓였다' },
      { en: 'nobody counted against the department.', ko: '아무도 그 부서 몫으로 셈하지 않는.' },
    ],
  },
  {
    topic: '창고의 자동화',
    korean_full: '물류 창고를 자동화한 회사는 인건비를 줄였다. 그러나 이제 설비가 처리할 수 있는 품목만 취급할 수 있었고, 그 목록이 이후 무엇을 팔지를 정했다.',
    chunks: [
      { en: 'The company that automated its warehouse cut labour,', ko: '물류 창고를 자동화한 회사는 인건비를 줄였다,' },
      { en: 'but could then handle only the items the machines accepted,', ko: '그러나 설비가 받아들이는 품목만 다룰 수 있게 되었다,' },
      { en: 'and that list decided', ko: '그리고 그 목록이 정했다' },
      { en: 'what the firm would sell thereafter.', ko: '그 회사가 이후 무엇을 팔지를.' },
    ],
  },
  {
    topic: '전세 계약의 기간',
    korean_full: '오 년 임대는 상인에게 안정을 주었다. 그러나 거리가 바뀌면 그 안정이 덫이 되었고, 살아남은 이들은 값을 더 치르고 짧게 빌린 쪽이었다.',
    chunks: [
      { en: 'A five-year lease gave the shopkeeper stability,', ko: '오 년 임대는 상인에게 안정을 주었다,' },
      { en: 'yet when the street changed that stability became a trap,', ko: '그러나 거리가 바뀌자 그 안정은 덫이 되었다,' },
      { en: 'and those who survived', ko: '그리고 살아남은 이들은' },
      { en: 'were the ones who had paid more to rent briefly.', ko: '값을 더 치르고 짧게 빌린 쪽이었다.' },
    ],
  },
  {
    topic: '실험의 표본',
    korean_full: '두 화면을 견주어 더 많이 눌린 쪽을 고른 회사는 한 해 만에 누르기는 쉬우나 돌아올 이유는 없는 제품에 이르렀다.',
    chunks: [
      { en: 'A firm that compared two screens and kept whichever drew more clicks', ko: '두 화면을 견주어 더 많이 눌린 쪽을 남긴 회사는' },
      { en: 'arrived within a year at a product', ko: '한 해 만에 어떤 제품에 이르렀다' },
      { en: 'that was easy to click', ko: '누르기는 쉬우나' },
      { en: 'and gave no reason to return.', ko: '돌아올 이유는 주지 않는.' },
    ],
  },
  {
    topic: '부품의 단일 공급',
    korean_full: '단일 공급처는 값을 낮추었다. 그 공장이 물에 잠기기 전까지는. 그리고 그때 잃은 것은 절감액이 아니라 다시 대체할 수 없는 한 분기의 생산이었다.',
    chunks: [
      { en: 'A single source kept the price down', ko: '단일 공급처는 값을 낮추었다' },
      { en: 'until the day that plant flooded,', ko: '그 공장이 물에 잠기는 날까지는,' },
      { en: 'and what was lost then was not the saving', ko: '그리고 그때 잃은 것은 절감액이 아니라' },
      { en: 'but a quarter\'s production that could not be made up.', ko: '다시 채울 수 없는 한 분기의 생산이었다.' },
    ],
  },
  {
    topic: '광고와 브랜드',
    korean_full: '브랜드가 광고로 지어졌다고 여긴 회사는 예산을 줄이고 아무 일도 일어나지 않음을 보았다. 그리고 삼 년 뒤, 그것이 무엇으로 지어졌는지 알게 되었다.',
    chunks: [
      { en: 'The firm that believed its brand was built by advertising', ko: '브랜드가 광고로 지어졌다고 여긴 회사는' },
      { en: 'cut the budget and saw nothing happen,', ko: '예산을 줄이고 아무 일도 없음을 보았다,' },
      { en: 'and three years later', ko: '그리고 삼 년 뒤' },
      { en: 'learned what it had actually been built on.', ko: '그것이 실제로 무엇 위에 지어졌는지 알게 되었다.' },
    ],
  },
  {
    topic: '공동 구매',
    korean_full: '병원들이 공동 구매 기구로 묶이자 값은 내려갔다. 그러나 협상할 것이 하나뿐인 시장에서 공급자 수도 줄었고, 다음 계약은 더 비쌌다.',
    chunks: [
      { en: 'Once hospitals bound themselves into a purchasing group, prices fell,', ko: '병원들이 공동 구매 기구로 묶이자 값은 내려갔다,' },
      { en: 'but the number of suppliers fell too', ko: '그러나 공급자 수도 줄었다' },
      { en: 'in a market with only one buyer to negotiate with,', ko: '협상할 매수자가 하나뿐인 시장에서,' },
      { en: 'and the next contract cost more.', ko: '그리고 다음 계약은 더 비쌌다.' },
    ],
  },
  {
    topic: '회계 기준의 변경',
    korean_full: '임대를 대차대조표에 올리도록 한 기준 변경은 아무 회사의 현금도 바꾸지 않았다. 그러나 차입 약정을 깨뜨렸고, 여러 회사가 아무것도 달라지지 않은 채 팔려 나갔다.',
    chunks: [
      { en: 'The rule that brought leases onto the balance sheet', ko: '임대를 대차대조표에 올린 기준은' },
      { en: 'changed no company\'s cash,', ko: '어느 회사의 현금도 바꾸지 않았다,' },
      { en: 'yet it broke their borrowing covenants,', ko: '그러나 차입 약정을 깨뜨렸다,' },
      { en: 'and several were sold though nothing had altered.', ko: '그리고 여럿이 아무것도 달라지지 않은 채 팔렸다.' },
    ],
  },
  {
    topic: '직영과 가맹',
    korean_full: '직영으로 운영한 사슬은 더 느리게 자랐다. 그러나 모든 점포가 이름을 지킬 자기 이유를 가졌고, 가맹으로 자란 쪽은 그것을 다시 사들여야 했다.',
    chunks: [
      { en: 'The chain that ran its own shops grew more slowly,', ko: '직영으로 운영한 사슬은 더 느리게 자랐다,' },
      { en: 'but every branch had its own reason to protect the name,', ko: '그러나 모든 점포가 이름을 지킬 자기 이유를 가졌다,' },
      { en: 'and the chain that grew by franchise', ko: '그리고 가맹으로 자란 쪽은' },
      { en: 'had to buy that back.', ko: '그것을 다시 사들여야 했다.' },
    ],
  },
  {
    topic: '정찰제',
    korean_full: '한 가격만 붙이자 흥정이 사라졌고, 그와 함께 흥정할 줄 아는 판매원도 사라졌다. 그리하여 그 상점이 파는 것은 물건이 아니라 진열이 되었다.',
    chunks: [
      { en: 'Once a single price was posted, haggling disappeared,', ko: '한 가격만 붙이자 흥정이 사라졌다,' },
      { en: 'and with it the clerk who knew how to haggle,', ko: '그와 함께 흥정할 줄 아는 판매원도,' },
      { en: 'so that what the shop sold', ko: '그리하여 그 상점이 판 것은' },
      { en: 'became the display rather than the goods.', ko: '물건이 아니라 진열이 되었다.' },
    ],
  },
  {
    topic: '예약 부도',
    korean_full: '식당이 예약 부도에 값을 물리기 시작하자 빈 자리는 줄었다. 그러나 오지 않는 손님이 더는 미안해하지 않게 되었고, 그 값은 사과를 대체했다.',
    chunks: [
      { en: 'When restaurants began charging for a missed booking, empty tables fell,', ko: '식당이 예약 부도에 값을 물리자 빈 자리는 줄었다,' },
      { en: 'but the guest who failed to come', ko: '그러나 오지 않은 손님은' },
      { en: 'no longer felt he owed an apology,', ko: '더는 사과할 빚이 있다고 느끼지 않았다,' },
      { en: 'and the fee had replaced it.', ko: '그리고 그 값이 사과를 대신했다.' },
    ],
  },
  {
    topic: '운임 담합',
    korean_full: '해운 동맹이 운임을 고정했을 때 화주들은 값을 치렀다. 그러나 동맹이 깨지자 운임은 아무도 배를 새로 짓지 않을 만큼 낮아졌고, 화주들은 십 년 뒤 더 치렀다.',
    chunks: [
      { en: 'When the shipping conference fixed rates, shippers paid for it,', ko: '해운 동맹이 운임을 고정하자 화주들이 값을 치렀다,' },
      { en: 'but once the conference broke the rates fell so low', ko: '그러나 동맹이 깨지자 운임은 너무 낮아졌다' },
      { en: 'that nobody built new ships,', ko: '아무도 배를 새로 짓지 않을 만큼,' },
      { en: 'and the shippers paid more a decade later.', ko: '그리고 화주들은 십 년 뒤 더 치렀다.' },
    ],
  },
  {
    topic: '기술 이전 조건',
    korean_full: '합작에 기술 이전을 요구한 나라는 공장을 얻었다. 그러나 이전된 것은 조립 절차였지 설계가 아니었고, 그 차이는 다음 세대 제품에서야 드러났다.',
    chunks: [
      { en: 'The country that demanded technology transfer for a joint venture', ko: '합작에 기술 이전을 요구한 나라는' },
      { en: 'received the plant,', ko: '공장을 받았다,' },
      { en: 'though what transferred was the assembly procedure, not the design,', ko: '그러나 이전된 것은 조립 절차였지 설계가 아니었다,' },
      { en: 'and the difference showed only a generation later.', ko: '그리고 그 차이는 한 세대 뒤에야 드러났다.' },
    ],
  },
  {
    topic: '탄소 배출권',
    korean_full: '배출권을 무상으로 배분하자 가장 많이 배출하던 공장이 가장 많이 받았고, 그리하여 그 제도는 줄이려던 바로 그 행위에 값을 치렀다.',
    chunks: [
      { en: 'Allocating emission permits without charge', ko: '배출권을 무상으로 배분하자' },
      { en: 'gave the most to the plants that had emitted the most,', ko: '가장 많이 배출한 공장이 가장 많이 받았다,' },
      { en: 'so that the scheme paid for', ko: '그리하여 그 제도는 값을 치렀다' },
      { en: 'the very behaviour it meant to reduce.', ko: '줄이려던 바로 그 행위에.' },
    ],
  },
  {
    topic: '신문 배달망',
    korean_full: '신문이 자기 배달망을 소유한 것은 종이를 나르기 위해서였다. 그러나 종이가 사라지자 그 망은 자산이 아니라 아무도 원하지 않는 고정비가 되었다.',
    chunks: [
      { en: 'A newspaper owned its delivery network in order to carry paper,', ko: '신문이 배달망을 소유한 것은 종이를 나르기 위해서였다,' },
      { en: 'but once the paper went', ko: '그러나 종이가 사라지자' },
      { en: 'that network became not an asset', ko: '그 망은 자산이 아니라' },
      { en: 'but a fixed cost nobody wanted.', ko: '아무도 원하지 않는 고정비가 되었다.' },
    ],
  },
  {
    topic: '소비자 보호 규정',
    korean_full: '분쟁을 중재로 보내도록 한 조항은 소송을 줄였다. 그러나 불만도 함께 사라졌고, 회사는 무엇이 잘못되고 있는지 알아낼 마지막 통로를 닫았다.',
    chunks: [
      { en: 'The clause that sent disputes to arbitration reduced lawsuits,', ko: '분쟁을 중재로 보낸 조항은 소송을 줄였다,' },
      { en: 'but the complaints went with them,', ko: '그러나 불만도 함께 사라졌다,' },
      { en: 'and the company closed the last channel', ko: '그리고 회사는 마지막 통로를 닫았다' },
      { en: 'through which it learned what was going wrong.', ko: '무엇이 잘못되는지 알던.' },
    ],
  },
  {
    topic: '창업 비용의 하락',
    korean_full: '회사를 세우는 비용이 떨어지자 더 많은 회사가 생겼고, 그리하여 희소해진 것은 자본이 아니라 주목이었으며, 자본은 그 주목을 사는 데 쓰였다.',
    chunks: [
      { en: 'As the cost of starting a company fell, more were started,', ko: '회사를 세우는 비용이 떨어지자 더 많이 생겼다,' },
      { en: 'so that what grew scarce was not capital but attention,', ko: '그리하여 희소해진 것은 자본이 아니라 주목이었다,' },
      { en: 'and capital was spent', ko: '그리고 자본은 쓰였다' },
      { en: 'buying the attention instead.', ko: '그 주목을 사는 데.' },
    ],
  },
  {
    topic: '원격 근무와 사무실',
    korean_full: '사무실을 비운 회사들은 임대료를 아꼈다. 그러나 그 건물을 담보로 잡은 은행들이 손실을 떠안았고, 그 손실은 한 번도 그 사무실에 앉지 않은 예금자에게 닿았다.',
    chunks: [
      { en: 'Firms that emptied their offices saved rent,', ko: '사무실을 비운 회사들은 임대료를 아꼈다,' },
      { en: 'but the banks that held those buildings as collateral took the loss,', ko: '그러나 그 건물을 담보로 쥔 은행들이 손실을 떠안았다,' },
      { en: 'and it reached depositors', ko: '그리고 그것은 예금자에게 닿았다' },
      { en: 'who had never sat in them.', ko: '한 번도 거기 앉은 적 없는.' },
    ],
  },
  {
    topic: '시험 성적과 학교',
    korean_full: '학교를 시험 성적으로 평가하자 시험에 나오지 않는 과목의 수업 시간이 줄었고, 그 손실은 그 학생들이 학교를 떠난 뒤에야 드러났다.',
    chunks: [
      { en: 'Once schools were judged by test scores,', ko: '학교가 시험 성적으로 평가되자,' },
      { en: 'the hours given to subjects that were not tested shrank,', ko: '시험에 없는 과목의 시간이 줄었다,' },
      { en: 'and that loss appeared', ko: '그리고 그 손실은 드러났다' },
      { en: 'only after those pupils had left.', ko: '그 학생들이 떠난 뒤에야.' },
    ],
  },
  {
    topic: '부동산 중개 수수료',
    korean_full: '수수료가 매매가에 비례했기 때문에 중개인은 값을 조금 더 받기보다 빨리 파는 쪽을 택했고, 그 차이는 매도인의 것이지 중개인의 것이 아니었다.',
    chunks: [
      { en: 'Because the commission was a share of the sale price,', ko: '수수료가 매매가의 몫이었기 때문에,' },
      { en: 'the agent preferred a quick sale to a higher one,', ko: '중개인은 높은 값보다 빠른 매매를 택했다,' },
      { en: 'and the difference belonged to the seller', ko: '그리고 그 차이는 매도인의 것이었다' },
      { en: 'rather than to the agent.', ko: '중개인의 것이 아니라.' },
    ],
  },
  {
    topic: '항만 준설',
    korean_full: '수심을 깊이 판 항만은 더 큰 배를 받았다. 그러나 그 배들은 더 적은 항만에 들렀고, 준설하지 않은 이웃 항만들은 한 번의 결정으로 지선이 되었다.',
    chunks: [
      { en: 'The port that dredged deeper received larger ships,', ko: '수심을 깊이 판 항만은 더 큰 배를 받았다,' },
      { en: 'but those ships called at fewer ports,', ko: '그러나 그 배들은 더 적은 항만에 들렀다,' },
      { en: 'and the neighbours that had not dredged', ko: '그리고 준설하지 않은 이웃들은' },
      { en: 'became feeder stops in a single decision.', ko: '한 번의 결정으로 지선 기항지가 되었다.' },
    ],
  },
  {
    topic: '약가 협상',
    korean_full: '한 나라가 약값을 낮추자 제약사는 다른 곳에서 값을 올렸고, 그리하여 협상에서 이긴 쪽은 협상하지 않은 나라의 환자들에게 값을 떠넘겼다.',
    chunks: [
      { en: 'When one country negotiated its drug prices down,', ko: '한 나라가 약값을 낮추자,' },
      { en: 'the maker raised them elsewhere,', ko: '제약사는 다른 곳에서 올렸다,' },
      { en: 'so that whoever won the negotiation', ko: '그리하여 협상에서 이긴 쪽은' },
      { en: 'shifted the cost to patients who had none.', ko: '협상이 없던 나라의 환자에게 값을 넘겼다.' },
    ],
  },
  {
    topic: '공정 자동화와 품질',
    korean_full: '검사를 기계에 맡긴 공장은 사람이 잡던 것을 놓쳤다. 기계는 찾으라고 배운 것만 찾았고, 새로운 결함은 정의될 때까지 결함이 아니었기 때문이다.',
    chunks: [
      { en: 'The plant that gave inspection to machines missed what people had caught,', ko: '검사를 기계에 맡긴 공장은 사람이 잡던 것을 놓쳤다,' },
      { en: 'because a machine finds only what it was taught to find,', ko: '기계는 찾으라고 배운 것만 찾기 때문이다,' },
      { en: 'and a new fault was none', ko: '그리고 새 결함은 결함이 아니었다' },
      { en: 'until someone defined it.', ko: '누군가 정의하기 전까지는.' },
    ],
  },
  {
    topic: '최저 입찰',
    korean_full: '최저 입찰자에게 낙찰하도록 한 규칙은 구매 단계에서 돈을 아꼈다. 그러나 변경 계약에서 그것을 돌려주었고, 그 값은 처음 표에 결코 나타나지 않았다.',
    chunks: [
      { en: 'The rule that awarded contracts to the lowest bidder', ko: '최저 입찰자에게 낙찰한 규칙은' },
      { en: 'saved money at the moment of purchase,', ko: '구매 시점에 돈을 아꼈다,' },
      { en: 'but gave it back in change orders', ko: '그러나 변경 계약에서 돌려주었다' },
      { en: 'that never appeared in the original table.', ko: '처음 표에 결코 나타나지 않은.' },
    ],
  },
  {
    topic: '산업 표준 특허',
    korean_full: '표준에 자기 특허가 들어간 회사는 그 표준이 널리 쓰이기를 바랐다. 그러나 널리 쓰이게 하려면 실시료를 낮춰야 했고, 그 둘은 같은 회의에서 다투었다.',
    chunks: [
      { en: 'The firm whose patent entered the standard wanted the standard adopted,', ko: '표준에 특허가 들어간 회사는 그 표준이 채택되기를 바랐다,' },
      { en: 'yet adoption required a low royalty,', ko: '그러나 채택에는 낮은 실시료가 필요했다,' },
      { en: 'and the two aims argued', ko: '그리고 그 두 목적은 다투었다' },
      { en: 'inside the same meeting.', ko: '같은 회의 안에서.' },
    ],
  },
  {
    topic: '은행 지점망',
    korean_full: '지점을 닫아 비용을 줄인 은행은 예금이 함께 빠져나가는 것을 보았다. 예금자들이 지점에 온 것은 거래 때문이 아니라 은행이 거기 있다는 사실 때문이었기 때문이다.',
    chunks: [
      { en: 'The bank that closed branches to cut costs', ko: '비용을 줄이려 지점을 닫은 은행은' },
      { en: 'watched the deposits leave with them,', ko: '예금이 함께 빠져나가는 것을 보았다,' },
      { en: 'because savers had come to the branch not to transact', ko: '예금자들이 지점에 온 것은 거래하러가 아니라' },
      { en: 'but because the bank was there.', ko: '은행이 거기 있었기 때문이다.' },
    ],
  },
  {
    topic: '중고 시장의 등장',
    korean_full: '중고 시장이 생기자 새 물건의 값이 올랐다. 구매자가 이제 나중에 되팔 수 있음을 알았기 때문이고, 그 값은 팔 생각이 없는 이들도 치렀다.',
    chunks: [
      { en: 'Once a second-hand market existed, the price of new goods rose,', ko: '중고 시장이 생기자 새 물건 값이 올랐다,' },
      { en: 'because buyers now knew they could resell,', ko: '구매자가 되팔 수 있음을 알았기 때문이다,' },
      { en: 'and that price was paid', ko: '그리고 그 값은 치러졌다' },
      { en: 'by those who never meant to.', ko: '그럴 생각이 없던 이들에게도.' },
    ],
  },
  {
    topic: '공급자 평가',
    korean_full: '공급자를 단가로만 고른 회사는 가장 싼 곳을 찾았다. 그러나 그 공장이 멈춘 주에 잃은 것은 여러 해의 절감액보다 컸고, 아무도 그 둘을 같은 표에 놓지 않았다.',
    chunks: [
      { en: 'The firm that chose suppliers by unit price found the cheapest,', ko: '공급자를 단가로만 고른 회사는 가장 싼 곳을 찾았다,' },
      { en: 'but what it lost in the week that plant stopped', ko: '그러나 그 공장이 멈춘 주에 잃은 것은' },
      { en: 'exceeded years of savings,', ko: '여러 해의 절감액을 넘었다,' },
      { en: 'and nobody put the two in one table.', ko: '그리고 아무도 그 둘을 한 표에 놓지 않았다.' },
    ],
  },
  {
    topic: '기내 수하물',
    korean_full: '수하물에 값을 물린 항공사는 새 수입을 얻었다. 그러나 승객들이 모든 것을 기내로 들고 타면서 탑승이 느려졌고, 그 지연은 운항 시각표가 치렀다.',
    chunks: [
      { en: 'The airline that charged for checked bags gained a new revenue,', ko: '수하물에 값을 물린 항공사는 새 수입을 얻었다,' },
      { en: 'but boarding slowed as passengers carried everything aboard,', ko: '그러나 승객들이 모든 것을 들고 타면서 탑승이 느려졌다,' },
      { en: 'and the timetable paid', ko: '그리고 운항 시각표가 값을 치렀다' },
      { en: 'for the delay it caused.', ko: '그것이 만든 지연의.' },
    ],
  },
  {
    topic: '연구비의 배분',
    korean_full: '성공한 과제에 연구비를 몰아준 기관은 실패할 만한 과제가 사라지는 것을 보았고, 그리하여 배울 것이 가장 많은 실험이 가장 먼저 자금을 잃었다.',
    chunks: [
      { en: 'The agency that concentrated its grants on successful projects', ko: '성공한 과제에 연구비를 몰아준 기관은' },
      { en: 'watched the projects that might fail disappear,', ko: '실패할 만한 과제가 사라지는 것을 보았다,' },
      { en: 'so that the experiments with most to teach', ko: '그리하여 배울 것이 가장 많은 실험이' },
      { en: 'were the first to lose their funding.', ko: '가장 먼저 자금을 잃었다.' },
    ],
  },
  {
    topic: '도제와 이직',
    korean_full: '숙련공을 길러 낸 회사는 그를 잃었다. 훈련이 어디서나 값어치를 가졌기 때문이고, 그리하여 아무도 훈련하지 않는 산업에서 임금은 오르되 기술은 오르지 않았다.',
    chunks: [
      { en: 'The firm that trained a craftsman lost him,', ko: '숙련공을 길러 낸 회사는 그를 잃었다,' },
      { en: 'because the training was worth something anywhere,', ko: '그 훈련이 어디서나 값어치를 가졌기 때문이다,' },
      { en: 'so in an industry where nobody trained', ko: '그리하여 아무도 훈련하지 않는 산업에서' },
      { en: 'wages rose while skill did not.', ko: '임금은 올랐으나 기술은 오르지 않았다.' },
    ],
  },
  {
    topic: '양면 시장의 시작',
    korean_full: '어느 쪽도 상대 없이는 오지 않는 시장에서 창업자는 한쪽에 값을 치러 데려와야 했고, 그 보조금이 시장이 되기 전까지의 진짜 비용이었다.',
    chunks: [
      { en: 'In a market where neither side would come without the other,', ko: '어느 쪽도 상대 없이는 오지 않는 시장에서,' },
      { en: 'the founder had to pay one side to arrive,', ko: '창업자는 한쪽에 값을 치러 오게 해야 했다,' },
      { en: 'and that subsidy was the real cost', ko: '그리고 그 보조금이 진짜 비용이었다' },
      { en: 'of everything before it became a market.', ko: '시장이 되기 전 모든 것의.' },
    ],
  },
  {
    topic: '외상 거래의 금융',
    korean_full: '공급업체가 육십 일의 외상을 준 것은 관대해서가 아니었다. 그것은 은행보다 싼 대출이었고, 그 값은 결국 단가 안에 들어가 두 번 다시 협상되지 않았다.',
    chunks: [
      { en: 'A supplier who gave sixty days of credit was not being generous;', ko: '육십 일 외상을 준 공급업체는 관대한 것이 아니었다;' },
      { en: 'it was a loan cheaper than the bank\'s,', ko: '그것은 은행보다 싼 대출이었다,' },
      { en: 'and its price entered the unit cost', ko: '그리고 그 값은 단가 안에 들어갔다' },
      { en: 'where it was never negotiated again.', ko: '두 번 다시 협상되지 않는 자리에.' },
    ],
  },
  {
    topic: '가맹 수수료의 기준',
    korean_full: '매출에 로열티를 매긴 본사는 가맹점이 값을 내리기를 바랐고, 이익에 매겼다면 바라지 않았을 것이다. 두 회사는 같은 간판 아래에서 서로 다른 사업을 했다.',
    chunks: [
      { en: 'A franchisor paid a royalty on sales wanted its outlets to cut prices,', ko: '매출에 로열티를 받는 본사는 가맹점이 값을 내리기를 바랐다,' },
      { en: 'which it would not have wanted on profit,', ko: '이익에 받았다면 바라지 않았을 일이다,' },
      { en: 'and the two companies ran different businesses', ko: '그리고 두 회사는 서로 다른 사업을 했다' },
      { en: 'under one sign.', ko: '하나의 간판 아래에서.' },
    ],
  },
  {
    topic: '임대와 잔존가',
    korean_full: '임대 회사는 임대료로 번 것이 아니라 기간이 끝났을 때 그 설비가 얼마인지로 벌었고, 그 내기가 틀린 해에 사업 전체가 틀렸다.',
    chunks: [
      { en: 'The leasing company earned not from the rent', ko: '임대 회사는 임대료로 번 것이 아니라' },
      { en: 'but from what the machine was worth when the term ended,', ko: '기간이 끝났을 때 그 기계가 얼마인지로 벌었다,' },
      { en: 'and in the year that bet was wrong', ko: '그리고 그 내기가 틀린 해에' },
      { en: 'the whole business was wrong.', ko: '사업 전체가 틀렸다.' },
    ],
  },
  {
    topic: '방직 공장의 이주',
    korean_full: '남부로 옮긴 방직 공장은 낮은 임금을 좇았다. 그러나 그 임금은 어디서나 낮아질 수 있었고, 이주가 가능하다는 사실이 곧 다음 이주를 불가피하게 만들었다.',
    chunks: [
      { en: 'The textile mill that moved south followed low wages,', ko: '남부로 옮긴 방직 공장은 낮은 임금을 좇았다,' },
      { en: 'but those wages could be low anywhere,', ko: '그러나 그 임금은 어디서나 낮을 수 있었다,' },
      { en: 'and the fact that moving was possible', ko: '그리고 이주가 가능하다는 사실이' },
      { en: 'made the next move inevitable.', ko: '다음 이주를 불가피하게 만들었다.' },
    ],
  },
  {
    topic: '운하의 퇴장',
    korean_full: '운하 회사들은 철도와 요금으로 다투다 졌다. 그들이 판 것은 저렴한 운송이었으나 철도가 판 것은 속도였고, 두 값은 같은 표에 놓인 적이 없었다.',
    chunks: [
      { en: 'The canal companies fought the railways on price and lost,', ko: '운하 회사들은 철도와 값으로 다투다 졌다,' },
      { en: 'because what they sold was cheap carriage', ko: '그들이 판 것은 저렴한 운송이었기 때문이다' },
      { en: 'while the railway sold speed,', ko: '철도가 판 것은 속도였고,' },
      { en: 'and the two were never on one sheet.', ko: '그 둘은 한 표에 놓인 적이 없었다.' },
    ],
  },
  {
    topic: '특허 덤불',
    korean_full: '한 제품에 수백 건의 특허가 걸리자 그것을 만드는 일보다 만들 권리를 정리하는 일이 비싸졌고, 그 비용은 변호사를 둘 여유가 있는 쪽에 유리하게 작용했다.',
    chunks: [
      { en: 'Once hundreds of patents covered one product,', ko: '한 제품에 수백 건의 특허가 걸리자,' },
      { en: 'clearing the right to make it cost more than making it,', ko: '만들 권리를 정리하는 일이 만드는 일보다 비싸졌다,' },
      { en: 'and that cost favoured whoever', ko: '그리고 그 비용은 유리하게 작용했다' },
      { en: 'could afford the lawyers.', ko: '변호사를 둘 여유가 있는 쪽에.' },
    ],
  },
  {
    topic: '공개 소스와 지원',
    korean_full: '소프트웨어를 거저 준 회사는 지원으로 벌었다. 그리하여 쓰기 쉬운 제품을 만들 유인이 사라졌고, 그 모순은 여러 해 동안 아무도 장부에서 보지 못했다.',
    chunks: [
      { en: 'The company that gave its software away earned from support,', ko: '소프트웨어를 거저 준 회사는 지원으로 벌었다,' },
      { en: 'so the incentive to make it easy to use disappeared,', ko: '그리하여 쓰기 쉽게 만들 유인이 사라졌다,' },
      { en: 'and that contradiction went unseen in the accounts', ko: '그리고 그 모순은 장부에서 보이지 않았다' },
      { en: 'for years.', ko: '여러 해 동안.' },
    ],
  },
  {
    topic: '허브와 직항',
    korean_full: '허브 방식은 좌석을 채웠으나 지연을 퍼뜨렸다. 한 공항의 아침 안개가 그날 저녁 세 대륙의 시각표에 나타났고, 직항사는 그 값을 치르지 않았다.',
    chunks: [
      { en: 'The hub filled seats but spread delay,', ko: '허브 방식은 좌석을 채웠으나 지연을 퍼뜨렸다,' },
      { en: 'so that morning fog at one airport', ko: '그리하여 한 공항의 아침 안개가' },
      { en: 'appeared that evening in timetables on three continents,', ko: '그날 저녁 세 대륙의 시각표에 나타났다,' },
      { en: 'which the point-to-point carrier never paid for.', ko: '직항사는 결코 치르지 않은 값이다.' },
    ],
  },
  {
    topic: '객실 점유율',
    korean_full: '호텔을 점유율로 평가하자 지배인은 값을 내려 방을 채웠고, 그 방들이 벌어들인 금액은 빈 방과 거의 다르지 않았으나 표에는 좋아 보였다.',
    chunks: [
      { en: 'Judging a hotel by occupancy led the manager to fill rooms by cutting rates,', ko: '호텔을 점유율로 평가하자 지배인은 값을 내려 방을 채웠다,' },
      { en: 'and what those rooms earned', ko: '그리고 그 방들이 벌어들인 것은' },
      { en: 'differed little from leaving them empty,', ko: '비워 두는 것과 거의 다르지 않았다,' },
      { en: 'though the table looked better.', ko: '표는 더 좋아 보였지만.' },
    ],
  },
  {
    topic: '암표와 정가',
    korean_full: '공연표를 시세보다 싸게 판 주최자는 되팔이에게 그 차액을 넘겼고, 그리하여 관객은 어차피 시세를 치렀으나 그 돈은 무대에 닿지 않았다.',
    chunks: [
      { en: 'A promoter who priced tickets below the market', ko: '공연표를 시세보다 싸게 판 주최자는' },
      { en: 'handed the difference to resellers,', ko: '그 차액을 되팔이에게 넘겼다,' },
      { en: 'so the audience paid the market price anyway', ko: '그리하여 관객은 어차피 시세를 치렀다' },
      { en: 'and none of it reached the stage.', ko: '그리고 그중 아무것도 무대에 닿지 않았다.' },
    ],
  },
  {
    topic: '최저 낙찰가',
    korean_full: '경매에 최저 낙찰가를 두자 유찰이 늘었다. 그러나 팔린 물건의 값은 올랐고, 주최자가 무엇을 극대화하려 했는지가 그 둘 중 무엇이 성공인지를 정했다.',
    chunks: [
      { en: 'Setting a reserve price raised the number of lots that went unsold,', ko: '경매에 최저 낙찰가를 두자 유찰이 늘었다,' },
      { en: 'yet lifted the price of those that sold,', ko: '그러나 팔린 물건의 값은 올렸다,' },
      { en: 'and what the seller was maximising', ko: '그리고 주최자가 무엇을 극대화했는지가' },
      { en: 'decided which of those was success.', ko: '그 둘 중 무엇이 성공인지 정했다.' },
    ],
  },
  {
    topic: '재판매 가격 유지',
    korean_full: '제조사가 소매가를 정하자 상점들은 값이 아니라 서비스로 다투었고, 그리하여 소비자는 원하든 원하지 않든 그 서비스의 값을 치렀다.',
    chunks: [
      { en: 'When the maker fixed the retail price,', ko: '제조사가 소매가를 정하자,' },
      { en: 'shops competed on service instead of price,', ko: '상점들은 값이 아니라 서비스로 다투었다,' },
      { en: 'so the customer paid for that service', ko: '그리하여 고객은 그 서비스의 값을 치렀다' },
      { en: 'whether or not he wanted it.', ko: '원하든 원하지 않든.' },
    ],
  },
  {
    topic: '보증 충당금',
    korean_full: '보증 충당금을 적게 잡은 회사는 좋은 분기를 보고했다. 청구가 들어온 것은 그 분기를 보고한 경영진이 이미 떠난 뒤였고, 아무도 그 둘을 잇지 않았다.',
    chunks: [
      { en: 'The firm that reserved little for warranties reported a good quarter,', ko: '보증 충당금을 적게 잡은 회사는 좋은 분기를 보고했다,' },
      { en: 'and the claims arrived', ko: '그리고 청구는 들어왔다' },
      { en: 'after the managers who reported it had gone,', ko: '그 분기를 보고한 경영진이 떠난 뒤에,' },
      { en: 'so nobody joined the two.', ko: '그리하여 아무도 그 둘을 잇지 않았다.' },
    ],
  },
  {
    topic: '헤지의 성적',
    korean_full: '원자재를 헤지한 회사는 값이 오른 해에 손실을 보고했다. 그것이 헤지가 하는 일인데도, 그 손실을 설명하라는 요구가 다음 해의 헤지를 없앴다.',
    chunks: [
      { en: 'The company that hedged its commodity reported a loss in the year prices rose,', ko: '원자재를 헤지한 회사는 값이 오른 해에 손실을 보고했다,' },
      { en: 'which is what a hedge does,', ko: '그것이 헤지가 하는 일인데도,' },
      { en: 'yet the demand to explain that loss', ko: '그러나 그 손실을 설명하라는 요구가' },
      { en: 'abolished the hedge the following year.', ko: '다음 해의 헤지를 없앴다.' },
    ],
  },
  {
    topic: '자기자본 비율',
    korean_full: '은행에 자기자본 비율을 요구하자 위험 가중치가 낮은 자산으로 옮겨 갔고, 그리하여 규제는 위험의 총량이 아니라 그것이 어디에 놓이는지를 바꾸었다.',
    chunks: [
      { en: 'Requiring banks to hold capital against assets', ko: '은행에 자산 대비 자본을 요구하자' },
      { en: 'moved them into whatever carried a low risk weight,', ko: '위험 가중치가 낮은 쪽으로 옮겨 갔다,' },
      { en: 'so the rule changed where the risk sat', ko: '그리하여 규칙은 위험이 어디 놓이는지를 바꾸었다' },
      { en: 'rather than how much there was.', ko: '얼마나 있는지가 아니라.' },
    ],
  },
  {
    topic: '보편 서비스',
    korean_full: '먼 마을까지 같은 요금으로 우편을 배달하라는 의무는 도시의 발송인이 그 값을 치르게 했고, 그 교차 보조는 경쟁자가 도시만 가져갈 때 무너졌다.',
    chunks: [
      { en: 'The duty to deliver to a distant village at the same rate', ko: '먼 마을까지 같은 요금으로 배달할 의무는' },
      { en: 'made the city sender pay for it,', ko: '도시의 발송인이 그 값을 치르게 했다,' },
      { en: 'and that cross-subsidy collapsed', ko: '그리고 그 교차 보조는 무너졌다' },
      { en: 'when a rival took only the cities.', ko: '경쟁자가 도시만 가져갔을 때.' },
    ],
  },
  {
    topic: '시간대 요금',
    korean_full: '시간대별 전기 요금은 수요를 옮겼을 뿐 줄이지 않았다. 그러나 옮긴 것만으로 발전소 한 기를 짓지 않아도 되었고, 그것이 요금제의 진짜 성과였다.',
    chunks: [
      { en: 'Time-of-use electricity pricing moved demand rather than reduced it,', ko: '시간대별 전기 요금은 수요를 줄이지 않고 옮겼다,' },
      { en: 'yet moving it alone', ko: '그러나 옮긴 것만으로' },
      { en: 'spared the system one power station,', ko: '발전소 한 기를 아꼈다,' },
      { en: 'which was the tariff\'s real achievement.', ko: '그것이 그 요금제의 진짜 성과였다.' },
    ],
  },
  {
    topic: '혼잡 통행료',
    korean_full: '혼잡 통행료는 길을 비웠다. 그러나 비워진 길은 다른 길에서 온 운전자를 끌어들였고, 그리하여 요금이 값한 것은 통행이 아니라 그것이 드러낸 수요였다.',
    chunks: [
      { en: 'The congestion charge emptied the road,', ko: '혼잡 통행료는 길을 비웠다,' },
      { en: 'but the emptied road drew drivers from other roads,', ko: '그러나 비워진 길은 다른 길의 운전자를 끌어들였다,' },
      { en: 'so what the charge priced', ko: '그리하여 요금이 값한 것은' },
      { en: 'was the demand it revealed rather than the traffic.', ko: '통행이 아니라 그것이 드러낸 수요였다.' },
    ],
  },
  {
    topic: '컨테이너 임대',
    korean_full: '컨테이너를 소유한 선사는 무역이 한 방향으로 기울 때 빈 상자를 되돌려야 했다. 빌려 쓴 선사는 그냥 반납했고, 그 차이는 호황이 아니라 불황에서 드러났다.',
    chunks: [
      { en: 'A line that owned its containers had to bring the empties back', ko: '컨테이너를 소유한 선사는 빈 상자를 되돌려야 했다' },
      { en: 'when trade ran one way,', ko: '무역이 한 방향으로 흐를 때,' },
      { en: 'while the line that leased simply returned them,', ko: '빌려 쓴 선사는 그냥 반납했다,' },
      { en: 'and the difference showed in the slump.', ko: '그리고 그 차이는 불황에서 드러났다.' },
    ],
  },
  {
    topic: '팹의 감가',
    korean_full: '반도체 공장은 팔 수 있는 것을 만들기 전에 감가가 시작되었다. 그리하여 짓기로 한 결정은 수요 예측이 아니라 삼 년 뒤의 달력에 걸린 내기였다.',
    chunks: [
      { en: 'A semiconductor fab began depreciating before it made anything saleable,', ko: '반도체 공장은 팔 것을 만들기 전에 감가가 시작되었다,' },
      { en: 'so the decision to build', ko: '그리하여 짓기로 한 결정은' },
      { en: 'was a bet on a calendar three years out', ko: '삼 년 뒤의 달력에 건 내기였다' },
      { en: 'rather than a forecast of demand.', ko: '수요 예측이 아니라.' },
    ],
  },
  {
    topic: '영업 인력의 값',
    korean_full: '제약사가 영업 인력을 늘리자 처방이 늘었다. 그러나 경쟁사도 같이 늘렸고, 그리하여 두 회사 모두 같은 자리에 서기 위해 값을 치렀다.',
    chunks: [
      { en: 'When the drug company added sales representatives, prescriptions rose,', ko: '제약사가 영업 인력을 늘리자 처방이 늘었다,' },
      { en: 'but the rival added them too,', ko: '그러나 경쟁사도 함께 늘렸다,' },
      { en: 'so both firms paid', ko: '그리하여 두 회사 모두 값을 치렀다' },
      { en: 'to stand where they had stood.', ko: '서 있던 자리에 그대로 서기 위해.' },
    ],
  },
  {
    topic: '미끼 상품',
    korean_full: '슈퍼마켓이 우유를 원가 아래로 팔았을 때 잃은 것은 우유에서였고 번 것은 그것을 사러 온 사람이 함께 담은 것에서였다. 우유만 사 간 손님은 값을 받지 않았다.',
    chunks: [
      { en: 'When the supermarket sold milk below cost,', ko: '슈퍼마켓이 우유를 원가 아래로 팔았을 때,' },
      { en: 'what it lost was on the milk', ko: '잃은 것은 우유에서였고' },
      { en: 'and what it earned was in the basket beside it,', ko: '번 것은 그 옆 장바구니에서였다,' },
      { en: 'so whoever bought only milk was never charged.', ko: '그리하여 우유만 산 사람은 값을 치르지 않았다.' },
    ],
  },
  {
    topic: '반품되는 책',
    korean_full: '서점이 팔리지 않은 책을 돌려보낼 수 있었기 때문에 출판사가 인쇄 부수의 위험을 졌고, 그리하여 무엇을 낼지 정한 것은 읽는 사람이 아니라 창고였다.',
    chunks: [
      { en: 'Because a bookshop could return what it had not sold,', ko: '서점이 팔지 못한 것을 돌려보낼 수 있었기 때문에,' },
      { en: 'the publisher carried the risk of the print run,', ko: '출판사가 인쇄 부수의 위험을 졌다,' },
      { en: 'and what decided which books appeared', ko: '그리고 어떤 책이 나올지 정한 것은' },
      { en: 'was the warehouse rather than the reader.', ko: '독자가 아니라 창고였다.' },
    ],
  },
  {
    topic: '개봉 순서',
    korean_full: '극장 개봉과 가정 판매 사이의 간격은 관객을 위한 것이 아니라 극장주를 위한 것이었고, 그 간격이 좁아졌을 때 사라진 것은 편의가 아니라 협상력이었다.',
    chunks: [
      { en: 'The gap between the cinema release and the home sale', ko: '극장 개봉과 가정 판매 사이의 간격은' },
      { en: 'existed for the exhibitor rather than the audience,', ko: '관객이 아니라 극장주를 위해 있었다,' },
      { en: 'and when it narrowed what disappeared', ko: '그리고 그것이 좁아졌을 때 사라진 것은' },
      { en: 'was not convenience but bargaining power.', ko: '편의가 아니라 협상력이었다.' },
    ],
  },
  {
    topic: '스트리밍 인세',
    korean_full: '재생당 인세는 곡을 만드는 비용과 아무 관계가 없었다. 그리하여 짧고 자주 듣는 곡이 유리해졌고, 길게 쓰는 일은 취미가 되었다.',
    chunks: [
      { en: 'A royalty paid per play bore no relation to what a song cost to make,', ko: '재생당 인세는 곡을 만드는 비용과 무관했다,' },
      { en: 'so short and often-heard music was favoured,', ko: '그리하여 짧고 자주 듣는 음악이 유리해졌다,' },
      { en: 'and writing at length', ko: '그리고 길게 쓰는 일은' },
      { en: 'became a hobby.', ko: '취미가 되었다.' },
    ],
  },
  {
    topic: '종자와 비료',
    korean_full: '종자와 비료를 묶어 판 회사는 수확량을 올렸다. 그러나 농부가 다음 해의 종자를 스스로 남길 수 없게 되면서, 그 수확량의 값은 해마다 다시 청구되었다.',
    chunks: [
      { en: 'The company that sold seed and fertiliser together raised yields,', ko: '종자와 비료를 묶어 판 회사는 수확량을 올렸다,' },
      { en: 'but once the farmer could not keep his own seed for next year,', ko: '그러나 농부가 다음 해 종자를 남길 수 없게 되자,' },
      { en: 'the price of that yield', ko: '그 수확량의 값은' },
      { en: 'was billed again every season.', ko: '해마다 다시 청구되었다.' },
    ],
  },
  {
    topic: '어획 할당',
    korean_full: '어획 할당을 배마다 나누자 어부들은 더 적게 잡고 더 많이 벌었다. 그러나 할당은 팔 수 있었고, 십 년 뒤 그것을 가진 이들은 배를 타지 않았다.',
    chunks: [
      { en: 'Dividing the catch quota among boats made fishermen take less and earn more,', ko: '어획 할당을 배마다 나누자 더 적게 잡고 더 벌었다,' },
      { en: 'but the quota could be sold,', ko: '그러나 할당은 팔 수 있었다,' },
      { en: 'and a decade later those who held it', ko: '그리고 십 년 뒤 그것을 쥔 이들은' },
      { en: 'did not go to sea.', ko: '바다에 나가지 않았다.' },
    ],
  },
  {
    topic: '벌목 주기',
    korean_full: '이자율이 오르자 벌목 회사는 나무를 더 일찍 베었다. 나무가 덜 자라서가 아니라 기다리는 값이 올랐기 때문이고, 숲의 나이는 금리가 정했다.',
    chunks: [
      { en: 'When interest rates rose the timber company cut its trees earlier,', ko: '이자율이 오르자 벌목 회사는 나무를 더 일찍 베었다,' },
      { en: 'not because the trees grew less', ko: '나무가 덜 자라서가 아니라' },
      { en: 'but because waiting had grown dearer,', ko: '기다리는 값이 올랐기 때문이다,' },
      { en: 'and the age of the forest was set by the rate.', ko: '그리고 숲의 나이는 금리가 정했다.' },
    ],
  },
  {
    topic: '광산의 기다림',
    korean_full: '광산 회사가 개발을 미룬 것은 광맥이 나빠서가 아니라 값이 오를 수 있었기 때문이고, 그리하여 묻어 둔 광석의 가치 대부분은 캐지 않는 데 있었다.',
    chunks: [
      { en: 'The mining company deferred development not because the seam was poor', ko: '광산 회사가 개발을 미룬 것은 광맥이 나빠서가 아니라' },
      { en: 'but because the price might rise,', ko: '값이 오를 수 있었기 때문이다,' },
      { en: 'so most of the value in buried ore', ko: '그리하여 묻힌 광석의 가치 대부분은' },
      { en: 'lay in not digging it.', ko: '캐지 않는 데 있었다.' },
    ],
  },
  {
    topic: '연료 헤지의 비대칭',
    korean_full: '연료를 헤지한 항공사는 값이 떨어진 해에 경쟁사보다 비싸게 날았다. 그리하여 헤지가 옳았던 해에는 아무도 칭찬하지 않았고, 틀린 해에는 모두가 기억했다.',
    chunks: [
      { en: 'The airline that hedged fuel flew dearer than its rivals in the year prices fell,', ko: '연료를 헤지한 항공사는 값이 떨어진 해에 더 비싸게 날았다,' },
      { en: 'so nobody praised the hedge in the years it was right', ko: '그리하여 옳았던 해에는 아무도 칭찬하지 않았다' },
      { en: 'and everyone remembered', ko: '그리고 모두가 기억했다' },
      { en: 'the year it was wrong.', ko: '틀린 해를.' },
    ],
  },
  {
    topic: '고정 환율',
    korean_full: '고정 환율 아래의 수출업자들은 환위험을 잊었다. 그리하여 고정이 풀린 날 그들이 잃은 것은 환율이 아니라 헤지하는 법을 아는 세대였다.',
    chunks: [
      { en: 'Exporters under a pegged currency forgot exchange risk,', ko: '고정 환율 아래의 수출업자들은 환위험을 잊었다,' },
      { en: 'so on the day the peg broke', ko: '그리하여 고정이 풀린 날' },
      { en: 'what they had lost was not the rate', ko: '그들이 잃은 것은 환율이 아니라' },
      { en: 'but a generation who knew how to hedge.', ko: '헤지할 줄 아는 세대였다.' },
    ],
  },
  {
    topic: '수출 금융',
    korean_full: '수출 금융 기관이 구매자에게 싼 돈을 빌려주자 그 나라 제조사가 이겼다. 그러나 그 승리는 제품이 아니라 금리였고, 금리는 언제든 복제될 수 있었다.',
    chunks: [
      { en: 'When the export agency lent the buyer cheap money,', ko: '수출 금융 기관이 구매자에게 싼 돈을 빌려주자,' },
      { en: 'the manufacturer of that country won,', ko: '그 나라 제조사가 이겼다,' },
      { en: 'but the victory was the rate rather than the product,', ko: '그러나 그 승리는 제품이 아니라 금리였다,' },
      { en: 'and a rate can always be copied.', ko: '그리고 금리는 언제든 복제된다.' },
    ],
  },
  {
    topic: '항공 화물의 규격',
    korean_full: '항공 화물은 컨테이너를 따라가지 못했다. 동체가 둥글어 사각 상자가 맞지 않았기 때문이고, 그 기하학이 육십 년 동안 두 산업의 원가를 갈라놓았다.',
    chunks: [
      { en: 'Air freight never followed the container,', ko: '항공 화물은 컨테이너를 따라가지 못했다,' },
      { en: 'because a round fuselage will not take a square box,', ko: '동체가 둥글어 사각 상자가 맞지 않기 때문이다,' },
      { en: 'and that geometry separated the costs of two industries', ko: '그리고 그 기하학이 두 산업의 원가를 갈라놓았다' },
      { en: 'for sixty years.', ko: '육십 년 동안.' },
    ],
  },
  {
    topic: '저온 유통',
    korean_full: '백신이 섭씨 이 도를 넘기면 버려야 했기 때문에, 그 제품의 진짜 원가는 약이 아니라 그것이 지나온 냉장고 사슬에 있었다.',
    chunks: [
      { en: 'Because a vaccine had to be discarded if it passed two degrees,', ko: '백신이 섭씨 이 도를 넘기면 버려야 했기 때문에,' },
      { en: 'the real cost of that product', ko: '그 제품의 진짜 원가는' },
      { en: 'lay not in the medicine', ko: '약에 있지 않고' },
      { en: 'but in the chain of refrigerators it had crossed.', ko: '그것이 지나온 냉장고 사슬에 있었다.' },
    ],
  },
  {
    topic: '배달 수수료',
    korean_full: '배달 플랫폼이 매출의 삼십 퍼센트를 가져가자 식당은 배달용 값을 따로 올렸고, 그리하여 그 편의의 값을 치른 것은 앱을 쓰지 않는 손님까지였다.',
    chunks: [
      { en: 'When the delivery platform took thirty percent of the bill,', ko: '배달 플랫폼이 매출의 삼십 퍼센트를 가져가자,' },
      { en: 'restaurants raised their delivery prices separately,', ko: '식당은 배달 값을 따로 올렸다,' },
      { en: 'so the convenience was paid for', ko: '그리하여 그 편의의 값은 치러졌다' },
      { en: 'even by those who never opened the app.', ko: '앱을 열지 않은 이들에게까지.' },
    ],
  },
  {
    topic: '데이터센터의 전력',
    korean_full: '데이터센터가 어디 설 것인지는 대역폭이 아니라 전력 계약이 정했고, 그리하여 세계에서 가장 빠른 연결은 가장 싼 발전소를 따라 놓였다.',
    chunks: [
      { en: 'Where a data centre stood was decided by the power contract', ko: '데이터센터가 어디 서는지는 전력 계약이 정했다' },
      { en: 'rather than the bandwidth,', ko: '대역폭이 아니라,' },
      { en: 'so the fastest connections in the world', ko: '그리하여 세계에서 가장 빠른 연결은' },
      { en: 'were laid to follow the cheapest generators.', ko: '가장 싼 발전소를 따라 놓였다.' },
    ],
  },
  {
    topic: '수출 통제',
    korean_full: '수출 통제는 장비를 막았으나 지식을 막지 못했다. 그리하여 금지된 쪽은 오 년을 잃었고, 금지한 쪽은 자기 장비를 살 가장 큰 고객을 잃었다.',
    chunks: [
      { en: 'Export controls stopped the equipment but not the knowledge,', ko: '수출 통제는 장비를 막았으나 지식은 막지 못했다,' },
      { en: 'so the side that was barred lost five years', ko: '그리하여 금지된 쪽은 오 년을 잃었다' },
      { en: 'while the side that barred it', ko: '금지한 쪽은' },
      { en: 'lost the largest buyer of its machines.', ko: '자기 기계의 가장 큰 구매자를 잃었다.' },
    ],
  },
  {
    topic: '재활용의 셈',
    korean_full: '재활용이 수지가 맞은 것은 누군가 그 재료를 사 갔기 때문이었다. 그 구매자가 문을 닫자 같은 수거 트럭이 같은 길을 돌았지만 도착지가 매립장으로 바뀌었다.',
    chunks: [
      { en: 'Recycling paid because somebody bought the material,', ko: '재활용이 수지가 맞은 것은 누군가 그 재료를 샀기 때문이다,' },
      { en: 'and when that buyer closed', ko: '그 구매자가 문을 닫자' },
      { en: 'the same trucks ran the same routes', ko: '같은 트럭이 같은 길을 돌았다' },
      { en: 'to a different destination.', ko: '다른 도착지로.' },
    ],
  },
  {
    topic: '보증금 제도',
    korean_full: '병 보증금은 반환율을 올렸다. 그러나 돌려받지 않은 보증금이 제도를 운영하는 돈이었고, 그리하여 완전한 성공은 그 제도를 파산시켰을 것이다.',
    chunks: [
      { en: 'The bottle deposit raised the return rate,', ko: '병 보증금은 반환율을 올렸다,' },
      { en: 'yet the deposits never reclaimed', ko: '그러나 돌려받지 않은 보증금이' },
      { en: 'were the money that ran the scheme,', ko: '그 제도를 운영하는 돈이었다,' },
      { en: 'so complete success would have bankrupted it.', ko: '그리하여 완전한 성공은 그것을 파산시켰을 것이다.' },
    ],
  },
  {
    topic: '건축 기준',
    korean_full: '새 건물에만 적용된 단열 기준은 오래된 건물을 그대로 두었고, 그리하여 규정이 노린 에너지의 대부분은 규정이 닿지 않는 곳에서 계속 쓰였다.',
    chunks: [
      { en: 'An insulation standard that applied only to new buildings', ko: '새 건물에만 적용된 단열 기준은' },
      { en: 'left the old ones alone,', ko: '오래된 건물을 그대로 두었다,' },
      { en: 'so most of the energy the rule aimed at', ko: '그리하여 규정이 노린 에너지의 대부분은' },
      { en: 'went on being used where it did not reach.', ko: '그것이 닿지 않는 곳에서 계속 쓰였다.' },
    ],
  },
  {
    topic: '좁아진 의료망',
    korean_full: '보험사가 병원 목록을 좁히자 보험료는 내려갔다. 그러나 목록 밖에서 치료받은 환자가 전액을 물게 되었고, 그 절감은 평균에는 나타났으나 그들에게는 아니었다.',
    chunks: [
      { en: 'When the insurer narrowed its list of hospitals, premiums fell,', ko: '보험사가 병원 목록을 좁히자 보험료는 내려갔다,' },
      { en: 'but a patient treated outside the list paid in full,', ko: '그러나 목록 밖에서 치료받은 환자는 전액을 물었다,' },
      { en: 'and the saving appeared in the average', ko: '그리고 그 절감은 평균에는 나타났다' },
      { en: 'rather than to him.', ko: '그에게는 아니라.' },
    ],
  },
  {
    topic: '수가 코드',
    korean_full: '새 의료기기가 자기 수가 코드를 받기까지 삼 년이 걸렸다. 그리하여 그 기기가 좋은지 아닌지가 아니라 언제 코드가 나오는지가 어느 회사가 살아남을지 정했다.',
    chunks: [
      { en: 'A new medical device waited three years for a code of its own,', ko: '새 의료기기는 자기 코드를 삼 년 기다렸다,' },
      { en: 'so what decided which company survived', ko: '그리하여 어느 회사가 살아남을지 정한 것은' },
      { en: 'was not whether the device was good', ko: '그 기기가 좋은지가 아니라' },
      { en: 'but when the code arrived.', ko: '언제 코드가 나오는지였다.' },
    ],
  },
  {
    topic: '기부금과 등록금',
    korean_full: '기금이 큰 대학일수록 등록금을 더 올렸다. 기금이 지원을 감당했기 때문이고, 그리하여 정가는 낼 수 있는 소수가 아니라 아무도 내지 않는 숫자가 되었다.',
    chunks: [
      { en: 'Universities with the largest endowments raised tuition the most,', ko: '기금이 큰 대학일수록 등록금을 더 올렸다,' },
      { en: 'because the endowment paid the aid,', ko: '기금이 지원을 감당했기 때문이다,' },
      { en: 'so the published price became a number', ko: '그리하여 정가는 어떤 숫자가 되었다' },
      { en: 'nobody actually paid.', ko: '아무도 실제로 내지 않는.' },
    ],
  },
  {
    topic: '교과서 개정',
    korean_full: '해마다 새 판을 낸 출판사는 중고 시장을 없앴다. 그러나 학생들이 대여로 옮겨 가면서, 그 개정이 지키려던 매출은 다른 문으로 나갔다.',
    chunks: [
      { en: 'The publisher that issued a new edition each year killed the second-hand market,', ko: '해마다 새 판을 낸 출판사는 중고 시장을 없앴다,' },
      { en: 'but as students moved to renting,', ko: '그러나 학생들이 대여로 옮겨 가면서,' },
      { en: 'the revenue those editions defended', ko: '그 개정이 지킨 매출은' },
      { en: 'left by another door.', ko: '다른 문으로 나갔다.' },
    ],
  },
  {
    topic: '공정 노동 분류',
    korean_full: '배달원을 개인사업자로 분류하자 회사의 인건비가 사라졌다. 그러나 차량과 보험과 노는 시간의 값은 세상에서 사라진 것이 아니라 장부에서 사라졌을 뿐이다.',
    chunks: [
      { en: 'Classifying couriers as contractors removed the labour cost from the company,', ko: '배달원을 개인사업자로 분류하자 인건비가 회사에서 사라졌다,' },
      { en: 'though the cost of vehicles, insurance and idle hours', ko: '그러나 차량과 보험과 노는 시간의 값은' },
      { en: 'did not disappear from the world', ko: '세상에서 사라진 것이 아니라' },
      { en: 'so much as from the accounts.', ko: '장부에서 사라졌을 뿐이다.' },
    ],
  },
  {
    topic: '다크 스토어',
    korean_full: '주문 십 분 배달을 약속한 회사는 도심에 창고를 두어야 했다. 그 임대료는 상점보다 비쌌고, 그리하여 그들이 판 것은 물건이 아니라 임대료였다.',
    chunks: [
      { en: 'A firm promising delivery in ten minutes had to hold stock in the city centre,', ko: '십 분 배달을 약속한 회사는 도심에 재고를 둬야 했다,' },
      { en: 'where rent cost more than a shop,', ko: '그곳 임대료는 상점보다 비쌌다,' },
      { en: 'so what it actually sold', ko: '그리하여 그들이 실제로 판 것은' },
      { en: 'was rent rather than groceries.', ko: '식료품이 아니라 임대료였다.' },
    ],
  },
  {
    topic: '노선 보조금',
    korean_full: '적자 노선에 보조금을 준 정부는 그 노선을 지켰다. 그러나 보조금이 노선당 지급되었기 때문에, 운영사는 한 노선을 둘로 나누어 두 번 받았다.',
    chunks: [
      { en: 'The government that subsidised a loss-making route preserved it,', ko: '적자 노선에 보조금을 준 정부는 그것을 지켰다,' },
      { en: 'but because the subsidy was paid per route,', ko: '그러나 보조금이 노선당 지급되었기 때문에,' },
      { en: 'the operator split one route into two', ko: '운영사는 한 노선을 둘로 나누었다' },
      { en: 'and collected twice.', ko: '그리고 두 번 받았다.' },
    ],
  },
  {
    topic: '품질 인증',
    korean_full: '인증 비용이 고정되어 있었기 때문에, 그것은 큰 생산자에게는 반올림 오차였고 작은 생산자에게는 진입 장벽이었으며, 그 규정을 요청한 쪽은 큰 생산자였다.',
    chunks: [
      { en: 'Because the cost of certification was fixed,', ko: '인증 비용이 고정되어 있었기 때문에,' },
      { en: 'it was a rounding error for the large producer', ko: '큰 생산자에게는 반올림 오차였다' },
      { en: 'and a barrier for the small one,', ko: '작은 생산자에게는 장벽이었고,' },
      { en: 'and it was the large one who asked for the rule.', ko: '그 규정을 요청한 쪽은 큰 생산자였다.' },
    ],
  },
]

/* ── 검증 ──────────────────────────────────────────────────── */

const MIN_WORDS = 20
const MAX_WORDS = 34
const BANNED = /(depends on|is determined by|leads to|plays a (vital|key) role|is (important|crucial|essential))/i
// once·when·before·after 도 종속절을 연다. 처음 목록에서 빠뜨려 멀쩡한 문장이 걸렸다.
const SUBORDINATOR = /\b(although|even though|because|since|whereas|while|insofar as|unless|so that|which|whose|who|that|until|though|once|when|before|after|if|whether|what|where|how)\b/i

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
