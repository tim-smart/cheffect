# Recipe Step Timers

## Overview

Add in-recipe timers by parsing recipe step text for durations and turning them into clickable links that start timers. Active timers appear as circular progress indicators next to the AI chat floating action button.

## Requirements

### Functional

- Parse durations embedded in recipe step text and render them as clickable UI elements.
- Supported duration formats include:
  - Numeric values with units: seconds/sec/s, minutes/min/m, hours/hr/h (singular or plural).
  - Combined hours and minutes like "1 hr 30 min" (single timer with total duration).
  - Ranges like "3-4 minutes" (use the upper bound for duration; keep the original text for display).
  - Optional qualifiers such as "about" or "~" are ignored when parsing.
- Multiple durations in a single step each become clickable links and can start independent timers.
- Clicking a duration starts a timer immediately; multiple timers can run simultaneously, including duplicates.
- Active timers display as circular progress indicators next to the AI chat button; each circle shows remaining time via tooltip/label and is tappable to cancel or dismiss.
- Timer circles remain until dismissed; completed timers do not auto-dismiss.
- Show timers globally (not per-recipe); include recipe title in labels when available.
- Timer completion triggers a toast notification and optional haptic/vibration feedback when supported.
- Timers are stored in LiveStore and persist locally across reloads until dismissed; they are not synced across devices.
- Parsing is English-only for now; non-English units are not recognized.

### Non-functional

- Preserve existing step selection and scroll behavior; starting a timer must not change the selected step.
- Timer updates are lightweight (single global tick; current `nowAtom` cadence is 250ms, but derived UI should avoid heavy work per tick).
- UI works on mobile and desktop, respects safe-area insets, and does not overlap the bottom nav.
- Accessibility: duration links are keyboard focusable with clear aria labels; timer circles are labeled and announce completion to screen readers.
- Very short durations (<= 5 seconds) still render and start timers; they should still show in the dock until dismissed.

## Design

### Data model

- Use the existing `Timer` model in `src/domain/Timer.ts` and the `timers` table in `src/livestore/schema.ts`:
  - id: string
  - label: string (for example, "Step 3: 20 min")
  - duration: Duration (stored as millis)
  - expiresAt: DateTimeUtc (stored as number)
  - pausedRemaining: Duration | null
  - dismissed: boolean
  - createdAt: DateTimeUtc
  - updatedAt: DateTimeUtc
- Timer state is derived, not stored:
  - running: `pausedRemaining === null && remainingAt(now) > 0`
  - paused: `pausedRemaining !== null`
  - complete: `remainingAt(now) === 0`
- Derived values: remainingMs, progress (0..1), formattedRemaining.

### Timer state integration

- Keep using LiveStore timers state and events (`events.timerAdded`, `events.timerUpdate`, `events.timerDeleted`).
- Use `src/Timers/atoms.ts` for the existing React adapter (`activeTimersAtom`, `toggleTimerAtom`, `dismissTimerAtom`).
- Use the existing `nowAtom` in `src/atoms.ts` (currently ticking every 250ms); do not add a new ticking atom.
- Add lightweight derived selectors in `src/Timers/atoms.ts` or `TimerList` for running/paused/completed timers and progress math.

### Duration parsing and rendering

- Create a helper in `src/lib/stepDurations.ts` to:
  - Parse step text into segments: { type: "text" | "duration", text, durationMs }.
  - Normalize units and convert to milliseconds.
  - Handle ranges and combined hour+minute phrases.
  - Treat en dash ranges ("10–12 min") like hyphen ranges.
- In `src/routes/recipes/$id.tsx`, render `step.text` via a renderStepText helper:
  - Wrap duration segments in a button or link-styled element.
  - On click, call startTimerAtom with durationMs and label.
  - Stop propagation so clicking a duration does not toggle the step selection.
  - Ignore duration parsing inside existing links (if step text includes URLs).

### Timer dock UI

- Build on the existing `TimerList`/`TimerCircle` component in `src/Timers/TimerList.tsx` (currently TODO).
- Render the timer dock alongside the AI chat floating button:
  - Anchor using the same fixed right-4 + floating-b positioning.
  - Layout timers as small circular progress rings to the left of the chat button, wrapping if needed.
  - Use SVG or conic-gradient to show progress; optionally show remaining time in the center.
  - Tooltip or long-press shows full label and remaining time.
  - Clicking a circle pauses/resumes running timers or dismisses completed timers using `toggleTimerAtom` and `dismissTimerAtom`.
  - If more than 4 timers are active, collapse extras into a "+N" indicator.

### Notifications

- On completion, show a sonner toast "Timer finished: <label>" with a dismiss action (multiple simultaneous completions should stack).
- Trigger navigator.vibrate(200) when available.
- Completion detection is edge-triggered based on existing timer rows: when `remainingAt(now)` transitions from >0 to 0 for a timer that was previously running.

## Acceptance Criteria

- Recipe step durations render as clickable, link-styled elements without breaking step selection.
- Clicking a duration starts a timer and immediately shows a progress circle next to the AI chat button.
- Multiple timers can run simultaneously and update once per second.
- Timer completion shows a toast and marks the circle as complete until dismissed.
- The timer dock respects safe-area and bottom navigation on mobile and desktop.
- All new interactive elements are keyboard accessible with appropriate aria labels.
