import { redirect } from 'next/navigation'

// MonoR Apps 페이지는 VoiceCards / ReviewNotes 독립 페이지로 분리됨 (2026-07-26).
// 기존 /monor 북마크는 VoiceCards로 보낸다.
export default function MonorPage() {
  redirect('/voicecards')
}
