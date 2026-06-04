import { chromium } from 'playwright';

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; font-size: 11pt; color: #000; }
  h2 { text-align: center; font-size: 16pt; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 10pt; color: #555; margin-bottom: 20px; }
  .company-info { text-align: center; font-size: 10pt; margin-bottom: 16px; }
  .company-info span { margin: 0 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { border: 1px solid #333; padding: 7px 10px; text-align: center; font-size: 10pt; }
  th { background: #f0f0f0; font-weight: bold; }
  td.label { text-align: left; font-weight: bold; background: #fafafa; }
  td.num { text-align: right; font-family: 'Courier New', monospace; }
  .section-title { font-size: 12pt; font-weight: bold; margin: 20px 0 8px 0; }
  .unit { text-align: right; font-size: 9pt; color: #555; margin-bottom: 4px; }
  .footer { text-align: center; font-size: 9pt; color: #777; margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; }
</style>
</head>
<body>

<h2>경영상태 확인서</h2>
<div class="subtitle">(주)텐소프트웍스 | 3개년 재무현황</div>

<div class="company-info">
  <span>상호: 주식회사 텐소프트웍스</span>
  <span>사업자등록번호: 828-88-00992</span>
  <span>대표자: 김철형</span>
</div>

<div class="section-title">1. 재무상태</div>
<div class="unit">(단위: 백만원)</div>
<table>
  <thead>
    <tr>
      <th style="width:30%">구분</th>
      <th style="width:17%">M-2년<br>(2023)</th>
      <th style="width:17%">M-1년<br>(2024)</th>
      <th style="width:17%">M년<br>(2025)</th>
      <th style="width:19%">비고</th>
    </tr>
  </thead>
  <tbody>
    <tr><td class="label">총자산</td><td class="num">936</td><td class="num">1,101</td><td class="num">1,322</td><td></td></tr>
    <tr><td class="label">유동자산</td><td class="num">191</td><td class="num">354</td><td class="num">185</td><td></td></tr>
    <tr><td class="label">유동부채</td><td class="num">178</td><td class="num">985</td><td class="num">1,195</td><td></td></tr>
    <tr><td class="label">고정부채</td><td class="num">667</td><td class="num">0</td><td class="num">0</td><td>2024 유동 재분류</td></tr>
    <tr><td class="label">자기자본(자본금)</td><td class="num">13</td><td class="num">13</td><td class="num">13</td><td></td></tr>
    <tr><td class="label">당기순이익</td><td class="num">42</td><td class="num">25</td><td class="num">10</td><td></td></tr>
    <tr><td class="label">매출액(계)</td><td class="num">1,580</td><td class="num">668</td><td class="num">365</td><td></td></tr>
  </tbody>
</table>

<div class="section-title">2. 재무비율</div>
<table>
  <thead>
    <tr>
      <th style="width:30%">구분</th>
      <th style="width:17%">M-2년<br>(2023)</th>
      <th style="width:17%">M-1년<br>(2024)</th>
      <th style="width:17%">M년<br>(2025)</th>
      <th style="width:19%">산식</th>
    </tr>
  </thead>
  <tbody>
    <tr><td class="label">자기자본비율</td><td>1.39%</td><td>1.18%</td><td>0.98%</td><td style="font-size:9pt">자기자본 / 총자산</td></tr>
    <tr><td class="label">유동비율</td><td>107.3%</td><td>35.9%</td><td>15.5%</td><td style="font-size:9pt">유동자산 / 유동부채</td></tr>
    <tr><td class="label">부채비율</td><td>6,500%</td><td>7,577%</td><td>9,192%</td><td style="font-size:9pt">부채총계 / 자기자본</td></tr>
  </tbody>
</table>

<div class="footer">
  주식회사 텐소프트웍스 | 사업자등록번호 828-88-00992 | 작성일: 2026-03-21
</div>

</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
const outputPath = '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/tmp/텐소프트웍스_경영상태확인서_3개년.pdf';
await page.pdf({ path: outputPath, format: 'A4', printBackground: true });
await browser.close();
console.log('PDF saved:', outputPath);
