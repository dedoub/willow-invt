import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file:///Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/tmp/agent-methodology.html', { waitUntil: 'networkidle' });
await page.pdf({
  path: '/Volumes/PRO-G40/app-dev/willow-invt/scripts/logs/tmp/채팅에이전트_구축방법론_5단계프레임워크.pdf',
  format: 'A4',
  margin: { top: '0', bottom: '0', left: '0', right: '0' },
  printBackground: true,
});
await browser.close();
console.log('PDF generated');
