import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { getGmailClient, createMimeMessage } from '@/lib/gmail-server'

const REMINDER_EMAIL = process.env.RYUHA_REMINDER_EMAIL || ''

export async function POST(request: Request) {
  try {
    // API 키 검증 (cron job에서 호출 시)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!REMINDER_EMAIL) {
      return NextResponse.json({ error: 'RYUHA_REMINDER_EMAIL not configured' }, { status: 500 })
    }

    const supabase = getServiceSupabase()
    const today = new Date().toISOString().split('T')[0]

    // 오늘 날짜의 미완료 스케줄 중 이메일 알림이 활성화되고 아직 발송되지 않은 것
    const { data: schedules, error } = await supabase
      .from('ryuha_schedules')
      .select('*')
      .eq('schedule_date', today)
      .eq('email_reminder', true)
      .eq('reminder_sent', false)
      .eq('is_completed', false)

    if (error) throw error

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ message: 'No reminders to send', count: 0 })
    }

    // Gmail 클라이언트 가져오기
    const gmail = await getGmailClient()

    if (!gmail) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 500 })
    }

    // 발신자 이메일 조회
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const from = profile.data.emailAddress

    let sentCount = 0

    for (const schedule of schedules) {
      const subject = `[류하 학습] 오늘 할 일: ${schedule.title}`
      const timeInfo = schedule.start_time ? `${schedule.start_time.slice(0, 5)}` : '시간 미정'
      const typeLabel = schedule.type === 'homework' ? '학원숙제' : '자기학습'

      const body = `
안녕하세요, 류하!

오늘의 학습 일정을 알려드립니다.

📚 제목: ${schedule.title}
⏰ 시간: ${timeInfo}
🏷️ 유형: ${typeLabel}
${schedule.description ? `\n📝 메모: ${schedule.description}` : ''}

오늘도 화이팅! 💪
      `.trim()

      const bodyHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #22c55e; margin-bottom: 20px;">📚 오늘의 학습 일정</h2>

  <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
    <h3 style="margin: 0 0 16px 0; color: #1e293b;">${schedule.title}</h3>

    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #64748b; width: 80px;">시간</td>
        <td style="padding: 8px 0; color: #1e293b;">${timeInfo}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b;">유형</td>
        <td style="padding: 8px 0;">
          <span style="background: ${schedule.type === 'homework' ? '#fef3c7' : '#dbeafe'}; color: ${schedule.type === 'homework' ? '#92400e' : '#1e40af'}; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
            ${typeLabel}
          </span>
        </td>
      </tr>
    </table>

    ${schedule.description ? `
    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
      <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">메모</div>
      <div style="color: #1e293b;">${schedule.description}</div>
    </div>
    ` : ''}
  </div>

  <p style="color: #64748b; text-align: center;">오늘도 화이팅! 💪</p>
</div>
      `.trim()

      try {
        const raw = createMimeMessage({
          to: REMINDER_EMAIL,
          subject,
          body,
          bodyHtml,
          from: from || undefined,
        })

        await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw },
        })

        // 발송 완료 표시
        await supabase
          .from('ryuha_schedules')
          .update({ reminder_sent: true })
          .eq('id', schedule.id)

        sentCount++
      } catch (sendError) {
        console.error(`Failed to send reminder for schedule ${schedule.id}:`, sendError)
      }
    }

    return NextResponse.json({
      message: `Sent ${sentCount} reminders`,
      count: sentCount,
      total: schedules.length
    })
  } catch (error) {
    console.error('Error sending reminders:', error)
    return NextResponse.json({ error: 'Failed to send reminders' }, { status: 500 })
  }
}

// GET 메서드도 지원 (브라우저에서 테스트용)
export async function GET(request: Request) {
  return POST(request)
}
