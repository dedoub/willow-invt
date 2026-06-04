import { chromium } from "playwright";
import fs from "fs";

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 25mm 20mm; }
  body { font-family: -apple-system, "Apple SD Gothic Neo", sans-serif; font-size: 11pt; color: #111; }
  h1 { text-align: center; font-size: 18pt; margin-bottom: 2px; }
  .subtitle { text-align: center; font-size: 10pt; color: #666; margin-bottom: 20px; }
  .info { font-size: 10pt; margin-bottom: 15px; display: flex; justify-content: space-between; }
  h2 { font-size: 13pt; margin-top: 25px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
  th, td { border: 1px solid #ccc; padding: 7px 10px; font-size: 10pt; }
  th { background: #f5f5f5; font-weight: 600; text-align: center; }
  td { text-align: right; }
  td:first-child { text-align: left; font-weight: 600; }
  td:last-child { text-align: left; font-size: 9pt; color: #666; }
  .footer { text-align: center; font-size: 8pt; color: #999; margin-top: 30px; }
</style>
</head>
<body>

<h1>경영상태 확인서</h1>
<div class="subtitle">(주)텐소프트웍스 | 3개년 재무현황</div>

<div class="info">
  <span>상호: 주식회사 텐소프트웍스</span>
  <span>사업자등록번호: 828-88-00992</span>
  <span>대표자: 김철형</span>
</div>

<h2>1. 재무상태</h2>
<div style="text-align:right; font-size:9pt; color:#666; margin-bottom:5px;">(단위: 백만원)</div>
<table>
  <tr><th>구분</th><th>M-2년<br>(2023)</th><th>M-1년<br>(2024)</th><th>M년<br>(2025)</th><th>비고</th></tr>
  <tr><td>총자산</td><td>936</td><td>1,101</td><td>1,322</td><td></td></tr>
  <tr><td>유동자산</td><td>191</td><td>354</td><td>185</td><td></td></tr>
  <tr><td>유동부채</td><td>178</td><td>985</td><td>1,195</td><td></td></tr>
  <tr><td>고정부채</td><td>667</td><td>0</td><td>0</td><td>2024 유동 재분류</td></tr>
  <tr><td>자기자본(자본총계)</td><td>91</td><td>116</td><td>127</td><td></td></tr>
  <tr><td>당기순이익</td><td>42</td><td>25</td><td>10</td><td></td></tr>
  <tr><td>매출액(계)</td><td>1,580</td><td>668</td><td>365</td><td></td></tr>
</table>

<h2>2. 재무비율</h2>
<table>
  <tr><th>구분</th><th>M-2년<br>(2023)</th><th>M-1년<br>(2024)</th><th>M년<br>(2025)</th><th>산식</th></tr>
  <tr><td>자기자본비율</td><td>9.7%</td><td>10.5%</td><td>9.6%</td><td>자기자본 / 총자산</td></tr>
  <tr><td>유동비율</td><td>107.3%</td><td>35.9%</td><td>15.5%</td><td>유동자산 / 유동부채</td></tr>
  <tr><td>부채비율</td><td>929%</td><td>849%</td><td>941%</td><td>부채총계 / 자기자본</td></tr>
</table>

<div class="footer">주식회사 텐소프트웍스 | 사업자등록번호 828-88-00992 | 작성일: 2026-03-21</div>

</body>
</html>`;

const outPath = "/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/tmp/텐소프트웍스_경영상태확인서_3개년.pdf";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.pdf({ path: outPath, format: "A4", printBackground: true });
await browser.close();

console.log("PDF saved to:", outPath);
