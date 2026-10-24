import { createFileRoute, Link } from "@tanstack/react-router"
import { DayNoteField, useDayNote } from "@/components/DayNote"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash,
  Calendar,
  Eraser,
  MoreVertical,
  MessageSquarePlus,
  MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useAtom, useAtomValue } from "@effect/atom-react"
import {
  mealPlanDayNotesAtom,
  mealPlanEntriesAtom,
  mealPlanWeekAdjustedAtom,
  mealPlanWeekAtom,
} from "@/MealPlan/atoms"
import { latestNoteByDay } from "@/MealPlan/Repo"
import * as Option from "effect/Option"
import * as Duration from "effect/Duration"
import { useWrite } from "@/EventLog"
import { SelectRecipeDrawer } from "@/Recipes/Drawer"
import {
  MealPlanDatePicker,
  MealPlanDatePickerTarget,
} from "@/MealPlan/DatePicker"
import { MealPlanDayNote } from "@/domain/MealPlanDayNote"
import { MealPlanEntry, MealPlanEntryId } from "@/domain/MealPlanEntry"
import { generateUuidBytes } from "@/lib/Id"
import { AddToGroceriesButton } from "@/Groceries/AddButton"
import * as Iterable from "effect/Iterable"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Placeholder } from "@/components/placeholder"
import { useLayoutEffect, useRef, useState } from "react"
import { useSwipeable } from "react-swipeable"
import { quantityFormatter } from "@/lib/quantity"
import {
  MealPlanEntryEvent,
  MealPlanDayNoteEvent,
  mealPlanDayNoteUpdate,
} from "@/MealPlan/Events"

export const Route = createFileRoute("/plan")({
  component: MealPlanPage,
})

const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

export function MealPlanPage() {
  const write = useWrite()

  const today = DateTime.nowUnsafe().pipe(
    DateTime.setZone(DateTime.zoneMakeLocal()),
    DateTime.removeTime,
  )
  const [weekStartRaw, setWeekStart] = useAtom(mealPlanWeekAtom)
  const weekStart = useAtomValue(mealPlanWeekAdjustedAtom)
  const entries = useAtomValue(mealPlanEntriesAtom)
  const dayNotes = useAtomValue(mealPlanDayNotesAtom)

  const getWeekDays = () => {
    const days = []
    for (let i = 0; i < 7; i++) {
      days.push(DateTime.add(weekStart, { days: i }))
    }
    return days
  }

  const weekDays = getWeekDays()

  const weekEnd = DateTime.add(weekStart, { days: 6 })
  const isCurrentWeek =
    DateTime.isGreaterThanOrEqualTo(today, weekStart) &&
    DateTime.isLessThanOrEqualTo(today, weekEnd)

  // Which way the week list slides in: the direction the weeks moved
  const [direction, setDirection] = useState<"back" | "forward" | null>(null)

  // The days stay mounted from one week to the next (rebuilding seven rows
  // of buttons, menus and drawers is what made the swipe stutter on phones),
  // so a CSS entrance would play once and never again. The slide is started
  // by hand each time the week changes, with the theme's ease-out-quart.
  const weekRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = weekRef.current
    if (direction === null || element === null) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const from = direction === "forward" ? "1rem" : "-1rem"
    const animation = element.animate(
      [
        { opacity: 0, transform: `translateX(${from})` },
        { opacity: 1, transform: "none" },
      ],
      { duration: 300, easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
    )
    return () => animation.cancel()
  }, [weekStart.epochMilliseconds, direction])

  const handlePreviousWeek = () => {
    setDirection("back")
    setWeekStart(DateTime.subtract(weekStartRaw, { weeks: 1 }))
  }

  const handleNextWeek = () => {
    setDirection("forward")
    setWeekStart(DateTime.add(weekStartRaw, { weeks: 1 }))
  }

  const handleToday = () => {
    setDirection(DateTime.isLessThan(today, weekStart) ? "back" : "forward")
    setWeekStart(DateTime.startOf(today, "week"))
  }

  const handleRemoveEntry = (id: MealPlanEntryId) => {
    write(MealPlanEntryEvent.remove({ id: id }))
  }

  const handlers = useSwipeable({
    delta: 50,
    onSwipedLeft: handleNextWeek,
    onSwipedRight: handlePreviousWeek,
  })

  return (
    <div className="pb-content">
      {/* Header */}
      <header className="bg-background sticky top-bar-offset z-10">
        <div className="page-wide pt-3 pb-2 md:pt-6">
          <div className="flex items-center justify-between mb-2 md:min-h-11">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[26px] md:text-[32px] md:leading-none font-medium tracking-tight">
                Meal Plan
              </h1>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <AddToGroceriesButton
                recipes={entries.pipe(
                  AsyncResult.map(Iterable.map((entry) => entry.recipe)),
                  AsyncResult.getOrElse(() => []),
                )}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="p-2">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      if (
                        !confirm("Are you sure you want to clear this week?")
                      ) {
                        return
                      }
                      const toRemove = AsyncResult.getOrElse(entries, () => [])
                      toRemove.forEach((entry) => {
                        write(MealPlanEntryEvent.remove({ id: entry.id }))
                      })
                      const notesToRemove = AsyncResult.getOrElse(
                        dayNotes,
                        () => [],
                      )
                      notesToRemove.forEach((note) => {
                        write(MealPlanDayNoteEvent.remove({ id: note.id }))
                      })
                    }}
                  >
                    <Eraser />
                    Clear week
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Week Navigation */}
          <div className="max-w-lg mx-auto md:mx-0 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreviousWeek}
              className="h-8 w-8 p-0"
              aria-label="Previous week"
            >
              <ChevronLeft />
            </Button>

            <div className="text-center flex-1 flex flex-col items-center gap-0.5">
              <span className="text-sm font-medium">
                {DateTime.formatUtc(weekStart, {
                  month: "short",
                  day: "numeric",
                })}{" "}
                -{" "}
                {weekStart.pipe(
                  DateTime.add({ days: 6 }),
                  DateTime.formatUtc({
                    month: "short",
                    day: "numeric",
                  }),
                )}
              </span>
              {isCurrentWeek ? (
                <span className="inline-flex items-center h-6 text-xs text-muted-foreground">
                  This week
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="xs"
                  className="text-primary border-primary/40 hover:text-primary hover:bg-primary/10"
                  onClick={handleToday}
                >
                  Today
                </Button>
              )}
            </div>

            <Button
              variant="ghost"
              onClick={handleNextWeek}
              className="h-8 w-8 p-0"
              aria-label="Next week"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="page-wide py-2" {...handlers}>
        {/* Days open their note on mount, so wait for the first snapshot. */}
        {AsyncResult.isInitial(entries) ||
        AsyncResult.isInitial(dayNotes) ? null : (
          <div ref={weekRef}>
            <WeekList
              today={today}
              entries={AsyncResult.getOrElse(entries, () => [])}
              dayNotes={AsyncResult.getOrElse(dayNotes, () => [])}
              weekDays={weekDays}
              handleRemoveEntry={handleRemoveEntry}
            />
          </div>
        )}
      </main>
    </div>
  )
}

function WeekList({
  entries,
  dayNotes,
  weekDays,
  handleRemoveEntry,
  today,
}: {
  entries: ReadonlyArray<MealPlanEntry>
  dayNotes: ReadonlyArray<MealPlanDayNote>
  weekDays: Array<DateTime.Utc>
  handleRemoveEntry: (id: MealPlanEntryId) => void
  today: DateTime.Utc
}) {
  const isToday = (date: DateTime.Utc) => DateTime.Equivalence(date, today)
  const notesByDay = latestNoteByDay(dayNotes)

  return (
    <div className="divide-y divide-border">
      {weekDays.map((date, weekDay) => {
        const isTodayDate = isToday(date)
        const dayEntries = entries.filter((entry) =>
          DateTime.Equivalence(entry.day, date),
        )
        const dayNote = notesByDay.get(DateTime.formatIsoDate(date))

        // Keyed by position, so a week change updates the seven rows in
        // place rather than tearing them down and mounting new ones
        return (
          <DayListItem
            key={weekDay}
            date={date}
            dayEntries={dayEntries}
            dayNote={dayNote}
            isTodayDate={isTodayDate}
            handleRemoveEntry={handleRemoveEntry}
          />
        )
      })}
    </div>
  )
}

function DayListItem({
  date,
  dayEntries,
  dayNote,
  isTodayDate,
  handleRemoveEntry,
}: {
  date: DateTime.Utc
  dayEntries: ReadonlyArray<MealPlanEntry>
  dayNote?: MealPlanDayNote
  isTodayDate: boolean
  handleRemoveEntry: (id: MealPlanEntryId) => void
}) {
  const write = useWrite()
  const dateParts = DateTime.toPartsUtc(date)
  // The row outlives the day it shows, so the draft is kept with its day and
  // with the saved note it was typed over. A draft from another day, or over
  // a note that has since changed (on another device, say), is stale and is
  // replaced by the saved note before anything renders
  const day = date.epochMilliseconds
  const saved = dayNote?.note ?? ""
  const [draft, setDraft] = useState({ day, saved, note: saved })
  const stale = draft.day !== day || draft.saved !== saved
  if (stale) setDraft({ day, saved, note: saved })
  const noteDraft = stale ? saved : draft.note
  const setNoteDraft = (note: string) => setDraft({ day, saved, note })

  const saveNote = () => {
    const trimmed = noteDraft.trim()
    if (trimmed.length === 0) {
      if (dayNote) {
        write(MealPlanDayNoteEvent.remove({ id: dayNote.id }))
      }
      return
    }

    if (dayNote) {
      if (trimmed === dayNote.note) return
      write(
        mealPlanDayNoteUpdate({
          ...dayNote,
          note: trimmed,
          updatedAt: DateTime.nowUnsafe(),
        }),
      )
      return
    }

    write(
      MealPlanDayNoteEvent.set(
        MealPlanDayNote.fromForm({
          day: date,
          note: trimmed,
        }),
      ),
    )
  }

  const note = useDayNote({
    day,
    initiallyOpen: dayNote !== undefined,
    save: saveNote,
    isEmpty: () => noteDraft.trim().length === 0,
  })

  return (
    // On desktops each day is a row of the week's agenda: the day and its
    // buttons in a column on the left, its meals and note beside them. The
    // grid places things; the DOM keeps the order the keyboard follows
    <div className="py-2.5 md:py-4 md:grid md:grid-cols-[10rem_minmax(0,1fr)] md:items-start md:gap-x-6">
      {/* Day Header with Add Button */}
      <div className="w-full flex items-center justify-between md:contents">
        <div className="flex items-center gap-3 flex-1 md:col-start-1 md:row-start-1">
          <div className="flex items-baseline gap-2 md:flex-col md:items-start md:gap-0.5">
            <p
              className={`font-display text-[20px] md:text-[22px] font-medium leading-tight tracking-tight ${isTodayDate ? "text-primary" : ""}`}
            >
              {dayNames[dateParts.weekDay]}
            </p>
            <p
              className={`text-[13px] md:text-sm ${isTodayDate ? "text-primary" : "text-muted-foreground"}`}
            >
              {DateTime.formatUtc(date, {
                month: "short",
                day: "numeric",
              })}
              {isTodayDate && " • Today"}
            </p>
          </div>
        </div>
        <div className="flex items-center md:col-start-1 md:row-start-2 md:mt-1.5 md:-ml-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground"
            aria-label={note.open ? "Close note" : "Add a note"}
            {...note.toggleProps}
          >
            {dayNote?.note ? <MessageSquare /> : <MessageSquarePlus />}
          </Button>
          <SelectRecipeDrawer
            onSelect={(recipe) => {
              write(
                MealPlanEntryEvent.set({
                  id: MealPlanEntryId.make(generateUuidBytes()),
                  day: date,
                  recipeId: recipe.id,
                }),
              )
            }}
          >
            <SelectRecipeButton />
          </SelectRecipeDrawer>
        </div>
      </div>

      {/* Day Content - Always Visible */}
      <div className="md:col-start-2 md:row-start-1 md:row-span-2">
        {note.open && (
          <div className="mt-1.5 md:mt-0 md:mb-2 md:max-w-2xl">
            {/* A new field for a new day: when both weeks have a note on
                this weekday, the old week's field must not stay focused
                with the new week's note in it */}
            <DayNoteField
              key={day}
              value={noteDraft}
              onChange={setNoteDraft}
              {...note.fieldProps}
              autoFocus={note.focusOnOpen}
            />
          </div>
        )}

        {dayEntries.length > 0 && (
          <div className="mt-1.5 space-y-1.5 md:mt-0 md:space-y-0 md:flex md:flex-wrap md:gap-2">
            {dayEntries.map(({ id, idString, recipe }) => (
              <Link
                key={idString}
                className="flex items-center gap-3 rounded-xl bg-card p-1.5 pr-1 transition-colors active:bg-muted md:w-80 md:hover:bg-muted"
                to="/recipes/$id"
                params={{ id: recipe.idString }}
              >
                <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-muted">
                  {/* the placeholder sits behind the photo, so it shows when
                      the photo is missing or fails to load */}
                  <Placeholder />
                  {recipe.imageUrl && (
                    <img
                      src={recipe.imageUrl}
                      alt=""
                      // decoded off the main thread, so a week's photos
                      // don't hold up the frames of its slide
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(event) => {
                        event.currentTarget.hidden = true
                      }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-display text-[16px] font-medium leading-snug line-clamp-1">
                    {recipe.title}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {[
                      ...Option.match(recipe.totalTime, {
                        onNone: () => [],
                        onSome: (duration) => [Duration.format(duration)],
                      }),
                      ...(recipe.servings
                        ? [
                            `${quantityFormatter.format(recipe.servingsDisplay!)} servings`,
                          ]
                        : []),
                    ].join(" • ")}
                  </p>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <MealMenu
                    id={id}
                    date={date}
                    handleRemoveEntry={handleRemoveEntry}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}

        {dayEntries.length === 0 && !note.open && (
          <div className="pt-0.5 md:pt-0 md:flex md:h-15 md:items-center">
            <p className="text-sm text-muted-foreground">Nothing planned</p>
          </div>
        )}
      </div>
    </div>
  )
}

// A meal's menu: change its day or remove it.
//
// A week shows a dozen meals or more, and mounting a menu for each was much
// of what a swipe between weeks cost. Until its button is first pressed a
// meal has the button alone; the menu mounts on that press, already open.
function MealMenu({
  id,
  date,
  handleRemoveEntry,
}: {
  id: MealPlanEntryId
  date: DateTime.Utc
  handleRemoveEntry: (id: MealPlanEntryId) => void
}) {
  const [open, setOpen] = useState<boolean | null>(null)
  // Radix focuses the first item when the menu opens from the keyboard, but
  // it knows that from key presses it has seen, and the press that mounts
  // this menu happens before it exists. So that first opening is remembered,
  // and when the menu takes focus the first item is focused by hand
  const openedByKeyboard = useRef(false)
  const buttonProps = {
    variant: "ghost",
    size: "sm",
    className: "h-8 w-8 p-0 text-muted-foreground",
    "aria-label": "Meal options",
  } as const

  if (open === null) {
    return (
      <Button
        {...buttonProps}
        aria-haspopup="menu"
        aria-expanded={false}
        onClick={(event) => {
          // the button sits inside the meal's link
          event.preventDefault()
          // a click from Enter or Space has no detail
          openedByKeyboard.current = event.detail === 0
          setOpen(true)
        }}
        onKeyDown={(event) => {
          // the arrow opens a menu, as it does once the menu is there
          if (event.key === "ArrowDown") {
            event.preventDefault()
            openedByKeyboard.current = true
            setOpen(true)
          }
        }}
      >
        <MoreVertical className="w-4 h-4" />
      </Button>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button {...buttonProps}>
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onFocus={(event) => {
          if (!openedByKeyboard.current || event.target !== event.currentTarget)
            return
          openedByKeyboard.current = false
          event.currentTarget
            .querySelector<HTMLElement>('[role="menuitem"]')
            ?.focus()
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <MealPlanDatePicker
          target={MealPlanDatePickerTarget.Existing({
            id,
            initialValue: date,
          })}
        >
          <DropdownMenuItem>
            <Calendar />
            Change day
          </DropdownMenuItem>
        </MealPlanDatePicker>
        <DropdownMenuItem
          variant="destructive"
          onClick={(event) => {
            event.preventDefault()
            handleRemoveEntry(id)
          }}
        >
          <Trash />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SelectRecipeButton(props: {}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 text-primary hover:bg-primary hover:text-primary-foreground"
      aria-label="Add a meal"
      {...props}
    >
      <Plus className="w-4 h-4" />
    </Button>
  )
}
