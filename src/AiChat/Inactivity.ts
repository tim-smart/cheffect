import * as Duration from "effect/Duration"

// A chat left alone for an hour is put aside: it fades, and the next message
// starts a fresh chat unless it's resumed first. Times are epoch millis.

export const inactiveAfter = Duration.hours(1)

// When the chat was last used on this device: its latest turn, from any
// device, or a resume since. An empty chat has never been used.
export const lastActiveAt = (options: {
  readonly lastTurnAt: number | undefined
  readonly resumedAt: number | undefined
}): number | undefined =>
  options.lastTurnAt === undefined
    ? undefined
    : Math.max(options.lastTurnAt, options.resumedAt ?? options.lastTurnAt)

// When a chat last used at `lastActive` goes inactive.
export const inactiveAt = (lastActive: number): number =>
  lastActive + Duration.toMillis(inactiveAfter)

export const isInactive = (
  lastActive: number | undefined,
  now: number,
): boolean => lastActive !== undefined && now >= inactiveAt(lastActive)
