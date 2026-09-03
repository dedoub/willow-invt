import assert from 'node:assert/strict'
import test from 'node:test'
import { maskResidentNumbers, splitRegulationSections, parseArticles, replaceArticleBody } from './articles-parser.mjs'

const SAMPLE = `정     관
윌로우인베스트먼트 주식회사
제 1 장     총    칙
제1조(상호) 이 회사는 "윌로우인베스트먼트 주식회사" 라 한다.
제2조(목적) 회사는 다음의 사업을 영위함을 목적으로 한다.
1. 전문, 과학 및 기술서비스업
1. 경영컨설팅업
제3조(본점의 소재지) ① 회사의 본점은 서울특별시내에 둔다.
  ② 회사는 이사회의 결의로 지점을 둘 수 있다.
부   칙
이 정관은 2021년 월 일부터 시행한다.
발기인대표 김 동 욱 (900101-1234567) - 80주
별첨 1
임원퇴직금지급규정
제 1 조 [목적]
 본 규정은 당사의 임원퇴직금 지급에 관한 사항을 정함을 목적으로 한다.
제 2 조 [적용범위]
 ① 본 규정은 대표이사, 이사, 감사에 대하여 적용한다.
별첨 2
임원상여금지급규정
제 1 조 (목적)
 본 규정은 상여금에 관한 사항을 정한다.
`

test('maskResidentNumbers hides the 7-digit tail', () => {
  assert.equal(maskResidentNumbers('김동욱 (900101-1234567) 80주'), '김동욱 (XXXXXX-*******) 80주')
  assert.equal(maskResidentNumbers('사업자 205-88-01897'), '사업자 205-88-01897')
})

test('splitRegulationSections separates body from numbered attachments', () => {
  const { body, attachments } = splitRegulationSections(SAMPLE)
  assert.match(body, /^정\s+관/)
  assert.match(body, /부\s+칙/)
  assert.doesNotMatch(body, /별첨/)
  assert.equal(attachments.length, 2)
  assert.deepEqual(attachments.map(a => [a.index, a.title]), [[1, '임원퇴직금지급규정'], [2, '임원상여금지급규정']])
  assert.match(attachments[0].text, /제 1 조 \[목적\]/)
  assert.doesNotMatch(attachments[0].text, /임원상여금/)
})

test('parseArticles handles both 제1조(제목) and 제 1 조 [제목] shapes', () => {
  const body = parseArticles(splitRegulationSections(SAMPLE).body)
  assert.deepEqual(body.map(a => [a.no, a.title]), [['제1조', '상호'], ['제2조', '목적'], ['제3조', '본점의 소재지']])
  assert.match(body[1].text, /1\. 경영컨설팅업/)
  assert.doesNotMatch(body[1].text, /제3조/)
  assert.match(body[2].text, /② 회사는 이사회의 결의로/)

  const att = parseArticles(splitRegulationSections(SAMPLE).attachments[0].text)
  assert.deepEqual(att.map(a => [a.no, a.title]), [['제1조', '목적'], ['제2조', '적용범위']])
})

test('parseArticles stops the last article before 부칙', () => {
  const body = parseArticles(splitRegulationSections(SAMPLE).body)
  assert.doesNotMatch(body[2].text, /부\s+칙/)
})

test('parseArticles labels addendum clauses so they do not collide with main articles', () => {
  const text = `제 1 조 [목적]\n 본 규정은 목적을 정한다.\n제 2 조 [적용범위]\n 적용한다.\n부 칙\n제 1 조 [시행일] 본 규정은 2021년 월 일부터 시행한다.\n제 2 조 [경과규정] 이전 임원도 적용한다.\n`
  const out = parseArticles(text)
  assert.deepEqual(out.map(a => a.no), ['제1조', '제2조', '부칙 제1조', '부칙 제2조'])
  assert.match(out[2].text, /2021년/)
})

test('replaceArticleBody swaps one article and keeps the rest intact', () => {
  const { body } = splitRegulationSections(SAMPLE)
  const out = replaceArticleBody(body, '제2조', '회사는 다음의 사업을 영위함을 목적으로 한다.\n1. 정보통신업')
  assert.match(out, /제2조\(목적\) 회사는 다음의 사업을 영위함을 목적으로 한다.\n1\. 정보통신업\n제3조/)
  assert.doesNotMatch(out, /경영컨설팅업/)
  assert.match(out, /제1조\(상호\)/)
  assert.throws(() => replaceArticleBody(body, '제99조', 'x'), /article not found/)
})
