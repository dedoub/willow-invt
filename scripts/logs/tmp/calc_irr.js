// XIRR Calculator for stock portfolio
// Calculates annualized IRR considering exact purchase/sale dates

function xirr(cashflows, dates, guess = 0.1) {
  const dayMs = 86400000;
  const yearDays = 365.25;

  function xnpv(rate) {
    let sum = 0;
    const d0 = dates[0].getTime();
    for (let i = 0; i < cashflows.length; i++) {
      const days = (dates[i].getTime() - d0) / dayMs;
      sum += cashflows[i] / Math.pow(1 + rate, days / yearDays);
    }
    return sum;
  }

  function xnpvDeriv(rate) {
    let sum = 0;
    const d0 = dates[0].getTime();
    for (let i = 0; i < cashflows.length; i++) {
      const days = (dates[i].getTime() - d0) / dayMs;
      const t = days / yearDays;
      sum -= t * cashflows[i] / Math.pow(1 + rate, t + 1);
    }
    return sum;
  }

  // Try multiple guesses if Newton's method fails
  const guesses = [guess, 0.5, -0.3, 1.0, 2.0, 5.0, -0.5, 0.01];

  for (const g of guesses) {
    let rate = g;
    let converged = false;
    for (let i = 0; i < 200; i++) {
      const npv = xnpv(rate);
      const deriv = xnpvDeriv(rate);
      if (Math.abs(deriv) < 1e-14) break;
      let newRate = rate - npv / deriv;
      if (Math.abs(newRate - rate) < 1e-10) { converged = true; break; }
      if (newRate < -0.99) newRate = -0.99; // bound
      rate = newRate;
    }
    if (converged && rate > -1 && isFinite(rate)) return rate;
  }
  return NaN;
}

function avgHoldingDays(trades, today) {
  // Weighted average holding period (days) for current shares
  // FIFO approach: earliest bought shares are still held
  let buyQueue = []; // {date, qty}

  for (const t of trades) {
    if (t.type === 'buy') {
      buyQueue.push({ date: t.date, qty: t.qty });
    } else {
      // sell - FIFO
      let remaining = t.qty;
      while (remaining > 0 && buyQueue.length > 0) {
        if (buyQueue[0].qty <= remaining) {
          remaining -= buyQueue[0].qty;
          buyQueue.shift();
        } else {
          buyQueue[0].qty -= remaining;
          remaining = 0;
        }
      }
    }
  }

  // Remaining queue = current holdings
  const todayMs = today.getTime();
  let totalDays = 0;
  let totalQty = 0;
  for (const b of buyQueue) {
    const days = (todayMs - b.date.getTime()) / 86400000;
    totalDays += days * b.qty;
    totalQty += b.qty;
  }

  return totalQty > 0 ? totalDays / totalQty : 0;
}

// ===== TRADE DATA FROM DB =====

const today = new Date('2026-03-12');

// Current prices (KRW for KR stocks, USD for US stocks)
// KR: from Toss app data
// US: estimated from Toss KRW prices / ~1,460 KRW/USD rate
const currentPrices = {
  // Korean (KRW)
  '005930': 189200,   // 삼성전자
  '000660': 950000,   // SK하이닉스
  '005380': 531000,   // 현대차
  '006800': 71500,    // 미래에셋증권
  '012450': 1408000,  // 한화에어로스페이스
  '064350': 203000,   // 현대로템
  // US (USD) - derived from Toss KRW prices / ~1,460 exchange rate
  'BE': 164.16,       // 블룸에너지
  'RKLB': 72.30,      // 로켓랩
  'VRT': 275.21,      // 버티브
  'CIEN': 346.69,     // 시에나
  'PLTR': 152.60,     // 팔란티어
  'QBTS': 19.09,      // 디웨이브
  'OKLO': 63.02,      // 오클로
  'IREN': 41.67,      // 아이렌
};

const names = {
  '005930': '삼성전자', '000660': 'SK하이닉스', '005380': '현대차',
  '006800': '미래에셋증권', '012450': '한화에어로', '064350': '현대로템',
  'BE': '블룸에너지', 'RKLB': '로켓랩', 'VRT': '버티브', 'CIEN': '시에나',
  'PLTR': '팔란티어', 'QBTS': '디웨이브', 'OKLO': '오클로', 'IREN': '아이렌',
  'GEV': 'GE버노바', 'SNOW': '스노우플레이크', 'NOW': '서비스나우'
};

// All trades from DB
const allTrades = [
  // SK하이닉스
  { ticker: '000660', type: 'buy', qty: 5, amount: 3130438, date: new Date('2025-11-13') },
  { ticker: '000660', type: 'buy', qty: 5, amount: 2935410, date: new Date('2025-11-24') },
  { ticker: '000660', type: 'buy', qty: 10, amount: 7730000, date: new Date('2026-01-12') },
  { ticker: '000660', type: 'buy', qty: 6, amount: 4980000, date: new Date('2026-01-30') },
  { ticker: '000660', type: 'buy', qty: 4, amount: 3852000, date: new Date('2026-02-25') },
  { ticker: '000660', type: 'buy', qty: 5, amount: 5120000, date: new Date('2026-02-27') },
  { ticker: '000660', type: 'buy', qty: 5, amount: 5300000, date: new Date('2026-03-03') },

  // 현대차
  { ticker: '005380', type: 'buy', qty: 10, amount: 5020000, date: new Date('2026-02-06') },
  { ticker: '005380', type: 'buy', qty: 10, amount: 6620000, date: new Date('2026-03-04') },

  // 삼성전자
  { ticker: '005930', type: 'buy', qty: 35, amount: 4998000, date: new Date('2026-01-12') },
  { ticker: '005930', type: 'buy', qty: 33, amount: 4880700, date: new Date('2026-01-23') },
  { ticker: '005930', type: 'buy', qty: 30, amount: 4833000, date: new Date('2026-01-30') },
  { ticker: '005930', type: 'buy', qty: 30, amount: 5043000, date: new Date('2026-02-06') },
  { ticker: '005930', type: 'buy', qty: 32, amount: 5702400, date: new Date('2026-02-19') },
  { ticker: '005930', type: 'buy', qty: 25, amount: 4750000, date: new Date('2026-02-23') },
  { ticker: '005930', type: 'buy', qty: 25, amount: 4852500, date: new Date('2026-02-25') },
  { ticker: '005930', type: 'buy', qty: 20, amount: 4080000, date: new Date('2026-02-27') },
  { ticker: '005930', type: 'buy', qty: 20, amount: 4320000, date: new Date('2026-03-03') },

  // 미래에셋증권
  { ticker: '006800', type: 'buy', qty: 100, amount: 5040000, date: new Date('2026-02-06') },
  { ticker: '006800', type: 'buy', qty: 100, amount: 5140000, date: new Date('2026-02-11') },

  // 한화에어로스페이스
  { ticker: '012450', type: 'buy', qty: 15, amount: 13655205, date: new Date('2025-06-30') },
  { ticker: '012450', type: 'buy', qty: 1, amount: 850119, date: new Date('2025-07-18') },
  { ticker: '012450', type: 'buy', qty: 1, amount: 901126, date: new Date('2025-07-21') },
  { ticker: '012450', type: 'buy', qty: 1, amount: 909127, date: new Date('2025-07-23') },
  { ticker: '012450', type: 'buy', qty: 1, amount: 919128, date: new Date('2025-07-24') },
  { ticker: '012450', type: 'buy', qty: 1, amount: 904126, date: new Date('2025-07-25') },
  { ticker: '012450', type: 'buy', qty: 1, amount: 935130, date: new Date('2025-07-28') },
  { ticker: '012450', type: 'buy', qty: 1, amount: 946132, date: new Date('2025-07-29') },
  { ticker: '012450', type: 'buy', qty: 1, amount: 982137, date: new Date('2025-07-31') },
  { ticker: '012450', type: 'buy', qty: 1, amount: 984137, date: new Date('2025-08-04') },
  { ticker: '012450', type: 'sell', qty: 12, amount: 11321403, date: new Date('2025-10-17') },
  { ticker: '012450', type: 'buy', qty: 4, amount: 4884000, date: new Date('2026-01-14') },

  // 현대로템
  { ticker: '064350', type: 'buy', qty: 75, amount: 14529525, date: new Date('2025-06-30') },
  { ticker: '064350', type: 'buy', qty: 5, amount: 986638, date: new Date('2025-07-21') },
  { ticker: '064350', type: 'buy', qty: 5, amount: 981147, date: new Date('2025-07-24') },
  { ticker: '064350', type: 'buy', qty: 5, amount: 951633, date: new Date('2025-07-25') },
  { ticker: '064350', type: 'buy', qty: 5, amount: 979137, date: new Date('2025-07-28') },
  { ticker: '064350', type: 'buy', qty: 5, amount: 974636, date: new Date('2025-07-29') },
  { ticker: '064350', type: 'buy', qty: 5, amount: 972136, date: new Date('2025-07-31') },
  { ticker: '064350', type: 'buy', qty: 5, amount: 999139, date: new Date('2025-08-04') },
  { ticker: '064350', type: 'sell', qty: 55, amount: 11640761, date: new Date('2025-10-17') },

  // 블룸에너지 (BE)
  { ticker: 'BE', type: 'buy', qty: 40, amount: 2151.21, date: new Date('2025-09-01') },
  { ticker: 'BE', type: 'buy', qty: 60, amount: 3350.84, date: new Date('2025-09-09') },
  { ticker: 'BE', type: 'buy', qty: 50, amount: 3385.34, date: new Date('2025-09-15') },
  { ticker: 'BE', type: 'buy', qty: 50, amount: 3778.47, date: new Date('2025-09-19') },
  { ticker: 'BE', type: 'buy', qty: 40, amount: 3429.13, date: new Date('2025-10-03') },
  { ticker: 'BE', type: 'buy', qty: 60, amount: 5580.51, date: new Date('2025-10-07') },
  { ticker: 'BE', type: 'buy', qty: 30, amount: 4100.89, date: new Date('2025-10-31') },
  { ticker: 'BE', type: 'buy', qty: 16, amount: 2030.37, date: new Date('2026-01-13') },
  { ticker: 'BE', type: 'buy', qty: 25, amount: 3500.49, date: new Date('2026-01-15') },
  { ticker: 'BE', type: 'buy', qty: 20, amount: 3359.15, date: new Date('2026-02-05') },

  // 시에나 (CIEN)
  { ticker: 'CIEN', type: 'buy', qty: 10, amount: 2951.83, date: new Date('2026-02-19') },
  { ticker: 'CIEN', type: 'buy', qty: 10, amount: 3328.52, date: new Date('2026-02-24') },
  { ticker: 'CIEN', type: 'buy', qty: 10, amount: 3616.41, date: new Date('2026-02-27') },
  { ticker: 'CIEN', type: 'buy', qty: 10, amount: 3601.49, date: new Date('2026-03-04') },

  // GE버노바 (GEV) - fully sold
  { ticker: 'GEV', type: 'buy', qty: 1, amount: 649.42, date: new Date('2025-08-13') },
  { ticker: 'GEV', type: 'buy', qty: 1, amount: 657.73, date: new Date('2025-08-14') },
  { ticker: 'GEV', type: 'buy', qty: 1, amount: 607.73, date: new Date('2025-08-27') },
  { ticker: 'GEV', type: 'buy', qty: 1, amount: 605.46, date: new Date('2025-08-27') },
  { ticker: 'GEV', type: 'buy', qty: 1, amount: 608.97, date: new Date('2025-08-27') },
  { ticker: 'GEV', type: 'buy', qty: 5, amount: 3096.28, date: new Date('2025-08-28') },
  { ticker: 'GEV', type: 'buy', qty: 5, amount: 3181.16, date: new Date('2025-09-01') },
  { ticker: 'GEV', type: 'sell', qty: 5, amount: 2979.10, date: new Date('2025-10-08') },
  { ticker: 'GEV', type: 'sell', qty: 10, amount: 5995.47, date: new Date('2025-10-10') },

  // 아이렌 (IREN)
  { ticker: 'IREN', type: 'buy', qty: 60, amount: 3802.09, date: new Date('2025-10-13') },
  { ticker: 'IREN', type: 'buy', qty: 59, amount: 3988.84, date: new Date('2025-10-15') },
  { ticker: 'IREN', type: 'buy', qty: 31, amount: 2276.69, date: new Date('2025-10-17') },
  { ticker: 'IREN', type: 'buy', qty: 1, amount: 48.81, date: new Date('2026-01-13') },
  { ticker: 'IREN', type: 'buy', qty: 70, amount: 3584.78, date: new Date('2026-01-15') },

  // 서비스나우 (NOW) - fully sold
  { ticker: 'NOW', type: 'buy', qty: 1, amount: 805.40, date: new Date('2025-04-17') },
  { ticker: 'NOW', type: 'buy', qty: 1, amount: 785.42, date: new Date('2025-04-22') },
  { ticker: 'NOW', type: 'sell', qty: 2, amount: 2000.74, date: new Date('2025-06-30') },

  // 오클로 (OKLO)
  { ticker: 'OKLO', type: 'buy', qty: 20, amount: 1999.93, date: new Date('2025-09-22') },
  { ticker: 'OKLO', type: 'buy', qty: 10, amount: 1370.26, date: new Date('2025-09-26') },
  { ticker: 'OKLO', type: 'buy', qty: 30, amount: 3508.10, date: new Date('2025-10-01') },
  { ticker: 'OKLO', type: 'buy', qty: 13, amount: 1790.01, date: new Date('2025-10-08') },
  { ticker: 'OKLO', type: 'buy', qty: 7, amount: 966.24, date: new Date('2025-10-08') },
  { ticker: 'OKLO', type: 'buy', qty: 20, amount: 3146.74, date: new Date('2025-10-15') },
  { ticker: 'OKLO', type: 'buy', qty: 38, amount: 7062.20, date: new Date('2025-10-17') },
  { ticker: 'OKLO', type: 'buy', qty: 28, amount: 2890.45, date: new Date('2026-01-15') },

  // 팔란티어 (PLTR)
  { ticker: 'PLTR', type: 'buy', qty: 10, amount: 940.20, date: new Date('2025-04-16') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 468.21, date: new Date('2025-04-22') },
  { ticker: 'PLTR', type: 'buy', qty: 15, amount: 2162.87, date: new Date('2025-06-30') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 669.31, date: new Date('2025-07-03') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 659.85, date: new Date('2025-07-04') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 676.82, date: new Date('2025-07-08') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 679.60, date: new Date('2025-07-09') },
  { ticker: 'PLTR', type: 'buy', qty: 8, amount: 1113.55, date: new Date('2025-07-11') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 701.50, date: new Date('2025-07-14') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 730.78, date: new Date('2025-07-16') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 749.19, date: new Date('2025-07-17') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 743.59, date: new Date('2025-07-18') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 761.71, date: new Date('2025-07-21') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 763.74, date: new Date('2025-07-22') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 766.41, date: new Date('2025-07-23') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 750.06, date: new Date('2025-07-25') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 766.86, date: new Date('2025-07-28') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 796.19, date: new Date('2025-07-29') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 795.66, date: new Date('2025-07-30') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 791.49, date: new Date('2025-07-31') },
  { ticker: 'PLTR', type: 'buy', qty: 5, amount: 796.41, date: new Date('2025-08-01') },
  { ticker: 'PLTR', type: 'buy', qty: 8, amount: 1458.14, date: new Date('2025-08-11') },
  { ticker: 'PLTR', type: 'buy', qty: 8, amount: 1495.33, date: new Date('2025-08-12') },
  { ticker: 'PLTR', type: 'buy', qty: 11, amount: 2017.61, date: new Date('2025-08-14') },
  { ticker: 'PLTR', type: 'buy', qty: 20, amount: 3828.77, date: new Date('2025-10-29') },
  { ticker: 'PLTR', type: 'buy', qty: 20, amount: 3925.90, date: new Date('2025-10-31') },
  { ticker: 'PLTR', type: 'buy', qty: 20, amount: 4084.08, date: new Date('2025-11-04') },

  // 디웨이브 (QBTS)
  { ticker: 'QBTS', type: 'buy', qty: 100, amount: 3290.92, date: new Date('2025-10-08') },
  { ticker: 'QBTS', type: 'buy', qty: 100, amount: 3617.25, date: new Date('2025-10-10') },
  { ticker: 'QBTS', type: 'buy', qty: 100, amount: 4550.59, date: new Date('2025-10-17') },

  // 로켓랩 (RKLB)
  { ticker: 'RKLB', type: 'buy', qty: 50, amount: 2279.77, date: new Date('2025-08-13') },
  { ticker: 'RKLB', type: 'buy', qty: 50, amount: 2249.24, date: new Date('2025-08-14') },
  { ticker: 'RKLB', type: 'buy', qty: 50, amount: 2316.81, date: new Date('2025-08-20') },
  { ticker: 'RKLB', type: 'buy', qty: 50, amount: 2379.87, date: new Date('2025-08-27') },
  { ticker: 'RKLB', type: 'buy', qty: 50, amount: 2479.57, date: new Date('2025-08-28') },
  { ticker: 'RKLB', type: 'buy', qty: 50, amount: 2707.15, date: new Date('2025-09-17') },
  { ticker: 'RKLB', type: 'buy', qty: 40, amount: 2269.86, date: new Date('2025-10-08') },
  { ticker: 'RKLB', type: 'buy', qty: 50, amount: 3313.31, date: new Date('2025-10-10') },
  { ticker: 'RKLB', type: 'buy', qty: 60, amount: 3945.94, date: new Date('2025-10-10') },
  { ticker: 'RKLB', type: 'buy', qty: 100, amount: 7094.58, date: new Date('2025-10-15') },
  { ticker: 'RKLB', type: 'buy', qty: 20, amount: 1693.69, date: new Date('2026-01-13') },
  { ticker: 'RKLB', type: 'buy', qty: 40, amount: 3490.68, date: new Date('2026-01-15') },
  { ticker: 'RKLB', type: 'buy', qty: 40, amount: 3042.23, date: new Date('2026-02-11') },

  // 스노우플레이크 (SNOW) - fully sold
  { ticker: 'SNOW', type: 'buy', qty: 5, amount: 1090.18, date: new Date('2025-06-30') },
  { ticker: 'SNOW', type: 'buy', qty: 5, amount: 1092.09, date: new Date('2025-06-30') },
  { ticker: 'SNOW', type: 'buy', qty: 7, amount: 1558.00, date: new Date('2025-07-01') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 668.22, date: new Date('2025-07-03') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 654.86, date: new Date('2025-07-04') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 664.71, date: new Date('2025-07-08') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 665.07, date: new Date('2025-07-09') },
  { ticker: 'SNOW', type: 'buy', qty: 5, amount: 1117.38, date: new Date('2025-07-11') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 643.51, date: new Date('2025-07-14') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 639.51, date: new Date('2025-07-16') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 641.65, date: new Date('2025-07-17') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 634.59, date: new Date('2025-07-18') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 636.63, date: new Date('2025-07-21') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 642.74, date: new Date('2025-07-22') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 651.05, date: new Date('2025-07-23') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 639.94, date: new Date('2025-07-25') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 641.92, date: new Date('2025-07-28') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 661.23, date: new Date('2025-07-29') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 665.02, date: new Date('2025-07-30') },
  { ticker: 'SNOW', type: 'buy', qty: 3, amount: 659.39, date: new Date('2025-08-01') },
  { ticker: 'SNOW', type: 'sell', qty: 70, amount: 15911.18, date: new Date('2025-08-29') },

  // 버티브 (VRT)
  { ticker: 'VRT', type: 'buy', qty: 15, amount: 3557.88, date: new Date('2026-02-19') },
  { ticker: 'VRT', type: 'buy', qty: 15, amount: 3892.78, date: new Date('2026-02-27') },
  { ticker: 'VRT', type: 'buy', qty: 10, amount: 2690.18, date: new Date('2026-03-12') },
];

// Group by ticker
const byTicker = {};
for (const t of allTrades) {
  if (!byTicker[t.ticker]) byTicker[t.ticker] = [];
  byTicker[t.ticker].push(t);
}

console.log('=== 포트폴리오 IRR 분석 (2026-03-12) ===\n');

// Calculate for each ticker
const results = [];

for (const [ticker, trades] of Object.entries(byTicker)) {
  trades.sort((a, b) => a.date - b.date);

  // Calculate net shares
  let netShares = 0;
  let totalBought = 0;
  let totalSold = 0;
  for (const t of trades) {
    if (t.type === 'buy') { netShares += t.qty; totalBought += t.amount; }
    else { netShares -= t.qty; totalSold += t.amount; }
  }

  // Build cash flows for XIRR
  const cashflows = [];
  const dates = [];

  for (const t of trades) {
    cashflows.push(t.type === 'buy' ? -t.amount : t.amount);
    dates.push(t.date);
  }

  // If still holding, add terminal value
  const isHolding = netShares > 0;
  if (isHolding && currentPrices[ticker]) {
    cashflows.push(netShares * currentPrices[ticker]);
    dates.push(today);
  }

  // Calculate XIRR
  const irr = xirr(cashflows, dates);

  // Calculate average holding period
  const avgDays = avgHoldingDays(trades, today);

  // Simple return (total proceeds vs total cost)
  const currentValue = isHolding ? netShares * currentPrices[ticker] : 0;
  const simpleReturn = (currentValue + totalSold - totalBought) / totalBought;

  // Currency
  const currency = ['005930','000660','005380','006800','012450','064350'].includes(ticker) ? 'KRW' : 'USD';
  const market = currency === 'KRW' ? '🇰🇷' : '🇺🇸';

  results.push({
    ticker,
    name: names[ticker] || ticker,
    market,
    currency,
    netShares,
    totalBought,
    totalSold,
    currentValue: isHolding ? netShares * currentPrices[ticker] : null,
    simpleReturn,
    irr,
    avgDays: Math.round(avgDays),
    isHolding,
    tradeCount: trades.length,
    firstDate: trades[0].date,
    lastBuyDate: trades.filter(t => t.type === 'buy').slice(-1)[0]?.date,
  });
}

// Sort: holding first, then by IRR desc
results.sort((a, b) => {
  if (a.isHolding !== b.isHolding) return b.isHolding ? 1 : -1;
  return (b.irr || 0) - (a.irr || 0);
});

// Print results
console.log('── 보유 종목 ──');
console.log('');

for (const r of results.filter(r => r.isHolding)) {
  const irrPct = isNaN(r.irr) ? 'N/A' : `${(r.irr * 100).toFixed(1)}%`;
  const returnPct = `${(r.simpleReturn * 100).toFixed(1)}%`;
  const irrSign = (isNaN(r.irr) || r.irr >= 0) ? '+' : '';
  const sign = r.simpleReturn >= 0 ? '+' : '';
  const costStr = r.currency === 'KRW'
    ? `₩${Math.round(r.totalBought).toLocaleString()}`
    : `$${r.totalBought.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  const evalStr = r.currency === 'KRW'
    ? `₩${Math.round(r.currentValue).toLocaleString()}`
    : `$${r.currentValue.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

  console.log(`${r.market} ${r.name} (${r.ticker})`);
  console.log(`   보유: ${r.netShares}주 | 거래: ${r.tradeCount}회`);
  console.log(`   원금: ${costStr} → 평가: ${evalStr}`);
  console.log(`   단순수익률: ${sign}${returnPct} | IRR(연율): ${irrSign}${irrPct}`);
  console.log(`   평균보유기간: ${r.avgDays}일 (${(r.avgDays/30.44).toFixed(1)}개월)`);
  console.log(`   매수기간: ${r.firstDate.toISOString().slice(0,10)} ~ ${r.lastBuyDate.toISOString().slice(0,10)}`);
  console.log('');
}

console.log('── 청산 완료 종목 ──');
console.log('');

for (const r of results.filter(r => !r.isHolding)) {
  const irrPct = isNaN(r.irr) ? 'N/A' : `${(r.irr * 100).toFixed(1)}%`;
  const returnPct = `${(r.simpleReturn * 100).toFixed(1)}%`;
  const sign = r.simpleReturn >= 0 ? '+' : '';

  console.log(`${r.market} ${r.name} (${r.ticker})`);
  const irrSign2 = (isNaN(r.irr) || r.irr >= 0) ? '+' : '';
  console.log(`   거래: ${r.tradeCount}회 | 단순수익률: ${sign}${returnPct} | IRR(연율): ${irrSign2}${irrPct}`);
  console.log('');
}

// Portfolio summary
console.log('── 포트폴리오 요약 ──');
const krHeld = results.filter(r => r.isHolding && r.currency === 'KRW');
const usHeld = results.filter(r => r.isHolding && r.currency === 'USD');

const krTotalCost = krHeld.reduce((s, r) => s + r.totalBought, 0);
const krTotalSold = krHeld.reduce((s, r) => s + (r.totalSold || 0), 0);
const krTotalEval = krHeld.reduce((s, r) => s + r.currentValue, 0);
const usTotalCost = usHeld.reduce((s, r) => s + r.totalBought, 0);
const usTotalSold = usHeld.reduce((s, r) => s + (r.totalSold || 0), 0);
const usTotalEval = usHeld.reduce((s, r) => s + r.currentValue, 0);

const krReturn = ((krTotalEval + krTotalSold - krTotalCost) / krTotalCost * 100).toFixed(1);
const usReturn = ((usTotalEval + usTotalSold - usTotalCost) / usTotalCost * 100).toFixed(1);

console.log(`🇰🇷 한국: 원금 ₩${Math.round(krTotalCost).toLocaleString()} | 현재평가 ₩${Math.round(krTotalEval).toLocaleString()} | 실현손익 ₩${Math.round(krTotalSold).toLocaleString()} | 총수익률 ${krReturn}%`);
console.log(`🇺🇸 미국: 원금 $${Math.round(usTotalCost).toLocaleString()} | 현재평가 $${Math.round(usTotalEval).toLocaleString()} | 실현손익 $${Math.round(usTotalSold).toLocaleString()} | 총수익률 ${usReturn}%`);

// Weighted avg holding period
const allHeld = results.filter(r => r.isHolding);
console.log(`\n평균보유기간 범위: ${Math.min(...allHeld.map(r => r.avgDays))}일 ~ ${Math.max(...allHeld.map(r => r.avgDays))}일`);
