/**
 * Debug: 전세 페이지 방문 시 어떤 API URL이 호출되는지 확인
 */
import { chromium } from 'playwright'

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 }, locale: 'ko-KR',
  })
  await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }) })

  // Visit main page first
  const page = await context.newPage()
  await page.goto('https://new.land.naver.com/', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await sleep(2000)
  await page.close()

  // Visit 은마 전세 page with fresh page
  const freshPage = await context.newPage()
  freshPage.on('response', (response) => {
    const url = response.url()
    if (url.includes('/api/articles')) {
      console.log(`[API] ${response.status()} ${url.slice(0, 200)}`)
    }
  })

  console.log('=== 은마 전세 (ms=b1) 방문 ===')
  try { await freshPage.goto('https://new.land.naver.com/complexes/236?ms=b1&a=APT&e=OPST', { waitUntil: 'networkidle', timeout: 20000 }) } catch {}
  await sleep(3000)

  await browser.close()
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
