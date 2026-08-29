import type { Metadata } from 'next'
import { findNavItem } from '@/app/(dashboard)/_components/linear-nav'

/**
 * 탭 제목은 사이드바 라벨을 그대로 쓴다. linear-nav.ts 가 메뉴의 단일 진실원이므로
 * 메뉴 이름을 바꾸면 탭 제목도 따라온다 — 예전에 레이아웃이 제목을 따로 들고 있다가
 * 사이드바와 갈라졌던 전례가 있다(linear-nav.ts 머리말).
 *
 * 회사 이름은 붙이지 않는다. 루트 레이아웃의 template 이 "· Willow Investments" 를
 * 뒤에 단다.
 */
export function navMetadata(href: string): Metadata {
  const hit = findNavItem(href)
  // 경로가 사이드바에서 사라지면 빌드가 아니라 화면에서 알게 되는 편이 낫지 않다.
  // 여기서 바로 터뜨려 이름이 갈라진 채로 배포되지 않게 한다.
  if (!hit) throw new Error(`사이드바에 없는 경로라 탭 제목을 정할 수 없어요: ${href}`)
  return { title: hit.item.label }
}
