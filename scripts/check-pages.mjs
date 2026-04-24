import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { SignJWT } from 'jose';

const BASE = 'http://localhost:3000';

async function generateToken() {
  const secret = new TextEncoder().encode('willow-dashboard-jwt-secret-key-2024-secure');
  return await new SignJWT({
    userId: '0b8a7bb6-44fa-4cf2-b5b3-c87d64b7bd47',
    email: 'dw.kim@willowinvt.com',
    name: '김동욱',
    role: 'admin',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

const PAGES = [
  { name: 'dashboard', path: '/' },
  { name: 'willow-management', path: '/willow-investment/management' },
  { name: 'tensw-management', path: '/tensoftworks/management' },
  { name: 'tensw-projects', path: '/tensoftworks/projects' },
  { name: 'etf-akros', path: '/etf/akros' },
  { name: 'etf-etc', path: '/etf/etc' },
  { name: 'ryuha-study', path: '/others/ryuha-study' },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  // Set auth cookie with valid JWT
  const token = await generateToken();
  await context.addCookies([{
    name: 'auth_token',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }]);

  const outDir = join(process.cwd(), 'scripts/logs/tmp');

  for (const page of PAGES) {
    console.log(`\n=== ${page.name} (${page.path}) ===`);
    const p = await context.newPage();
    await p.goto(`${BASE}${page.path}`, { waitUntil: 'networkidle', timeout: 30000 });
    await p.waitForTimeout(2000);

    // Take full-page screenshot
    await p.screenshot({
      path: join(outDir, `${page.name}.png`),
      fullPage: true,
    });
    console.log(`Screenshot saved: ${page.name}.png`);

    // Extract visible text structure for analysis
    const structure = await p.evaluate(() => {
      const result = { tabs: [], cards: [], buttons: [], tables: [], forms: [] };

      // Find tab triggers
      document.querySelectorAll('[role="tab"], [data-state]').forEach(el => {
        if (el.textContent?.trim()) result.tabs.push(el.textContent.trim());
      });

      // Find card headers
      document.querySelectorAll('h2, h3, [class*="CardTitle"], [class*="card-title"]').forEach(el => {
        if (el.textContent?.trim()) result.cards.push(el.textContent.trim());
      });

      // Find buttons with text
      document.querySelectorAll('button').forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length < 30) result.buttons.push(text);
      });

      // Find tables
      document.querySelectorAll('table').forEach((table, i) => {
        const headers = [];
        table.querySelectorAll('th').forEach(th => headers.push(th.textContent?.trim()));
        result.tables.push({ index: i, headers });
      });

      return result;
    });

    console.log('Tabs:', JSON.stringify(structure.tabs));
    console.log('Cards:', JSON.stringify(structure.cards));
    console.log('Buttons:', JSON.stringify(structure.buttons.slice(0, 20)));
    console.log('Tables:', JSON.stringify(structure.tables));

    await p.close();
  }

  // Now check each page's tabs by clicking them
  console.log('\n\n=== CHECKING TABS ON EACH PAGE ===\n');

  for (const page of PAGES) {
    const p = await context.newPage();
    await p.goto(`${BASE}${page.path}`, { waitUntil: 'networkidle', timeout: 30000 });
    await p.waitForTimeout(2000);

    const tabs = await p.$$('[role="tab"]');
    if (tabs.length > 1) {
      for (let i = 0; i < tabs.length; i++) {
        const tabText = await tabs[i].textContent();
        await tabs[i].click();
        await p.waitForTimeout(1500);
        await p.screenshot({
          path: join(outDir, `${page.name}-tab${i}-${tabText?.trim().replace(/\s+/g, '_')}.png`),
          fullPage: true,
        });
        console.log(`${page.name} tab[${i}]: ${tabText?.trim()}`);

        // Extract content for this tab
        const content = await p.evaluate(() => {
          const result = { headings: [], buttons: [], tables: [] };
          document.querySelectorAll('h2, h3, h4').forEach(el => {
            if (el.textContent?.trim()) result.headings.push(el.textContent.trim());
          });
          document.querySelectorAll('button').forEach(el => {
            const t = el.textContent?.trim();
            if (t && t.length < 30) result.buttons.push(t);
          });
          document.querySelectorAll('table').forEach((table, i) => {
            const headers = [];
            table.querySelectorAll('th').forEach(th => headers.push(th.textContent?.trim()));
            result.tables.push({ index: i, headers });
          });
          return result;
        });
        console.log(`  Headings: ${JSON.stringify(content.headings)}`);
        console.log(`  Buttons: ${JSON.stringify(content.buttons.slice(0, 15))}`);
        console.log(`  Tables: ${JSON.stringify(content.tables)}`);
      }
    }
    await p.close();
  }

  await browser.close();
  console.log('\nDone!');
}

main().catch(console.error);
