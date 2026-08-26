import assert from 'node:assert/strict'
import test from 'node:test'
import { withWooriLoopbackPermission } from './woori-browser-profile.mjs'

test('withWooriLoopbackPermission grants only the Woori Bank origin', () => {
  const result = withWooriLoopbackPermission({ profile: {} })

  assert.deepEqual(result.profile.content_settings.exceptions.loopback_network, {
    'https://nbi.wooribank.com:443,*': {
      expiration: '0',
      last_modified: '0',
      model: 0,
      setting: 1,
    },
  })
})

test('withWooriLoopbackPermission preserves existing profile preferences', () => {
  const result = withWooriLoopbackPermission({
    profile: { content_settings: { exceptions: { notifications: { keep: true } } } },
  })

  assert.deepEqual(result.profile.content_settings.exceptions.notifications, { keep: true })
})
