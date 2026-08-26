import assert from 'node:assert/strict'
import test from 'node:test'
import {
  anchoredPoint,
  buttonPoint,
  certificateRowPoint,
  clickPlan,
  countColumnClusters,
  countMaskGlyphs,
  findOcrText,
  maskedLengthMatches,
  parseNativeWindows,
  textCenter,
  windowRect,
  withinRect,
} from './cert-dialog.mjs'
import { CERT_MECHANISMS, CERT_SITES, certSite, certSiteRegistry, splitBusinessNumber } from './cert-sites.mjs'

// Read off a real 우리카드 dialog capture so the fixtures stay honest.
const CARD_DIALOG = [
  { text: '인증서 저장 위치를 선택해 주세요', x: 742, y: 366, w: 181, h: 14 },
  { text: '하드디스크.', x: 753, y: 444, w: 73, h: 20 },
  { text: '이동식', x: 851, y: 444, w: 39, h: 14 },
  { text: '사용할 인증서를 선택해 주세요', x: 740, y: 480, w: 170, h: 17 },
  { text: 'e 범용(기업)', x: 748, y: 535, w: 73, h: 18 },
  { text: '윌로우인베스트먼트((Bi... 2027-05-08', x: 834, y: 538, w: 209, h: 14 },
  { text: 'e 범용(기업) 주식회사 텐소프트웍스... 2028-05-', x: 748, y: 567, w: 296, h: 17 },
  { text: '인증서 암호를 입력해 주세요', x: 742, y: 681, w: 153, h: 14 },
  { text: '확인', x: 893, y: 812, w: 25, h: 17 },
  { text: '취소', x: 1002, y: 812, w: 25, h: 17 },
  // Chrome's own page behind the dialog.
  { text: '취소', x: 300, y: 900, w: 25, h: 17 },
]

const CARD_WINDOW = { name: 'Form', x: 729, y: 215, w: 462, h: 650 }

test('textCenter returns the clickable middle of an OCR box', () => {
  assert.deepEqual(textCenter({ x: 893, y: 812, w: 25, h: 17 }), { x: 906, y: 821 })
})

test('withinRect keeps only elements inside the dialog window', () => {
  const rect = windowRect(CARD_WINDOW)
  assert.equal(withinRect({ x: 893, y: 812, w: 25, h: 17 }, rect), true)
  assert.equal(withinRect({ x: 300, y: 900, w: 25, h: 17 }, rect), false)
})

test('buttonPoint ignores an identically labelled control outside the dialog', () => {
  const within = windowRect(CARD_WINDOW)
  assert.deepEqual(buttonPoint(CARD_DIALOG, '취소', { within }), { x: 1015, y: 821 })
})

test('findOcrText prefers the tightest match over a longer guidance line', () => {
  const items = [
    { text: '인증서 암호를 입력하십시오.', x: 893, y: 435, w: 167, h: 17 },
    { text: '인증서 암호', x: 893, y: 463, w: 70, h: 17 },
  ]
  assert.equal(findOcrText(items, '인증서 암호').y, 463)
})

test('anchoredPoint resolves the unreadable password field from its label', () => {
  const within = windowRect(CARD_WINDOW)
  assert.deepEqual(
    anchoredPoint(CARD_DIALOG, { anchor: '인증서 암호', dx: 196, dy: 46 }, { within }),
    { x: 938, y: 727 },
  )
})

test('certificateRowPoint selects the row by owner, not by position', () => {
  const within = windowRect(CARD_WINDOW)
  const point = certificateRowPoint(CARD_DIALOG, '텐소', { within })
  assert.equal(point.y, 576)
  assert.notEqual(point.y, 545)
})

test('certificateRowPoint refuses to guess when the owner matches twice', () => {
  const rows = [
    { text: '주식회사 텐소프트웍스 2028-05-19', x: 748, y: 567, w: 296, h: 17 },
    { text: '주식회사 텐소프트웍스 2029-05-19', x: 748, y: 597, w: 296, h: 17 },
  ]
  assert.throws(() => certificateRowPoint(rows, '텐소'), /2건/)
})

test('certificateRowPoint fails loudly when the owner is absent', () => {
  assert.throws(() => certificateRowPoint(CARD_DIALOG, '없는회사'), /찾지 못했어요/)
})

test('clickPlan spends one throwaway click only when the window is not key', () => {
  const point = { x: 10, y: 20 }
  assert.deepEqual(clickPlan(point, { windowIsKey: true }), [point])
  assert.deepEqual(clickPlan(point, { windowIsKey: false }), [point, point])
})

test('parseNativeWindows reads the System Events window dump', () => {
  const output = 'Virtual Key\t650\t398\t620\t284\nForm\t729\t215\t462\t650\n'
  assert.deepEqual(parseNativeWindows(output), [
    { name: 'Virtual Key', x: 650, y: 398, w: 620, h: 284 },
    { name: 'Form', x: 729, y: 215, w: 462, h: 650 },
  ])
})

test('parseNativeWindows keeps an alert panel that has no window name', () => {
  const output = '\t825\t156\t260\t243\n인증서선택\t759\t90\t402\t541\n'
  assert.deepEqual(parseNativeWindows(output), [
    { name: '', x: 825, y: 156, w: 260, h: 243 },
    { name: '인증서선택', x: 759, y: 90, w: 402, h: 541 },
  ])
})

test('parseNativeWindows returns nothing when the process has no windows', () => {
  assert.deepEqual(parseNativeWindows(''), [])
})

test('countColumnClusters groups adjacent dark columns into one glyph', () => {
  assert.equal(countColumnClusters([10, 11, 12, 20, 21, 30]), 3)
  assert.equal(countColumnClusters([]), 0)
})

test('countMaskGlyphs counts the dots typed into a password field', () => {
  const width = 40
  const height = 12
  const rgb = Buffer.alloc(width * height * 3, 255)
  const paintDot = column => {
    for (let y = 4; y <= 7; y += 1) {
      for (let x = column; x < column + 3; x += 1) {
        const offset = (y * width + x) * 3
        rgb[offset] = 20
        rgb[offset + 1] = 20
        rgb[offset + 2] = 20
      }
    }
  }
  for (const column of [5, 12, 19, 26]) paintDot(column)
  assert.equal(countMaskGlyphs(rgb, { x: 0, y: 0, w: width, h: height }, width), 4)
})

test('maskedLengthMatches rejects a short or unreadable field', () => {
  assert.equal(maskedLengthMatches(8, 8), true)
  assert.equal(maskedLengthMatches(8, 7), false)
  assert.equal(maskedLengthMatches(8, Number.NaN), false)
})

test('every registered site declares a URL, and a mechanism once it is ready', () => {
  for (const site of Object.values(CERT_SITES)) {
    assert.match(site.url, /^https:\/\//)
    assert.equal(site.id, Object.keys(CERT_SITES).find(key => CERT_SITES[key] === site))
    if (site.ready) {
      assert.ok(CERT_MECHANISMS.includes(site.mechanism), `${site.id}: ${site.mechanism}`)
      continue
    }
    // A site whose dialog has not been observed must say so rather than carry a
    // guessed mechanism — guessing is how a certificate gets locked out.
    assert.equal(site.mechanism, null, `${site.id} is not ready but names a mechanism`)
    assert.ok(site.reason, `${site.id} must say why it is not ready`)
  }
})

test('a site naming its native process also names the window to look for', () => {
  for (const site of Object.values(CERT_SITES)) {
    if (!site.ready) continue
    if (site.mechanism === 'browser-dom' || site.mechanism === 'inpage-type') continue
    if (!site.process) {
      // Only the pre-OCR 우리은행 decoder may skip it, and it says so.
      assert.equal(site.legacy, true, `${site.id} must declare a process or be legacy`)
      continue
    }
    assert.ok(site.window, `${site.id} window`)
  }
})

test('typed native sites carry every control the driver resolves', () => {
  for (const site of Object.values(CERT_SITES)) {
    if (site.mechanism !== 'native-type') continue
    assert.ok(site.trigger?.value, `${site.id} trigger`)
    assert.ok(site.storageTab, `${site.id} storageTab`)
    assert.ok(site.passwordField?.anchor, `${site.id} passwordField`)
    assert.ok(site.confirm && site.cancel, `${site.id} buttons`)
    assert.ok(Number.isFinite(site.maskRect?.dx) && site.maskRect.w > 0, `${site.id} maskRect`)
  }
})

test('certSiteRegistry reports readiness for the pipeline coverage check', () => {
  const registry = certSiteRegistry()
  assert.equal(registry.hometax.ready, true)
  assert.equal(registry.nhis.ready, true)
  assert.equal(registry['woori-card'].ready, true)
  for (const entry of Object.values(registry)) {
    if (!entry.ready) assert.ok(entry.reason, '준비되지 않은 사이트는 이유를 남겨야 해요')
  }
})

test('certSite rejects an unknown site instead of returning undefined', () => {
  assert.throws(() => certSite('hana-card'), /등록되지 않은/)
  // kb-card is registered but not driveable yet; it still resolves.
  assert.equal(certSite('kb-card').ready, false)
})

test('splitBusinessNumber splits the number the way the portal asks for it', () => {
  assert.deepEqual(splitBusinessNumber('828-88-00992'), ['828', '88', '00992'])
  assert.deepEqual(splitBusinessNumber('8288800992'), ['828', '88', '00992'])
  assert.throws(() => splitBusinessNumber('82888'), /10자리/)
})
