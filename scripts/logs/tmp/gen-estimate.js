const XLSX = require('xlsx');
const path = '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/tmp/doc_1774577679278.xlsx';
const wb = XLSX.readFile(path);
const ws = wb.Sheets[wb.SheetNames[0]];

function set(addr, value) {
  ws[addr] = { v: value, t: typeof value === 'number' ? 'n' : 's' };
}

// =============================================
// (1) 추정재무제표 작성근거
// =============================================
// [매출액] B5, C5, D5
set('B5', '매출성장율 133% (365→850). 이맥스 추가계약 90, 평택대 280, 독립잇다 50, 성균관대 45, 서울시체육회 21, 대학 파이프라인(차의과대/전주대/건국대) 150, 쇼핑몰 추가 150, 기존 프로젝트 64. 내수 100%.');
set('C5', '매출성장율 24% (850→1,050). 기존 클라이언트 반복 수주(이맥스, 대학) + 신규 대학·기업 파이프라인 확대. AI 활용 생산성으로 동시 수행 프로젝트 수 증가.');
set('D5', '매출성장율 19% (1,050→1,250). 안정적 성장. 대학/기업 레퍼런스 축적으로 수주 기반 확대. 쇼핑몰·온톨로지 등 반복 매출 비중 증가.');

// [매출원가] B8, C8, D8
set('B8', 'IT서비스업 특성상 매출원가 없음. 인건비 등 전액 판관비로 처리.');
set('C8', '동일 (매출원가 없음)');
set('D8', '동일 (매출원가 없음)');

// [판관비] B11, C11, D11
set('B11', '판관비율 59% (500/850). 인력 1~2명 추가 채용, 기본급 소폭 인상. AI 활용으로 외주비 최소화. 감가상각 5, 무형자산상각 10, 퇴직급여 20, 대손상각 5, 기타 460.');
set('C11', '판관비율 54% (570/1,050). 인력 소폭 추가, 급여 인상 반영. 고정비 비중 하락으로 판관비율 개선.');
set('D11', '판관비율 52% (650/1,250). 매출 증가 대비 고정비 증가폭 제한적. 영업레버리지 효과 극대화.');

// [영업외수익/비용] B14, C14, D14
set('B14', '영업외수익 50 (정부보조금 축소 48 + 이자수익 2). 영업외비용 45 (이자비용 43 + 기타 2). 차입금 일부 상환으로 이자비용 감소.');
set('C14', '영업외수익 30 (보조금 27 + 이자 3). 영업외비용 35 (이자 33 + 기타 2). 계속적 차입금 상환 반영.');
set('D14', '영업외수익 20 (보조금 15 + 이자 5). 영업외비용 25 (이자 23 + 기타 2). 차입금 대폭 축소.');

// [자산운용계획] B17, C17, D17
set('B17', '대규모 설비투자 계획 없음. 기존 유형자산 감가상각 진행. 소프트웨어 개발비 자본화 유지. 영업이익 창출분은 차입금 상환 및 운전자본 확보에 우선 활용.');
set('C17', '동일. 고정자산 최소 수준 유지. 잉여 현금은 차입금 상환에 우선 배분.');
set('D17', '동일. 차입금 상환 완료 후 잉여 현금 축적.');

// [차입금] B20, C20, D20
set('B20', '연간 100백만원 상환 계획. SBI저축은행 480 + 중소벤처진흥공단 100 = 기존 580. 영업현금흐름으로 원금 상환 가속.');
set('C20', '연간 120백만원 상환. 영업이익 증가로 상환 여력 확대.');
set('D20', '연간 120백만원 상환. 잔여 차입금 280 수준으로 축소 목표.');

// [자본계획] B23, C23, D23
set('B23', '유상증자 및 배당 계획 없음. 이익잉여금 축적을 통한 자본 확충.');
set('C23', '동일. 이익잉여금 축적 지속.');
set('D23', '동일. 자본잠식 완전 해소 목표.');

// [기타] B25, C25, D25
set('B25', 'AI 기반 소프트웨어 개발 서비스업으로 사업 구조 안정화. 대학·기업 온톨로지/챗봇/쇼핑몰 개발 핵심 사업. MCP 기반 AI 서비스 플랫폼화 추진.');
set('C25', '대학/공공기관 레퍼런스 기반 영업 확대. 온톨로지·MCP 기술 차별화.');
set('D25', '반복 매출 기반 확보. 기술 플랫폼 고도화.');

// =============================================
// (2) 추정대차대조표
// =============================================
// Assets: B=기준, C=1차, D=2차, E=3차
// Liabilities/Equity: G=기준, H=1차, I=2차, J=3차

const bs = {
  // 유동자산
  currentAssets:     [185, 524, 830, 1235],
  cash:              [  7, 364, 640, 1010],
  receivables:       [154, 140, 170,  205],
  otherCurrent:      [ 24,  20,  20,   20],
  inventory:         [  0,   0,   0,    0],
  // 비유동자산
  nonCurrentAssets:  [742, 705, 670,  635],
  investAssets:      [300, 290, 280,  270],
  longTermFinancial: [ 50,  50,  50,   50],
  otherInvest:       [250, 240, 230,  220],
  tangibleAssets:    [ 30,  25,  20,   15],
  depreciable:       [ 30,  25,  20,   15],
  land:              [  0,   0,   0,    0],
  construction:      [  0,   0,   0,    0],
  intangible:        [200, 190, 180,  170],
  otherNonCurrent:   [212, 200, 190,  180],
  totalAssets:       [927,1229,1500, 1870],
  // 유동부채
  currentLiab:       [120, 190, 176,  164],
  accountsPayable:   [ 10,  15,  18,   22],
  shortTermDebt:     [ 80,  60,  40,   20],
  currentLongTerm:   [ 20, 100, 100,  100],
  otherCurrentLiab:  [ 10,  15,  18,   22],
  // 비유동부채
  nonCurrentLiab:    [680, 560, 440,  320],
  longTermDebt:      [580, 480, 380,  280],
  bonds:             [  0,   0,   0,    0],
  provisions:        [  0,   0,   0,    0],
  otherNonCurrentLiab:[100,  80,  60,   40],
  // 부채총계
  totalLiab:         [800, 750, 616,  484],
  // 자본
  capital:           [200, 200, 200,  200],
  capitalSurplus:    [  0,   0,   0,    0],
  oci:               [  0,   0,   0,    0],
  retainedEarnings:  [-73, 279, 684, 1186],
  totalEquity:       [127, 479, 884, 1386],
  totalLiabEquity:   [927,1229,1500, 1870],
};

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
  // row 44 is empty label on asset side
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
// Columns: B,C(기준 금액,%), D,E(1차), F,G(2차), H,I(3차)

const is_data = {
  // [기준, 1차, 2차, 3차]
  revenue:        [365, 850, 1050, 1250],
  cogs:           [  0,   0,    0,    0],
  material:       [  0,   0,    0,    0],
  cogsDepr:       [  0,   0,    0,    0],
  cogsOther:      [  0,   0,    0,    0],
  cogsRetire:     [  0,   0,    0,    0],
  grossProfit:    [365, 850, 1050, 1250],
  sga:            [384, 500,  570,  650],
  sgaDepr:        [  5,   5,    5,    5],
  sgaAmort:       [ 10,  10,   10,   10],
  sgaOther:       [349, 460,  525,  600],
  sgaRetire:      [ 15,  20,   25,   30],
  sgaBadDebt:     [  5,   5,    5,    5],
  operatingIncome:[-19, 350,  480,  600],
  otherIncome:    [ 86,  50,   30,   20],
  interestIncome: [  1,   2,    3,    5],
  fxGain:         [  0,   0,    0,    0],
  fxTransGain:    [  0,   0,    0,    0],
  otherNonOpInc:  [ 85,  48,   27,   15],
  otherExpense:   [ 56,  45,   35,   25],
  interestExp:    [ 54,  43,   33,   23],
  fxLoss:         [  0,   0,    0,    0],
  fxTransLoss:    [  0,   0,    0,    0],
  otherNonOpExp:  [  2,   2,    2,    2],
  ebt:            [ 11, 355,  475,  595],
  tax:            [  0,   3,   70,   93],
  contOpsIncome:  [ 10, 352,  405,  502],
  discontOps:     [  0,   0,    0,    0],
  netIncome:      [ 10, 352,  405,  502],
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

// Amount cols: B, D, F, H
// Ratio cols: C, E, G, I
const amtCols = ['B','D','F','H'];
const pctCols = ['C','E','G','I'];

isRows.forEach(([row, key]) => {
  const vals = is_data[key];
  vals.forEach((v, i) => {
    set(amtCols[i] + row, v);
    // Calculate percentage relative to revenue
    const rev = is_data.revenue[i];
    const pct = rev > 0 ? Math.round((v / rev) * 1000) / 10 : 0;
    set(pctCols[i] + row, pct);
  });
});

// Fix Ⅷ. label to include 세전이익
set('A79', 'Ⅷ. 법인세비용차감전순이익');

// Update sheet range to include all data
ws['!ref'] = 'A1:J84';

// Write output
const outPath = '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/tmp/텐소프트웍스_추정재무제표_2026-2028_v2.xlsx';
XLSX.writeFile(wb, outPath);
console.log('Written to:', outPath);
