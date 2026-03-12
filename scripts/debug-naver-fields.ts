/**
 * Debug: 네이버 API 응답의 실제 필드명 확인
 */
import { chromium } from 'playwright'

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
  })
  await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }) })
  const page = await context.newPage()

  // Visit main page first
  await page.goto('https://new.land.naver.com/', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await sleep(2000)

  // Intercept API responses for 은마 (hscpNo: 236)
  const hscpNo = '236'
  const articles: any[] = []

  const apiPromise = new Promise<void>((resolve) => {
    let timeout: NodeJS.Timeout
    const resetTimeout = () => { clearTimeout(timeout); timeout = setTimeout(() => resolve(), 5000) }

    page.on('response', async (response) => {
      const url = response.url()
      if (!url.includes('/api/articles') && !url.includes('/article/') && !url.includes('complexNo')) return
      if (!url.includes(hscpNo) && !url.includes('complex')) return

      try {
        if (response.status() === 200) {
          const text = await response.text()
          try {
            const data = JSON.parse(text)
            if (data?.articleList) {
              articles.push(...data.articleList)
              resetTimeout()
            }
          } catch {}
        }
      } catch {}
    })
    resetTimeout()
  })

  const url = `https://new.land.naver.com/complexes/${hscpNo}?ms=a1&a=APT&e=OPST`
  try { await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }) } catch {}

  // Scroll to load more
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 1000); await sleep(1500) }

  await apiPromise

  console.log(`\n=== 총 ${articles.length}건 ===\n`)

  if (articles.length > 0) {
    // Print all keys from first article
    const first = articles[0]
    console.log('=== 첫 번째 article 전체 키 ===')
    console.log(Object.keys(first).sort().join(', '))
    console.log('\n=== 면적 관련 필드 ===')
    for (const key of Object.keys(first).sort()) {
      if (key.toLowerCase().includes('area') || key.toLowerCase().includes('spc') || key.toLowerCase().includes('pyeong') || key.toLowerCase().includes('supply') || key.toLowerCase().includes('exclusive')) {
        console.log(`  ${key}: ${JSON.stringify(first[key])}`)
      }
    }
    console.log('\n=== 첫 번째 article 전체 데이터 ===')
    console.log(JSON.stringify(first, null, 2))
  }

  await browser.close()
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
