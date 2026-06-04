const XLSX = require('xlsx');
const path = '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/tmp/doc_1774577679278.xlsx';
const wb = XLSX.readFile(path);
const ws = wb.Sheets[wb.SheetNames[0]];

function set(addr, value) {
  ws[addr] = { v: value, t: typeof value === 'number' ? 'n' : 's' };
}

// =============================================
// 영업비 구조: 영업이익(영업비 차감 전)의 50%를 (주)비블로에 영업비로 지급
// 계산: preOI = 매출 - 기존판관비, 영업비 = preOI * 50%, 최종 OI = preOI * 50%
// =============================================

const revenue = [365, 850, 1050, 1250];
const baseSga = [384, 500, 570, 650]; // 기존 판관비 (영업비 제외)

// Pre-영업비 영업이익
const preOI = revenue.map((r, i) => r - baseSga[i]); // [-19, 350, 480, 600]

// 영업비 = max(0, preOI * 50%)  — 적자일 때는 영업비 없음
const salesFee = preOI.map(oi => Math.max(0, Math.round(oi * 0.5))); // [0, 175, 240, 300]

// 최종 판관비 = 기존 + 영업비
const totalSga = baseSga.map((s, i) => s + salesFee[i]); // [384, 675, 810, 950]

// 최종 영업이익
const operatingIncome = revenue.map((r, i) => r - totalSga[i]); // [-19, 175, 240, 300]

// 판관비 세부 (기존 구조 유지, 기타에 영업비 합산)
const sgaDepr = [5, 5, 5, 5];
const sgaAmort = [10, 10, 10, 10];
const sgaRetire = [15, 20, 25, 30];
const sgaBadDebt = [5, 5, 5, 5];
// sgaOther = totalSga - (Depr + Amort + Retire + BadDebt)
const sgaOther = totalSga.map((t, i) => t - sgaDepr[i] - sgaAmort[i] - sgaRetire[i] - sgaBadDebt[i]);
// [349, 635, 765, 900]

// 영업외
const otherIncome = [86, 50, 30, 20];
const interestIncome = [1, 2, 3, 5];
const otherNonOpInc = [85, 48, 27, 15];
const otherExpense = [56, 45, 35, 25];
const interestExp = [54, 43, 33, 23];
const otherNonOpExp = [2, 2, 2, 2];

// EBT
const ebt = operatingIncome.map((oi, i) => oi + otherIncome[i] - otherExpense[i]);
// [11, 180, 235, 295]

// 법인세 (이월결손금 320, 중소기업 세율 200이하 10%, 초과 20%)
let carryForward = 320;
const tax = [];
for (let i = 0; i < 4; i++) {
  if (i === 0) { tax.push(0); continue; } // 기준년도 실적
  const taxableBeforeDeduct = ebt[i];
  const deduction = Math.min(carryForward, Math.max(0, taxableBeforeDeduct));
  const taxableIncome = Math.max(0, taxableBeforeDeduct - deduction);
  carryForward -= deduction;
  let t = 0;
  if (taxableIncome > 200) {
    t = 200 * 0.1 + (taxableIncome - 200) * 0.2;
  } else {
    t = taxableIncome * 0.1;
  }
  tax.push(Math.round(t));
}
// Expected: [0, 0, 10, 30]

const netIncome = ebt.map((e, i) => e - tax[i]);
const contOpsIncome = [...netIncome];

console.log('=== 손익계산서 핵심 ===');
console.log('매출:', revenue);
console.log('기존판관비:', baseSga);
console.log('영업비(비블로):', salesFee);
console.log('판관비 합계:', totalSga);
console.log('영업이익:', operatingIncome);
console.log('EBT:', ebt);
console.log('법인세:', tax);
console.log('당기순이익:', netIncome);

// =============================================
// (1) 추정재무제표 작성근거
// =============================================
set('B5', '매출성장율 133% (365→850). 이맥스 추가계약 90, 평택대 280, 독립잇다 50, 성균관대 45, 서울시체육회 21, 대학 파이프라인(차의과대/전주대/건국대) 150, 쇼핑몰 추가 150, 기존 프로젝트 64. 내수 100%.');
set('C5', '매출성장율 24% (850→1,050). 기존 클라이언트 반복 수주(이맥스, 대학) + 신규 대학·기업 파이프라인 확대. AI 활용 생산성으로 동시 수행 프로젝트 수 증가.');
set('D5', '매출성장율 19% (1,050→1,250). 안정적 성장. 대학/기업 레퍼런스 축적으로 수주 기반 확대. 쇼핑몰·온톨로지 등 반복 매출 비중 증가.');

set('B8', 'IT서비스업 특성상 매출원가 없음. 인건비 등 전액 판관비로 처리.');
set('C8', '동일 (매출원가 없음)');
set('D8', '동일 (매출원가 없음)');

set('B11', '판관비율 79% (675/850). 기존 판관비 500(인건비·임차료·보험 등) + 영업비 175(영업이익의 50%, (주)비블로 지급). AI 활용으로 외주비 최소화. 감가상각 5, 무형자산상각 10, 퇴직급여 20, 대손상각 5.');
set('C11', '판관비율 77% (810/1,050). 기존 판관비 570 + 영업비 240. 고정비 비중 하락으로 기존 판관비율 개선. 매출 증가분이 영업비를 통해 비례 배분.');
set('D11', '판관비율 76% (950/1,250). 기존 판관비 650 + 영업비 300. 영업레버리지 효과로 기존 판관비율 지속 개선. 영업비는 영업이익 연동.');

set('B14', '영업외수익 50 (정부보조금 축소 48 + 이자수익 2). 영업외비용 45 (이자비용 43 + 기타 2). 차입금 일부 상환으로 이자비용 감소.');
set('C14', '영업외수익 30 (보조금 27 + 이자 3). 영업외비용 35 (이자 33 + 기타 2). 계속적 차입금 상환 반영.');
set('D14', '영업외수익 20 (보조금 15 + 이자 5). 영업외비용 25 (이자 23 + 기타 2). 차입금 대폭 축소.');

set('B17', '대규모 설비투자 계획 없음. 기존 유형자산 감가상각 진행. 소프트웨어 개발비 자본화 유지. 영업이익 창출분은 차입금 상환 및 운전자본 확보에 우선 활용.');
set('C17', '동일. 고정자산 최소 수준 유지. 잉여 현금은 차입금 상환에 우선 배분.');
set('D17', '동일. 차입금 상환 완료 후 잉여 현금 축적.');

set('B20', '연간 100백만원 상환 계획. SBI저축은행 480 + 중소벤처진흥공단 100 = 기존 580. 영업현금흐름으로 원금 상환 가속.');
set('C20', '연간 120백만원 상환. 영업이익 증가로 상환 여력 확대.');
set('D20', '연간 120백만원 상환. 잔여 차입금 280 수준으로 축소 목표.');

set('B23', '유상증자 및 배당 계획 없음. 이익잉여금 축적을 통한 자본 확충.');
set('C23', '동일. 이익잉여금 축적 지속.');
set('D23', '동일. 자본잠식 완전 해소 목표.');

set('B25', 'AI 기반 소프트웨어 개발 서비스업으로 사업 구조 안정화. 대학·기업 온톨로지/챗봇/쇼핑몰 개발 핵심 사업. MCP 기반 AI 서비스 플랫폼화 추진. 영업비는 영업이익의 50%를 (주)비블로에 영업수수료로 지급하는 구조.');
set('C25', '대학/공공기관 레퍼런스 기반 영업 확대. 온톨로지·MCP 기술 차별화.');
set('D25', '반복 매출 기반 확보. 기술 플랫폼 고도화.');

// =============================================
// (2) 추정대차대조표
// =============================================
// Net income changes → cash/RE changes

// Cash: 기존 대비 net income 차이만큼 조정
const origNetIncome = [10, 352, 405, 502];
const niDiff = netIncome.map((ni, i) => ni - origNetIncome[i]); // [0, -172, -180, -246]
let cumDiff = 0;
const cashAdj = niDiff.map(d => { cumDiff += d; return cumDiff; }); // [0, -172, -352, -598]

const bs = {
  currentAssets:     [185, 524 + cashAdj[1], 830 + cashAdj[2], 1235 + cashAdj[3]],
  cash:              [  7, 364 + cashAdj[1], 640 + cashAdj[2], 1010 + cashAdj[3]],
  receivables:       [154, 140, 170, 205],
  otherCurrent:      [ 24,  20,  20,  20],
  inventory:         [  0,   0,   0,   0],
  nonCurrentAssets:  [742, 705, 670, 635],
  investAssets:      [300, 290, 280, 270],
  longTermFinancial: [ 50,  50,  50,  50],
  otherInvest:       [250, 240, 230, 220],
  tangibleAssets:    [ 30,  25,  20,  15],
  depreciable:       [ 30,  25,  20,  15],
  land:              [  0,   0,   0,   0],
  construction:      [  0,   0,   0,   0],
  intangible:        [200, 190, 180, 170],
  otherNonCurrent:   [212, 200, 190, 180],
  totalAssets:       [],  // calculated
  currentLiab:       [120, 190, 176, 164],
  accountsPayable:   [ 10,  15,  18,  22],
  shortTermDebt:     [ 80,  60,  40,  20],
  currentLongTerm:   [ 20, 100, 100, 100],
  otherCurrentLiab:  [ 10,  15,  18,  22],
  nonCurrentLiab:    [680, 560, 440, 320],
  longTermDebt:      [580, 480, 380, 280],
  bonds:             [  0,   0,   0,   0],
  provisions:        [  0,   0,   0,   0],
  otherNonCurrentLiab:[100,  80,  60,  40],
  totalLiab:         [800, 750, 616, 484],
  capital:           [200, 200, 200, 200],
  capitalSurplus:    [  0,   0,   0,   0],
  oci:               [  0,   0,   0,   0],
  retainedEarnings:  [],  // calculated
  totalEquity:       [],  // calculated
  totalLiabEquity:   [],  // calculated
};

// Total L+E first, then back-solve cash to balance
bs.totalEquity_tmp = [];
let re_tmp = -73;
bs.retainedEarnings = [re_tmp];
for (let i = 1; i < 4; i++) {
  re_tmp += netIncome[i];
  bs.retainedEarnings.push(re_tmp);
}

// Total assets = Total L + E (balance sheet must balance)
const totalLiabEquity = bs.totalLiab.map((l, i) => l + bs.capital[i] + bs.retainedEarnings[i]);
bs.totalAssets = [...totalLiabEquity];

// Back-solve cash: cash = totalAssets - receivables - otherCurrent - inventory - nonCurrentAssets
bs.cash = bs.totalAssets.map((ta, i) => ta - bs.receivables[i] - bs.otherCurrent[i] - bs.inventory[i] - bs.nonCurrentAssets[i]);
bs.currentAssets = bs.cash.map((c, i) => c + bs.receivables[i] + bs.otherCurrent[i] + bs.inventory[i]);

bs.totalEquity = bs.capital.map((c, i) => c + bs.retainedEarnings[i]);
bs.totalLiabEquity = [...totalLiabEquity];

console.log('\n=== 대차대조표 핵심 ===');
console.log('현금:', bs.cash);
console.log('유동자산:', bs.currentAssets);
console.log('자산총계:', bs.totalAssets);
console.log('이익잉여금:', bs.retainedEarnings);
console.log('자본총계:', bs.totalEquity);
console.log('부채+자본:', bs.totalLiabEquity);
console.log('BS Balance?', bs.totalAssets.every((ta, i) => ta === bs.totalLiabEquity[i]));

// 부채비율
const debtRatio = bs.totalLiab.map((l, i) => bs.totalEquity[i] > 0 ? Math.round(l / bs.totalEquity[i] * 100) : 'N/A');
console.log('부채비율:', debtRatio);

// Map to cells
const assetRows = [
  [30, bs.currentAssets],
  [31, bs.cash],
  [32, bs.receivables],
  [33, bs.otherCurrent],
  [34, bs.inventory],
  [35, bs.nonCurrentAssets],
  [36, bs.investAssets],
  [37, bs.longTermFinancial],
  [38, bs.otherInvest],
  [39, bs.tangibleAssets],
  [40, bs.depreciable],
  [41, bs.land],
  [42, bs.construction],
  [43, bs.intangible],
  [45, bs.otherNonCurrent],
  [46, bs.totalAssets],
];

const liabRows = [
  [30, bs.currentLiab],
  [31, bs.accountsPayable],
  [32, bs.shortTermDebt],
  [33, bs.currentLongTerm],
  [34, bs.otherCurrentLiab],
  [35, bs.nonCurrentLiab],
  [36, bs.longTermDebt],
  [37, bs.bonds],
  [38, bs.provisions],
  [39, bs.otherNonCurrentLiab],
  [40, bs.totalLiab],
  [41, bs.capital],
  [42, bs.capitalSurplus],
  [43, bs.oci],
  [44, bs.retainedEarnings],
  [45, bs.totalEquity],
  [46, bs.totalLiabEquity],
];

const assetCols = ['B','C','D','E'];
const liabCols = ['G','H','I','J'];

assetRows.forEach(([row, vals]) => {
  vals.forEach((v, i) => set(assetCols[i] + row, v));
});
liabRows.forEach(([row, vals]) => {
  vals.forEach((v, i) => set(liabCols[i] + row, v));
});

// =============================================
// (3) 추정손익계산서
// =============================================
const is_data = {
  revenue:        revenue,
  cogs:           [0, 0, 0, 0],
  material:       [0, 0, 0, 0],
  cogsDepr:       [0, 0, 0, 0],
  cogsOther:      [0, 0, 0, 0],
  cogsRetire:     [0, 0, 0, 0],
  grossProfit:    revenue,
  sga:            totalSga,
  sgaDepr:        sgaDepr,
  sgaAmort:       sgaAmort,
  sgaOther:       sgaOther,
  sgaRetire:      sgaRetire,
  sgaBadDebt:     sgaBadDebt,
  operatingIncome: operatingIncome,
  otherIncome:    otherIncome,
  interestIncome: interestIncome,
  fxGain:         [0, 0, 0, 0],
  fxTransGain:    [0, 0, 0, 0],
  otherNonOpInc:  otherNonOpInc,
  otherExpense:   otherExpense,
  interestExp:    interestExp,
  fxLoss:         [0, 0, 0, 0],
  fxTransLoss:    [0, 0, 0, 0],
  otherNonOpExp:  otherNonOpExp,
  ebt:            ebt,
  tax:            tax,
  contOpsIncome:  contOpsIncome,
  discontOps:     [0, 0, 0, 0],
  netIncome:      netIncome,
};

const isRows = [
  [55, 'revenue'],
  [56, 'cogs'],
  [57, 'material'],
  [58, 'cogsDepr'],
  [59, 'cogsOther'],
  [60, 'cogsRetire'],
  [61, 'grossProfit'],
  [62, 'sga'],
  [63, 'sgaDepr'],
  [64, 'sgaAmort'],
  [65, 'sgaOther'],
  [66, 'sgaRetire'],
  [67, 'sgaBadDebt'],
  [68, 'operatingIncome'],
  [69, 'otherIncome'],
  [70, 'interestIncome'],
  [71, 'fxGain'],
  [72, 'fxTransGain'],
  [73, 'otherNonOpInc'],
  [74, 'otherExpense'],
  [75, 'interestExp'],
  [76, 'fxLoss'],
  [77, 'fxTransLoss'],
  [78, 'otherNonOpExp'],
  [79, 'ebt'],
  [80, 'tax'],
  [81, 'contOpsIncome'],
  [82, 'discontOps'],
  [83, 'netIncome'],
];

const amtCols = ['B','D','F','H'];
const pctCols = ['C','E','G','I'];

isRows.forEach(([row, key]) => {
  const vals = is_data[key];
  vals.forEach((v, i) => {
    set(amtCols[i] + row, v);
    const rev = is_data.revenue[i];
    const pct = rev > 0 ? Math.round((v / rev) * 1000) / 10 : 0;
    set(pctCols[i] + row, pct);
  });
});

set('A79', 'Ⅷ. 법인세비용차감전순이익');

ws['!ref'] = 'A1:J84';

const outPath = '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/tmp/텐소프트웍스_추정재무제표_2026-2028_v3.xlsx';
XLSX.writeFile(wb, outPath);
console.log('\nWritten to:', outPath);
