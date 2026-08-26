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

// ML4Web drops a blockUI overlay over the dialog while it loads, and a click
// that lands on the overlay is swallowed rather than queued. A fresh browser
// profile spends longer there because it has no certificate to list.
async function waitForDialogIdle(frame, timeout = 60_000) {
  const deadline = Date.now() + timeout
  let idleRuns = 0
  while (Date.now() < deadline) {
    const busy = await frame.evaluate(() => {
      const shown = element => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }
      return [...document.querySelectorAll('.blockUI, .blockOverlay')].filter(shown).length > 0
    }).catch(() => true)
    // The overlay flickers between loads, so it has to read clear twice running.
    idleRuns = busy ? 0 : idleRuns + 1
    if (idleRuns >= 2) return
    await frame.waitForTimeout(1_000)
  }
  throw new Error('홈택스 인증서 창이 로딩 상태에서 멈췄어요.')
}

// ML4Web draws its dialog inside a jQuery window whose modal layer covers the
// controls, so Playwright refuses an ordinary click as "intercepted". The layer
// is the window's own chrome, not a real blocker, so the click is forced.
async function pressDialogButton(frame, selector) {
  await frame.locator(selector).waitFor({ state: 'visible', timeout: 30_000 })
  await frame.locator(selector).click({ force: true, timeout: 15_000 })
}

async function importBrowserCertificate(frame, password) {
  await waitForDialogIdle(frame).catch(() => {})
  await pressDialogButton(frame, '#in_browser')
  const importPassword = frame.locator('#add_browser_password')
  await importPassword.waitFor({ state: 'visible' })
  // HomeTax attaches the file-change handler after the import dialog animation.
  await frame.waitForTimeout(500)
  await frame.locator('#filefile2').setInputFiles(certificateImportPaths())
  await frame.locator('#file_route2').waitFor({ state: 'visible' })
  await frame.waitForFunction(() => document.querySelector('#file_route2')?.value.includes('signCert.der'))
  await importPassword.fill(password)
  await frame.locator('#browser_save_yn').check({ force: true })
  await pressDialogButton(frame, '#btn_common_confirm:visible')
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

// The full-menu markup carries a hidden 로그아웃 link even when signed out, and
// during a layout pass it can read as visible for a moment. So the check needs
// both halves: a visible 로그아웃 and no visible 로그인 — a signed-out page always
// offers the second.
export async function isHometaxLoggedIn(page, timeout = 8_000) {
  const deadline = Date.now() + timeout
  for (;;) {
    const state = await page.evaluate(() => {
      const visible = element => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }
      const links = [...document.querySelectorAll('a,button')].filter(visible)
        .map(element => (element.innerText || '').trim())
      return {
        loggedOut: links.includes('로그아웃'),
        loggedIn: links.includes('로그인'),
      }
    }).catch(() => null)

    if (state?.loggedOut && !state.loggedIn) return true
    if (Date.now() >= deadline) return false
    await page.waitForTimeout(1_000)
  }
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
  await waitForDialogIdle(frame).catch(() => {})

  // The dialog also offers a 하드디스크 tab that would read NPKI directly, but it
  // only responds to ML4Web's local helper, which is not installed here — the
  // tab does nothing and the list stays empty. So the key pair is imported into
  // the profile, once per profile.
  let rows = await waitForCertificateRows(frame, 10_000)

  let password
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
  await pressDialogButton(frame, '#btn_confirm_iframe')

  await page.getByRole('link', { name: '로그아웃', exact: true }).waitFor({ timeout: 45_000 })
  log('hometax login passed')
  return 'logged-in'
}
