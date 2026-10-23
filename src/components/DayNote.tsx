import { useRef, useState } from "react"

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
  // Pressing the note button blurs the field before the button's click. That
  // click closes the note itself, so a blur during the press only saves;
  // closing there too would let the click open it again.
  const pressingToggle = useRef(false)

  const toggleProps = {
    onPointerDown: () => {
      pressingToggle.current = true
    },
    onPointerCancel: () => {
      pressingToggle.current = false
    },
    onClick: () => {
      pressingToggle.current = false
      setFocusOnOpen(!open)
      setOpen(!open)
    },
  }

  const fieldProps = {
    // a press that left the button without clicking it is over
    onFocus: () => {
      pressingToggle.current = false
    },
    onBlur: () => {
      options.save()
      if (options.isEmpty() && !pressingToggle.current) {
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
