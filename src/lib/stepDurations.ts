export type StepDurationSegment =
  | {
      type: "text"
      text: string
    }
  | {
      type: "duration"
      text: string
      durationMs: number
    }

const qualifierPattern = "(?:about|~)\\s*"
const numberPattern = "\\d+(?:\\.\\d+)?"
const hourUnitPattern = "(?:hours?|hrs?|hr|h)\\b"
const minuteUnitPattern = "(?:minutes?|mins?|min|m)\\b"
const secondUnitPattern = "(?:seconds?|secs?|sec|s)\\b"
const unitPattern = `(?:${hourUnitPattern}|${minuteUnitPattern}|${secondUnitPattern})`
const rangeSeparatorPattern = "(?:-|–|\\bto\\b)"

const durationRegex = new RegExp(
  `(?:${qualifierPattern})?(?:` +
    `(?<hoursValue>${numberPattern})\\s*${hourUnitPattern}\\s*(?<minutesValue>${numberPattern})\\s*${minuteUnitPattern}` +
    `|(?<rangeStart>${numberPattern})\\s*${rangeSeparatorPattern}\\s*(?<rangeEnd>${numberPattern})\\s*(?<rangeUnit>${unitPattern})` +
    `|(?<value>${numberPattern})\\s*(?<unit>${unitPattern})` +
    `)`,
  "gi",
)

const urlRegex = /https?:\/\/\S+|www\.\S+/gi

export const parseStepDurations = (text: string): StepDurationSegment[] => {
  const segments: StepDurationSegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(urlRegex)) {
    const matchIndex = match.index ?? 0
    const beforeUrl = text.slice(lastIndex, matchIndex)
    if (beforeUrl) {
      segments.push(...parseDurationSegments(beforeUrl))
    }

    const urlText = match[0]
    if (urlText) {
      segments.push({ type: "text", text: urlText })
    }

    lastIndex = matchIndex + urlText.length
  }

  const remaining = text.slice(lastIndex)
  if (remaining) {
    segments.push(...parseDurationSegments(remaining))
  }

  return segments
}

const parseDurationSegments = (text: string): StepDurationSegment[] => {
  const segments: StepDurationSegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(durationRegex)) {
    const matchIndex = match.index ?? 0
    if (matchIndex > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, matchIndex) })
    }

    const matchedText = match[0]
    const durationMs = parseDurationMs(match.groups)
    if (durationMs !== null) {
      segments.push({ type: "duration", text: matchedText, durationMs })
    } else if (matchedText) {
      segments.push({ type: "text", text: matchedText })
    }

    lastIndex = matchIndex + matchedText.length
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) })
  }

  return segments
}

const parseDurationMs = (
  groups?: Record<string, string | undefined>,
): number | null => {
  if (!groups) {
    return null
  }

  if (groups.hoursValue && groups.minutesValue) {
    const hours = Number.parseFloat(groups.hoursValue)
    const minutes = Number.parseFloat(groups.minutesValue)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null
    }
    return (hours * 60 + minutes) * 60 * 1000
  }

  if (groups.rangeStart && groups.rangeUnit) {
    const rangeStart = Number.parseFloat(groups.rangeStart)
    if (Number.isNaN(rangeStart)) {
      return null
    }
    return rangeStart * unitToMs(groups.rangeUnit)
  }

  if (groups.value && groups.unit) {
    const value = Number.parseFloat(groups.value)
    if (Number.isNaN(value)) {
      return null
    }
    return value * unitToMs(groups.unit)
  }

  return null
}

const unitToMs = (unit: string): number => {
  const normalized = unit.toLowerCase()
  if (normalized.startsWith("h")) {
    return 60 * 60 * 1000
  }
  if (normalized.startsWith("m")) {
    return 60 * 1000
  }
  return 1000
}
