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
}) => {
  const [open, setOpen] = useState(options.initiallyOpen)
  const [focusOnOpen, setFocusOnOpen] = useState(false)
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
      setFocusOnOpen(!open)
      setOpen(!open)
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
        setOpen(false)
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
