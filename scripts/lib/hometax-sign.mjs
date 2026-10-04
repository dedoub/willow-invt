// 홈택스 전자세금계산서 발급 서명 — 건별발급(hometax-issue-tax-invoice)과 수정발급(hometax-amend-tax-invoice)이 같이 쓴다.
// 발급하기 → 확인(인증 화면 이동) → 공동·금융 인증 → 텐소 범용 인증서(소유자 이름) → 비밀번호 한 번.
// 거부되면 다시 넣지 않는다(잠금 카운터 5회). 예상한 단추가 없으면 비밀번호 전에 멈춘다.
import { readCertificatePassword, selectCorporateCertificate, financeIdentity } from './tensw-local-finance.mjs'

const P = '#mf_txppWframe_'

/** 발급하고 결과 화면 글과 승인번호들을 돌려준다. 캡처는 shot(approvals) 경로에 찍는다. */
export async function signAndIssue(page, { shot }) {
  await page.locator(`${P}btnIsn`).click()
  await page.waitForTimeout(3000)
  await page.locator('[id$=_wframe_trigger20]').filter({ hasText: '인증' }).first().click({ timeout: 15000 })   // 확인(인증 화면 이동)
  await page.waitForTimeout(3000)
  await page.locator('button', { hasText: /공동.금융 인증/ }).first().click()
  await page.waitForTimeout(6000)
  const frame = page.frames().find(f => f.name() === 'dscert')
  if (!frame) throw new Error('인증서 창이 뜨지 않았어요 — 발급하지 않았어요')
  const trs = frame.locator('tr'); const rows = []
  for (let i = 0, n = await trs.count(); i < n; i++) {
    const c = (await trs.nth(i).locator('td').allTextContents()).map(x => x.trim()).filter(Boolean)
    if (c.length >= 4) rows.push({ locator: trs.nth(i), owner: c[0], purpose: c[1], issuer: c[2], expiresAt: c[3] })
  }
  const general = rows.filter(r => /범용/.test(r.purpose))            // 전자세금계산서 서명은 범용(기업)만 된다
  const sel = general[selectCorporateCertificate(general, new Date(), financeIdentity().certificateOwnerKeyword).index]
  await sel.locator.click()
  await frame.locator('input[type="password"]:not([disabled])').first().fill(await readCertificatePassword(), { timeout: 10000 })
  await frame.locator('#btn_confirm_iframe').click()                    // 한 번만. 거부되면 다시 시도하지 않는다
  await page.waitForTimeout(9000)
  const text = await page.evaluate(() => document.body.innerText)
  const approvals = [...new Set([...text.matchAll(/(\d{8}-\d{8}-\d{8})/g)].map(m => m[1]))]
  const path = shot(approvals)
  await page.screenshot({ path, fullPage: true })
  const emails = text.match(/발급한 전자세금계산서가 ([^\n]+?)로 발송/)?.[1] ?? ''
  return { text, approvals, emails, shot: path }
}
