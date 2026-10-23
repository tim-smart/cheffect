import { useRef, useState } from "react"

/**
 * Whether a day's note is open, for the meal plan and menu days. Opening it
 * from the note button focuses the field, and leaving the field empty closes
 * it again, so an empty box never stays on a day.
 */
export const useDayNote = (options: {
  readonly initiallyOpen: boolean
  readonly save: () => void
  readonly isEmpty: () => boolean
}) => {
  const [open, setOpen] = useState(options.initiallyOpen)
  const [focusOnOpen, setFocusOnOpen] = useState(false)
  // Tapping the note button blurs the field first, which saves the note and
  // may already have closed it. That tap shouldn't open it again.
  const closedAt = useRef(-Infinity)

  const toggle = () => {
    if (performance.now() - closedAt.current < 500) return
    setFocusOnOpen(!open)
    setOpen(!open)
  }

  const blur = () => {
    options.save()
    if (options.isEmpty()) {
      closedAt.current = performance.now()
      setOpen(false)
    }
  }

  return { open, focusOnOpen, toggle, blur } as const
}

export function DayNoteField({
  value,
  onChange,
  onBlur,
  autoFocus,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onBlur: () => void
  readonly autoFocus: boolean
}) {
  return (
    <textarea
      value={value}
      placeholder="Add a note…"
      aria-label="Note for this day"
      autoFocus={autoFocus}
      rows={1}
      className="block w-full resize-none field-sizing-content rounded-xl bg-card px-3 py-2 text-[15px] leading-snug placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
    />
  )
}
