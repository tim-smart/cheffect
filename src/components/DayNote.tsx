import { type MouseEvent, useRef, useState } from "react"

/**
 * Whether a day's note is open, for the meal plan and menu days. Opening it
 * from the note button focuses the field, and leaving the field empty closes
 * it again, so an empty box never stays on a day.
 *
 * Spread `toggleProps` on the note button and `fieldProps` on the field.
 */
export const useDayNote = (options: {
  readonly initiallyOpen: boolean
  readonly save: () => void
  readonly isEmpty: () => boolean
  /**
   * Which day this is. When it changes the note starts over, as if the row
   * had just mounted: the meal plan keeps its rows while the weeks change
   * under them, and one day's open note mustn't carry onto the next week's.
   */
  readonly day?: unknown
}) => {
  // The state is stored with its day. On another day it's stale, and is
  // replaced before anything below renders (React re-runs this component
  // straight away, without touching its children)
  const fresh = {
    day: options.day,
    open: options.initiallyOpen,
    focusOnOpen: false,
  }
  const [stored, setState] = useState(fresh)
  if (stored.day !== options.day) setState(fresh)
  const { open, focusOnOpen } = stored.day === options.day ? stored : fresh
  // Set while the note button closes the note, so a blur as the field goes
  // away doesn't save it a second time
  const closing = useRef(false)

  const toggleProps = {
    // Pressing the button would blur the field, and an empty field closes on
    // blur, so the click would then open it again. Keeping the field focused
    // through the press leaves opening and closing to the click alone, and a
    // press that slides off the button changes nothing.
    onMouseDown: (event: MouseEvent) => {
      event.preventDefault()
    },
    onClick: () => {
      if (open) {
        closing.current = true
        options.save()
      }
      setState({ day: options.day, open: !open, focusOnOpen: !open })
    },
  }

  const fieldProps = {
    onFocus: () => {
      closing.current = false
    },
    onBlur: () => {
      if (closing.current) return
      options.save()
      if (options.isEmpty()) {
        setState({ day: options.day, open: false, focusOnOpen: false })
      }
    },
  }

  return { open, focusOnOpen, toggleProps, fieldProps } as const
}

export function DayNoteField({
  value,
  onChange,
  onFocus,
  onBlur,
  autoFocus,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onFocus: () => void
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
      onFocus={onFocus}
      onBlur={onBlur}
    />
  )
}
