/**
 * 앱 코드가 쓰는 입구. 실제 구현은 `credit-rates-data.ts` 에 있다 —
 * 주간 감사 스크립트가 Next 밖에서 같은 코드를 읽어야 해서 갈라 뒀다.
 * 여기 `server-only` 가 있어 클라이언트 컴포넌트가 import 하면 빌드가 깨진다.
 */
import 'server-only'

export * from '@/lib/credit-rates-data'
