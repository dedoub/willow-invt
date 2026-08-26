// One entry per site a company certificate logs into. The mechanism is not a
// guess: each was probed by opening the real certificate dialog and observing
// which process owns the window and whether synthetic keystrokes reach the
// password field (2026-08-25 for the six 텐소프트웍스 sites).
//
//   browser-dom   the dialog is part of the page and Playwright may drive it
//   inpage-type   the dialog is part of the page but the module only trusts the
//                 default browser, and its password box only takes keystrokes
//   native-type   an opaque native window, but typed keystrokes reach the field
//   native-keypad an opaque native window that forces its own on-screen keypad
//
// Each company signs every one of its sites with a single key, found under
// ~/Library/Preferences/NPKI by certificateImportPaths:
//   텐소프트웍스  TradeSign 범용(법인)
//   윌로우인베스트먼트  SignKorea BizBank(법인)
//
// 홈택스 · 위택스 · 사회보험 are shared by both companies; the driver picks the
// certificate row by the owner keyword in the company registry. 신한은행 is
// 텐소's second bank and 윌로우's only one.

export const CERT_MECHANISMS = Object.freeze(['browser-dom', 'inpage-type', 'native-type', 'native-keypad'])

export const CERT_SITES = Object.freeze({
  hometax: Object.freeze({
    id: 'hometax',
    label: '홈택스',
    mechanism: 'browser-dom',
    url: 'https://www.hometax.go.kr/',
    module: 'MagicLine ML4Web',
    runner: 'scripts/tensw-local-finance-poc.mjs',
    ready: true,
  }),

  'woori-bank': Object.freeze({
    id: 'woori-bank',
    label: '우리은행',
    mechanism: 'native-keypad',
    url: 'https://nbi.wooribank.com/nbi/woori?withyou=BISVC0030',
    module: 'INISAFE CrossWeb EX',
    runner: 'scripts/woori-bank-default-chrome-poc.mjs',
    // Driven by its own pixel-grid decoder from before the OCR driver existed;
    // its native window was never probed, so it is not migrated yet. It shares
    // the move-settle-click fix, without which it drops most of the password.
    legacy: true,
    ready: true,
  }),

  'shinhan-bank': Object.freeze({
    id: 'shinhan-bank',
    label: '신한은행 기업뱅킹',
    mechanism: 'native-type',
    url: 'https://bizbank.shinhan.com/index.jsp',
    module: 'INISAFE CrossWeb EX',
    process: 'INISAFECrossWebEXSvc',
    window: '인증서선택',
    // Clicked in the page to raise the native dialog.
    trigger: { kind: 'element-id', value: 'mf_wfm_main_btn_goCert' },
    storageTab: '하드디스크',
    // The field itself carries no text, so it is addressed from its label, and
    // the masking dots are counted in a band measured inside the field box.
    passwordField: { anchor: '인증서 암호', dx: 142, dy: 10 },
    maskRect: { dx: -60, dy: -7, w: 125, h: 14 },
    // The box is ~125pt wide and draws one dot per ~12.5pt, so it fills at ten
    // and anything past that is not drawn. Measured 2026-08-26: 5→5, 8→8,
    // 10→10, 11→10, 16→10. 텐소's password is ten characters and verifies
    // exactly; 윌로우's is eleven and can only be checked up to the tenth.
    maskCapacity: 10,
    confirm: '확인',
    cancel: '취소',
    loggedOutMarker: '기업인터넷뱅킹',
    ready: true,
  }),

  'woori-card': Object.freeze({
    id: 'woori-card',
    label: '우리카드',
    // Same signing app and geometry as 위택스, but it pops a Virtual Key keypad
    // on focus that swallows both typed keystrokes and pastes, so this is the
    // one site that has to click the password in on the keypad itself.
    mechanism: 'native-keypad',
    url: 'https://pc.wooricard.com/dcpc/yh2/bcv/bcv04/apvhisinq/H2BCV204S01.do',
    module: 'bizapp 전자 서명 작성 2.2.0.3110',
    process: 'bizapp',
    window: 'Form',
    keypadWindow: 'Virtual Key',
    passwordField: { anchor: '인증서 암호', dx: 196, dy: 46 },
    maskRect: { dx: -176, dy: -8, w: 186, h: 16 },
    runner: 'scripts/woori-card-certificate-login.mjs',
    ready: true,
  }),

  wetax: Object.freeze({
    id: 'wetax',
    label: '위택스',
    mechanism: 'native-type',
    url: 'https://www.wetax.go.kr/login.do',
    // Same signing app as 우리카드, but it does not force the keypad here.
    module: 'bizapp 전자 서명 작성 2.2.0.3110',
    process: 'bizapp',
    window: 'Form',
    trigger: { kind: 'element-id', value: 'btnCertLogin' },
    storageTab: '하드디스크',
    passwordField: { anchor: '인증서 암호', dx: 196, dy: 46 },
    maskRect: { dx: -176, dy: -8, w: 186, h: 16 },
    confirm: '확인',
    cancel: '취소',
    loggedOutMarker: '로그인',
    ready: true,
  }),

  'kb-card': Object.freeze({
    id: 'kb-card',
    label: 'KB국민카드 기업',
    // Not probed yet: WIZVERA Delfino is a launcher that loads the signing
    // module, and which window ends up owning the password box is exactly the
    // thing that has to be observed rather than assumed.
    mechanism: null,
    url: 'https://biz.kbcard.com/CXERCZZC0001.cms',
    module: 'WIZVERA Delfino',
    // 공동인증서 tab, then 로그인; the button runs
    // Delfino.setModule(DelfinoConfig.module); doCertLoginA().
    certTrigger: '공동인증서',
    form: Object.freeze({
      id: 'login',
      action: '/CXORMPIC0001.cms',
      // doCertLoginA fills these from the Delfino callback.
      signature: 'PKCS7',
      vidRandom: 'VID_RANDOM',
      idField: '기업인터넷서비스로그인ID',
      passwordField: 'loginPwdBiz',
    }),
    ready: false,
    // KB requires the 사업자용 공동인증서 to be registered on the site once before
    // certificate login works at all, and that registration needs an ID/PW
    // session we do not hold.
    reason: '공동인증서 사전등록 필요 · Delfino 인증창 미확인',
  }),

  nhis: Object.freeze({
    id: 'nhis',
    label: '사회보험통합징수포털',
    // The portal offers two certificate logins, both AnySign in the page. The
    // 브라우저 인증서 route hands the password box to a TouchEn transKey keypad
    // that reopens on every focus, so the 구 공인인증서 route with the 하드디스크
    // tab is used instead. Every page load also raises a phishing-warning alert,
    // and AnySign refuses a Playwright-launched Chrome, so this runs in the
    // default browser with the structure driven through the DOM.
    mechanism: 'inpage-type',
    url: 'https://si4n.nhis.or.kr/jpba/JpBaa00101.do',
    module: 'AnySign (xwup)',
    runner: 'scripts/login-nhis-si4n.mjs',
    businessNumberFields: ['txtRegNo1', 'txtRegNo2', 'txtRegNo3'],
    certTrigger: '공동인증서 로그인',
    selectors: Object.freeze({
      browserTab: '#xwup_media_localstorage',
      hardDiskTab: '#xwup_media_hdd',
      // AnySign shows a different box per route: lite for 브라우저 인증서, tek for
      // 공동인증서. Whichever is visible is the live one.
      password: '#xwup_certselect_tek_input1, #xwup_certselect_lite_input1',
      confirm: '#xwup_OkButton',
      cancel: '#xwup_CancelButton',
      keyboardSecurity: '#nxKeyYn',
    }),
    ready: true,
  }),
})

export function certSite(id) {
  const site = CERT_SITES[id]
  if (!site) throw new Error(`등록되지 않은 인증 사이트예요: ${id}`)
  return site
}

export function certSiteRegistry() {
  return Object.fromEntries(Object.values(CERT_SITES)
    .map(site => [site.id, { ready: site.ready, reason: site.reason }]))
}

export function nativeCertSites() {
  return Object.values(CERT_SITES).filter(site => site.mechanism !== 'browser-dom')
}

export function typedCertSites() {
  return Object.values(CERT_SITES).filter(site => site.mechanism === 'native-type')
}

export function splitBusinessNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length !== 10) {
    throw new Error(`사업자등록번호는 숫자 10자리여야 해요: ${digits.length}자리`)
  }
  return [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5)]
}
