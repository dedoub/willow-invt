import { config } from 'dotenv'
config({ path: '.env.local' })
async function main() {
  const { getVoicecardsUserStats } = await import('../src/lib/voicecards-server')
  const { voicecardsLearningActivationDate } = await import('../src/lib/voicecards-device-journey')
  const us = await getVoicecardsUserStats()
  const all = us.users as any[]
  const google = all.filter(u => !u.id.startsWith('device:'))
  const isIdle = (u: any) => u.sheetCount === 0 && (u.ownCards ?? u.cards) === 0 && (u.flips ?? 0) === 0
  const incomplete = google.filter(isIdle).length
  const linked = google.filter(u => u.hasFolder).length
  const googleActivated = us.totalUsers - incomplete
  const activated = all.filter(u => !!voicecardsLearningActivationDate(u))
  const deviceActivated = activated.filter(u => u.id.startsWith('device:')).length
  console.log('totalUsers(구글로그인 헤드라인)', us.totalUsers, '| users rows', all.length, '| google rows', google.length, '| device rows', all.length - google.length)
  console.log('linkedUsers(드라이브 연동)', linked)
  console.log('incompleteSignups(미활성 구글)', incomplete)
  console.log('googleActivated (= totalUsers - incomplete)', googleActivated)
  console.log('google rows 중 활성', google.filter(u=>!isIdle(u)).length)
  console.log('signedUp(헤드라인 학습활성화)', activated.length, '| 그중 기기계정', deviceActivated)
  console.log('배지 activeRate = googleActivated/linked =', Math.round(googleActivated/linked*100)+'%')
  console.log('deviceAccounts', (us as any).deviceAccounts, 'deviceAccountsActivated', (us as any).deviceAccountsActivated)
  // 연동됐는데 미활성 / 활성인데 미연동
  const linkedIdle = google.filter(u=>u.hasFolder && isIdle(u)).length
  const activeUnlinked = google.filter(u=>!u.hasFolder && !isIdle(u)).length
  console.log('연동O·미활성', linkedIdle, '| 활성·연동X', activeUnlinked)
}
main().catch(e=>{console.error(e);process.exit(1)})
