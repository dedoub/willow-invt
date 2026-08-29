import type { MetadataRoute } from 'next'

/**
 * 홈 화면에 추가했을 때 브라우저 껍데기 없이 뜨게 한다.
 *
 * 사내 대시보드라 폰에서 여는 일이 잦은데, 사파리 주소창과 탭 바가 세로 공간을
 * 꽤 먹는다. iOS 는 전체화면 API 를 비디오 말고는 안 주므로, 아이폰·아이패드에서
 * 껍데기를 걷는 길은 이 `standalone` 뿐이다.
 *
 * 아이콘은 여기 적지 않는다. `src/app/icon.png` 와 `src/app/apple-icon.png` 가
 * Next.js 규약대로 각각 파비콘과 apple-touch-icon 으로 나가고, iOS 는 어차피
 * manifest 의 icons 를 홈 화면 아이콘으로 쓰지 않는다.
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
    icons: [
      { src: '/icon.png', sizes: '256x256', type: 'image/png' },
    ],
  }
}
