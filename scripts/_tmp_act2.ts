import { config } from 'dotenv'
config({ path: '.env.local' })
async function main() {
  const { getVoicecardsUserStats, getAnonymousEventStats } = await import('../src/lib/voicecards-server')
  const { voicecardsLearningActivationDate } = await import('../src/lib/voicecards-device-journey')
  const [us, anon] = await Promise.all([getVoicecardsUserStats(), getAnonymousEventStats()])
  const kst = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) : ''
  const all = us.users as any[]
  const google = all.filter(u => !u.id.startsWith('device:'))
  const cumulative = anon?.cumulativeDistinct ?? []
  const allDates = cumulative.map(d => d.date)
  const gAct = google.map(u => voicecardsLearningActivationDate(u)).filter(Boolean).map(d => kst(d as string)).sort()
  const linked = google.filter(u => u.hasFolder).map(u => kst(u.createdAt)).sort()
  const pct = (n: number, d: number) => d > 0 ? Math.round(n/d*1000)/10 : 0
  const rows = allDates.map(date => {
    const n = gAct.filter(d => d <= date).length
    const d = linked.filter(x => x <= date).length
    return { date, n, d, pct: pct(n, d) }
  })
  console.log('첫 5일'); rows.slice(0,5).forEach(r=>console.log(r))
  console.log('최대', rows.reduce((m,r)=>r.pct>m.pct?r:m, rows[0]))
  console.log('마지막', rows[rows.length-1])
  console.log('100% 초과 일수', rows.filter(r=>r.pct>100).length, '/', rows.length)
}
main().catch(e=>{console.error(e);process.exit(1)})
