import fs from 'node:fs/promises'
import path from 'node:path'

const WOORI_PATTERN = 'https://nbi.wooribank.com:443,*'

export function withWooriLoopbackPermission(preferences) {
  const result = structuredClone(preferences)
  result.profile ||= {}
  result.profile.content_settings ||= {}
  result.profile.content_settings.exceptions ||= {}
  result.profile.content_settings.exceptions.loopback_network ||= {}
  result.profile.content_settings.exceptions.loopback_network[WOORI_PATTERN] = {
    expiration: '0',
    last_modified: '0',
    model: 0,
    setting: 1,
  }
  return result
}

export async function ensureWooriLoopbackPermission(profileDir) {
  const preferencesPath = path.join(profileDir, 'Default', 'Preferences')
  let preferences = {}
  try {
    preferences = JSON.parse(await fs.readFile(preferencesPath, 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    await fs.mkdir(path.dirname(preferencesPath), { recursive: true })
  }

  const next = withWooriLoopbackPermission(preferences)
  const temporaryPath = `${preferencesPath}.tmp`
  await fs.writeFile(temporaryPath, JSON.stringify(next), { mode: 0o600 })
  await fs.rename(temporaryPath, preferencesPath)
}
