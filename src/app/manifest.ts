import type { MetadataRoute } from 'next'

/**
 * 홈 화면에 추가했을 때 브라우저 껍데기 없이 뜨게 한다.
 *
 * 사내 대시보드라 폰에서 여는 일이 잦은데, 사파리 주소창과 탭 바가 세로 공간을
 * 꽤 먹는다. iOS 는 전체화면 API 를 비디오 말고는 안 주므로, 아이폰·아이패드에서
 * 껍데기를 걷는 길은 이 `standalone` 뿐이다.
 *
 * iOS 는 manifest 의 icons 를 홈 화면 아이콘으로 쓰지 않는다 — 그 자리는
 * `src/app/apple-icon.png` 다. 아래 icons 는 안드로이드·데스크톱이 본다.
 *
 * `start_url` 은 루트가 아니라 `/mgmt` 다 — 루트(`page.tsx`)가 어차피 거기로
 * 리다이렉트하므로, 설치한 앱을 열 때 한 번 튀는 것을 없앤다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Willow Investments',
    short_name: 'Willow',
    description: '윌로우인베스트먼트 사내 대시보드',
    start_url: '/mgmt',
    display: 'standalone',
    background_color: '#FAF9F6',
    theme_color: '#87CEEB',
    // 256 하나로는 부족하다. 설치 창과 스플래시는 512 를 찾는데, 없으면
    // 256 을 늘려 그려서 뭉갠다. 파비콘은 64 가 최대라 더 나쁘다.
    //
    // 그래서 `public/icon.svg` 를 뒀다 — 새 로고가 아니라 `src/app/icon.png`
    // 에서 <b>재어</b> 낸 같은 잎이다(반지름 167.13 인 두 원의 교집합).
    // 여기 PNG 들은 전부 그 벡터에서 나왔으므로 어느 크기에서도 선명하다.
    //
    // `maskable` 은 안드로이드가 원·스퀘어클로 잘라내는 판본이다. 안전지대가
    // 가운데 80% 원이라 잎을 68% 로 줄이고 모서리까지 배경을 채운다.
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
