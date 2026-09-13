import assert from 'node:assert/strict'
import test from 'node:test'

import * as umami from '../umami'

test('AI referral visits include only known answer-engine referrers', () => {
  assert.equal(typeof umami.sumAiReferrerVisits, 'function')
  assert.equal(umami.sumAiReferrerVisits([
    { x: 'chatgpt.com', y: 19 },
    { x: 'gemini.google.com', y: 6 },
    { x: 'perplexity.ai', y: 2 },
    { x: 'google.com', y: 130 },
    { x: null, y: 40 },
  ]), 27)
})
