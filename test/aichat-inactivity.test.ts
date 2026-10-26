import { test } from "node:test"
import * as assert from "node:assert/strict"
import { isInactive, lastActiveAt } from "@/AiChat/Inactivity"

// A chat goes inactive an hour after it was last used. A message sent to an
// inactive chat starts a fresh one; resuming first continues the old one.

const minute = 60 * 1000
const lastTurnAt = Date.UTC(2026, 9, 26, 9, 0)

test("a chat goes inactive once an hour has passed since its latest turn", () => {
  const lastActive = lastActiveAt({ lastTurnAt, resumedAt: undefined })
  assert.equal(isInactive(lastActive, lastTurnAt + 60 * minute - 1), false)
  assert.equal(isInactive(lastActive, lastTurnAt + 60 * minute), true)
  // An empty chat has nothing to set aside.
  const empty = lastActiveAt({ lastTurnAt: undefined, resumedAt: undefined })
  assert.equal(isInactive(empty, lastTurnAt + 600 * minute), false)
})

test("a resumed chat continues, one that wasn't starts fresh", () => {
  const sentAt = lastTurnAt + 3 * 60 * minute
  const resumed = lastActiveAt({ lastTurnAt, resumedAt: sentAt - minute })
  assert.equal(isInactive(resumed, sentAt), false)
  const notResumed = lastActiveAt({ lastTurnAt, resumedAt: undefined })
  assert.equal(isInactive(notResumed, sentAt), true)
  // A resume left unused lapses like a turn does.
  assert.equal(isInactive(resumed, sentAt + 60 * minute), true)
})
