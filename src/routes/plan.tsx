import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash,
  Calendar,
  Eraser,
  MoreVertical,
  StickyNote,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import * as DateTime from "effect/DateTime"
import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react"
import {
  mealPlanDayNotesAtom,
  mealPlanEntriesAtom,
  mealPlanWeekAdjustedAtom,
  mealPlanWeekAtom,
} from "@/livestore/queries"
import * as Option from "effect/Option"
import * as Duration from "effect/Duration"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { SelectRecipeDrawer } from "@/Recipes/Drawer"
import {
  MealPlanDatePicker,
  MealPlanDatePickerTarget,
} from "@/MealPlan/DatePicker"
import { MealPlanDayNote } from "@/domain/MealPlanDayNote"
import { MealPlanEntry } from "@/domain/MealPlanEntry"
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
  const commit = useCommit()

  const today = DateTime.unsafeNow().pipe(
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

  const handlePreviousWeek = () => {
    setWeekStart(DateTime.subtract(weekStartRaw, { weeks: 1 }))
  }

  const handleNextWeek = () => {
    setWeekStart(DateTime.add(weekStartRaw, { weeks: 1 }))
  }

  const handleRemoveEntry = (id: string) => {
    commit(events.mealPlanRemove({ id }))
  }

  const handlers = useSwipeable({
    delta: 50,
    onSwipedLeft: handleNextWeek,
    onSwipedRight: handlePreviousWeek,
  })

  return (
    <div className="pb-content">
      {/* Header */}
      <header className="bg-background border-b border-border sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold">Meal Plan</h1>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <AddToGroceriesButton
                recipes={entries.pipe(
                  Result.map(Iterable.map((entry) => entry.recipe)),
                  Result.getOrElse(() => []),
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
                      const toRemove = Result.getOrElse(entries, () => [])
                      toRemove.forEach((entry) => {
                        commit(events.mealPlanRemove({ id: entry.id }))
                      })
                      const notesToRemove = Result.getOrElse(dayNotes, () => [])
                      notesToRemove.forEach((note) => {
                        commit(events.mealPlanDayNoteRemove({ id: note.id }))
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

            <div className="text-center flex-1">
              <Button
                variant="ghost"
                className="text-sm font-medium "
                onClick={() => setWeekStart(DateTime.startOf(today, "week"))}
              >
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
              </Button>
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
      <main className="max-w-lg mx-auto px-2 py-3" {...handlers}>
        <WeekList
          today={today}
          entries={Result.getOrElse(entries, () => [])}
          dayNotes={Result.getOrElse(dayNotes, () => [])}
          weekDays={weekDays}
          handleRemoveEntry={handleRemoveEntry}
        />
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
  handleRemoveEntry: (id: string) => void
  today: DateTime.Utc
}) {
  const isToday = (date: DateTime.Utc) => DateTime.Equivalence(date, today)
  const notesByDay = new Map<string, MealPlanDayNote>()

  for (const note of dayNotes) {
    const key = DateTime.formatIsoDate(note.day)
    const existing = notesByDay.get(key)
    if (
      !existing ||
      note.updatedAt.epochMillis > existing.updatedAt.epochMillis
    ) {
      notesByDay.set(key, note)
    }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
      {weekDays.map((date) => {
        const isTodayDate = isToday(date)
        const dayEntries = entries.filter((entry) =>
          DateTime.Equivalence(entry.day, date),
        )
        const dayNote = notesByDay.get(DateTime.formatIsoDate(date))

        return (
          <DayListItem
            key={date.epochMillis}
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
  handleRemoveEntry: (id: string) => void
}) {
  const commit = useCommit()
  const dateParts = DateTime.toPartsUtc(date)
  const [noteVisible, setNoteVisible] = useState(() => dayNote !== undefined)
  const [noteDraft, setNoteDraft] = useState(dayNote?.note ?? "")

  useEffect(() => {
    setNoteDraft(dayNote?.note ?? "")
  }, [dayNote?.note])

  const saveNote = () => {
    const trimmed = noteDraft.trim()
    if (trimmed.length === 0) {
      if (dayNote) {
        commit(events.mealPlanDayNoteRemove({ id: dayNote.id }))
      }
      return
    }

    if (dayNote) {
      if (trimmed === dayNote.note) return
      commit(
        events.mealPlanDayNoteUpdate({
          ...dayNote,
          note: trimmed,
          updatedAt: DateTime.unsafeNow(),
        }),
      )
      return
    }

    commit(
      events.mealPlanDayNoteAdd(
        MealPlanDayNote.fromForm({
          day: date,
          note: trimmed,
        }),
      ),
    )
  }

  return (
    <div className="bg-card">
      {/* Day Header with Add Button */}
      <div
        className={`w-full p-2 flex items-center justify-between border-b text-card-foreground ${
          isTodayDate ? "bg-primary-muted" : "bg-muted dark:bg-background"
        }`}
      >
        <div className="flex items-center gap-3 flex-1">
          <div>
            <p
              className={`font-semibold text-sm ${isTodayDate ? "text-primary" : ""}`}
            >
              {dayNames[dateParts.weekDay]}
            </p>
            <p
              className={`text-xs ${isTodayDate ? "text-primary/70" : "text-muted-foreground"}`}
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
            onClick={() => {
              if (noteVisible) {
                saveNote()
              }
              setNoteVisible((visible) => !visible)
            }}
          >
            <StickyNote />
          </Button>
          <SelectRecipeDrawer
            onSelect={(recipe) => {
              commit(
                events.mealPlanAdd({
                  id: crypto.randomUUID(),
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

      {noteVisible && (
        <div className="bg-card p-2 pb-0">
          <textarea
            value={noteDraft}
            placeholder="Add a note..."
            className="block rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none field-sizing-content resize-none w-full"
            onChange={(event) => setNoteDraft(event.target.value)}
            onBlur={saveNote}
          />
        </div>
      )}

      {/* Day Content - Always Visible */}
      <div>
        {dayEntries.length > 0 && (
          <div className="divide-y divide-border">
            {dayEntries.map(({ id, recipe }) => (
              <Link
                key={id}
                className="flex items-center p-2 gap-3"
                to="/recipes/$id"
                params={{ id: recipe.id }}
              >
                <div className="relative w-12 h-12 shrink-0 rounded overflow-hidden">
                  {recipe.imageUrl ? (
                    <img
                      src={recipe.imageUrl}
                      alt={recipe.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Placeholder />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm  line-clamp-1">
                    {recipe.title}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {[
                      ...Option.match(recipe.totalTime, {
                        onNone: () => [],
                        onSome: (duration) => [Duration.format(duration)],
                      }),
                      ...(recipe.servings
                        ? [`${recipe.servingsDisplay} servings`]
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

        {dayEntries.length === 0 && (
          <div className="p-3 text-center">
            <p className="text-sm text-muted-foreground">No meals planned</p>
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
