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
import { useEffect, useState } from "react"
import { useSwipeable } from "react-swipeable"
import { quantityFormatter } from "@/lib/quantity"
import { cn } from "@/lib/utils"
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
      <header className="bg-background sticky top-0 z-10">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[26px] font-medium tracking-tight">
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
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreviousWeek}
              className="h-8 w-8 p-0"
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
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-4 py-2" {...handlers}>
        {/* Days open their note on mount, so wait for the first snapshot. */}
        {AsyncResult.isInitial(entries) ||
        AsyncResult.isInitial(dayNotes) ? null : (
          <div
            key={weekStart.epochMilliseconds}
            className={cn(
              direction !== null &&
                "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-safe:ease-out-quart",
              direction === "forward" && "motion-safe:slide-in-from-right-4",
              direction === "back" && "motion-safe:slide-in-from-left-4",
            )}
          >
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
      {weekDays.map((date) => {
        const isTodayDate = isToday(date)
        const dayEntries = entries.filter((entry) =>
          DateTime.Equivalence(entry.day, date),
        )
        const dayNote = notesByDay.get(DateTime.formatIsoDate(date))

        return (
          <DayListItem
            key={date.epochMilliseconds}
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
  const [noteDraft, setNoteDraft] = useState(dayNote?.note ?? "")

  useEffect(() => {
    setNoteDraft(dayNote?.note ?? "")
  }, [dayNote?.note])

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
    initiallyOpen: dayNote !== undefined,
    save: saveNote,
    isEmpty: () => noteDraft.trim().length === 0,
  })

  return (
    <div className="py-2.5">
      {/* Day Header with Add Button */}
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex items-baseline gap-2">
            <p
              className={`font-display text-[20px] font-medium leading-tight tracking-tight ${isTodayDate ? "text-primary" : ""}`}
            >
              {dayNames[dateParts.weekDay]}
            </p>
            <p
              className={`text-[13px] ${isTodayDate ? "text-primary" : "text-muted-foreground"}`}
            >
              {DateTime.formatUtc(date, {
                month: "short",
                day: "numeric",
              })}
              {isTodayDate && " • Today"}
            </p>
          </div>
        </div>
        <div className="flex items-center">
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

      {note.open && (
        <div className="mt-1.5">
          <DayNoteField
            value={noteDraft}
            onChange={setNoteDraft}
            {...note.fieldProps}
            autoFocus={note.focusOnOpen}
          />
        </div>
      )}

      {/* Day Content - Always Visible */}
      <div>
        {dayEntries.length > 0 && (
          <div className="mt-1.5 space-y-1.5">
            {dayEntries.map(({ id, idString, recipe }) => (
              <Link
                key={idString}
                className="flex items-center gap-3 rounded-xl bg-card p-1.5 pr-1 transition-colors active:bg-muted"
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
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
                </div>
              </Link>
            ))}
          </div>
        )}

        {dayEntries.length === 0 && !note.open && (
          <div className="pt-0.5">
            <p className="text-sm text-muted-foreground">Nothing planned</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SelectRecipeButton(props: {}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 text-primary hover:bg-primary hover:text-primary-foreground"
      {...props}
    >
      <Plus className="w-4 h-4" />
    </Button>
  )
}
