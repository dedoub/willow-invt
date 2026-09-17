/**
 * 첨부 링크를 로그인 뒤로 숨긴다.
 *
 * 예전에는 업로드가 `getPublicUrl()` 을 그대로 저장했다. 공개 버킷의 객체 URL 은
 * 영구하고 인증이 없어서, 링크 한 줄이 새면 그 파일은 영원히 열린다. 노트를 지워도
 * 객체는 남는다. 급여대장·계좌 같은 것이 그 뒤에 있으면 안 된다.
 *
 * 그래서 저장된 URL 이 무엇이든 `/api/files/<버킷>/<경로>` 로 바꿔서 건넨다.
 * 그 라우트가 로그인을 보고 짧은 서명 URL 로 넘긴다. 예전에 저장된 공개 URL 도
 * 같은 길로 들어오므로 DB 를 고칠 필요가 없다.
 */

// 로그인 뒤로 숨기는 버킷. 여기 없는 버킷(아바타 등)은 손대지 않는다.
export const GUARDED_BUCKETS = Object.freeze([
  'wiki-attachments',
  'tensw-project-docs',
  'etf-documents',
  'ceo-docs',
])

export type StorageRef = { bucket: string; path: string }

const OBJECT_URL = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/
const GUARDED_HREF = /^\/api\/files\/([^/?#]+)\/([^?#]+)/

/** 저장된 링크에서 버킷과 경로를 꺼낸다. 형태를 못 알아보면 null. */
export function storageRef(url: string | null | undefined): StorageRef | null {
  if (!url) return null
  const guarded = GUARDED_HREF.exec(url)
  if (guarded) return { bucket: decodeURIComponent(guarded[1]), path: decodeURIComponent(guarded[2]) }
  const object = OBJECT_URL.exec(url)
  if (!object) return null
  return { bucket: decodeURIComponent(object[1]), path: decodeURIComponent(object[2]) }
}

export function guardedHref(ref: StorageRef): string {
  const path = ref.path.split('/').map(encodeURIComponent).join('/')
  return `/api/files/${encodeURIComponent(ref.bucket)}/${path}`
}

/**
 * 첨부 하나를 열 링크. 숨기는 버킷이면 `/api/files/…`, 아니면 원래 URL 그대로.
 * 알아보지 못하는 링크도 그대로 둔다 — 외부 링크를 첨부에 적어 둔 노트가 있다.
 */
export function attachmentHref(url: string | null | undefined): string {
  const ref = storageRef(url)
  if (!ref || !GUARDED_BUCKETS.includes(ref.bucket)) return url ?? ''
  return guardedHref(ref)
}
