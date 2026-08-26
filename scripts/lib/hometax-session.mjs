// The HomeTax session lives only as long as the browser context, so every
// collector has to sign in inside the context it will read from. This is the
// certificate sign-in shared by those collectors.

import {
  certificateImportPaths,
  financeIdentity,
  isHometaxReadyUrl,
  readCertificatePassword,
  selectCorporateCertificate,
} from './tensw-local-finance.mjs'

export const HOMETAX_URL = 'https://www.hometax.go.kr/'

async function certificateRows(frame) {
  const rowLocators = frame.locator('tr')
  const count = await rowLocators.count()
  const rows = []

  for (let index = 0; index < count; index += 1) {
    const row = rowLocators.nth(index)
    const cells = (await row.locator('td').allTextContents()).map(value => value.trim()).filter(Boolean)
    if (cells.length < 4) continue
    rows.push({
      locator: row,
      owner: cells[0],
      purpose: cells[1],
      issuer: cells[2],
      expiresAt: cells[3],
    })
  }

  return rows
}

async function waitForCertificateRows(frame, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const rows = await certificateRows(frame)
    if (rows.length > 0) return rows
    await frame.waitForTimeout(250)
  }
  return []
}

async function importBrowserCertificate(frame, password) {
  await frame.locator('#in_browser').click()
  const importPassword = frame.locator('#add_browser_password')
  await importPassword.waitFor({ state: 'visible' })
  // HomeTax attaches the file-change handler after the import dialog animation.
  await frame.waitForTimeout(500)
  await frame.locator('#filefile2').setInputFiles(certificateImportPaths())
  await frame.locator('#file_route2').waitFor({ state: 'visible' })
  await frame.waitForFunction(() => document.querySelector('#file_route2')?.value.includes('signCert.der'))
  await importPassword.fill(password)
  await frame.locator('#browser_save_yn').check()
  await frame.locator('#btn_common_confirm:visible').click()
}

async function waitForCertificateFrame(page) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const frame = page.frames().find(candidate => candidate.url().includes('/NTSMagicLine4Web/ML4Web/Child.html'))
    if (frame) return frame
    await page.waitForTimeout(250)
  }
  throw new Error('홈택스 인증서 선택창이 30초 안에 열리지 않았어요.')
}

// The full-menu markup carries a hidden 로그아웃 link even when signed out, so
// visibility is what decides, not presence.
export async function isHometaxLoggedIn(page, timeout = 8_000) {
  return page.getByRole('link', { name: '로그아웃', exact: true })
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false)
}

// Returns the stage it reached so callers can name it in their failure message.
export async function hometaxLogin(page, { log = () => {} } = {}) {
  const identity = financeIdentity()

  await page.goto(HOMETAX_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.waitForURL(url => isHometaxReadyUrl(url.toString()), { timeout: 30_000 })

  if (await isHometaxLoggedIn(page, 10_000)) {
    log('existing hometax session is active')
    return 'reused'
  }

  await page.getByRole('link', { name: '공동·금융인증', exact: true }).click({ timeout: 30_000 })
  const frame = await waitForCertificateFrame(page)
  await frame.getByText('인증서 선택창', { exact: true }).waitFor({ timeout: 30_000 })

  let password
  let rows = await waitForCertificateRows(frame, 8_000)
  if (rows.length === 0) {
    password = await readCertificatePassword()
    await importBrowserCertificate(frame, password)
    if (await isHometaxLoggedIn(page, 45_000)) {
      log('hometax login passed after certificate import')
      return 'imported'
    }
    rows = await waitForCertificateRows(frame)
  }

  const selected = selectCorporateCertificate(rows, new Date(), identity.certificateOwnerKeyword)
  await rows[selected.index].locator.click()
  log(`certificate ready: ${selected.owner}`)

  password ||= await readCertificatePassword()
  await frame.locator('input[type="password"]:not([disabled])').first().fill(password, { timeout: 10_000 })
  await frame.getByRole('button', { name: '확인', exact: true }).click({ timeout: 10_000 })

  await page.getByRole('link', { name: '로그아웃', exact: true }).waitFor({ timeout: 45_000 })
  log('hometax login passed')
  return 'logged-in'
}
