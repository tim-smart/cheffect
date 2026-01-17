import { createFileRoute, Link } from "@tanstack/react-router"
import {
  X,
  Plus,
  ArrowLeft,
  Calendar,
  MoreVertical,
  Trash,
  GripVertical,
  StickyNote,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import * as Option from "effect/Option"
import * as Duration from "effect/Duration"
import { SelectRecipeDrawer } from "@/Recipes/Drawer"
import { router } from "@/Router"
import * as Array from "effect/Array"
import { useAtomSuspense, useAtomValue } from "@effect-atom/atom-react"
import { menuByIdAtom, menuDayNotesAtom, menuEntriesAtom } from "@/Menus/atoms"
import { MenuEntry } from "@/domain/MenuEntry"
import { MenuDayNote } from "@/domain/MenuDayNote"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { Menu } from "@/domain/Menu"
import * as DateTime from "effect/DateTime"
import {
  MealPlanDatePicker,
  MealPlanDatePickerTarget,
} from "@/MealPlan/DatePicker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Placeholder } from "@/components/placeholder"
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"

export const Route = createFileRoute("/menus/$id")({
  component: MenuDetailPage,
})

export function MenuDetailPage() {
  const { id } = Route.useParams()
  const commit = useCommit()
  const menu = useAtomSuspense(menuByIdAtom(id)).value
  const entries = useAtomValue(menuEntriesAtom(id))!
  const dayNotes = useAtomValue(menuDayNotesAtom(id))!

  const setDays = (days: number) => {
    if (days < 1 || days === menu.days) return
    commit(
      events.menuUpdate({
        ...menu,
        days,
        updatedAt: DateTime.unsafeNow(),
      }),
    )
  }

  return (
    <div className="pb-content">
      {/* Header */}
      <header className="bg-background border-b border-border sticky top-0 z-10">
        <div className="pl-2 pr-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="p-2"
              onClick={() => router.history.back()}
            >
              <ArrowLeft />
            </Button>
            <h1 className="text-lg font-semibold  line-clamp-1 flex-1">
              {menu.name}
            </h1>
            <MealPlanDatePicker
              target={MealPlanDatePickerTarget.Menu({
                id: menu.id,
              })}
            >
              <Button variant="outline" size="sm">
                <Calendar />
                Plan
              </Button>
            </MealPlanDatePicker>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="p-2">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onClick={() => {
                    if (
                      !confirm("Are you sure you want to remove this menu?")
                    ) {
                      return
                    }
                    router.navigate({ to: "/menus" })
                    commit(events.menuRemove({ id: menu.id }))
                  }}
                >
                  <Trash />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-2 py-3 flex flex-col gap-4">
        <DndContext
          onDragOver={() => {
            if (!("vibrate" in navigator)) return
            navigator.vibrate(5)
          }}
          onDragEnd={(event) => {
            const { active, over } = event
            const targetDay = over?.id as number | undefined
            if (targetDay === undefined) return
            const entry = entries.find((e) => e.id === active.id)
            if (!entry || entry.day === targetDay) return
            commit(
              events.menuEntrySetDay({
                id: entry.id,
                day: targetDay,
                updatedAt: DateTime.unsafeNow(),
              }),
            )
          }}
        >
          <DayList menu={menu} entries={entries} dayNotes={dayNotes} />
        </DndContext>
        <div className="flex items-center">
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span>Days:</span>
            <Input
              type="number"
              min={1}
              className="w-16 bg-background"
              defaultValue={menu.days}
              onBlur={(e) => setDays(Number(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

function DayList({
  menu,
  entries,
  dayNotes,
}: {
  menu: Menu
  entries: ReadonlyArray<MenuEntry>
  dayNotes: ReadonlyArray<MenuDayNote>
}) {
  return (
    <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
      {Array.range(1, menu.days).map((day) => {
        const dayEntries = entries.filter((entry) => entry.day === day)
        const dayNote = dayNotes.find((note) => note.day === day)
        return (
          <DayListItem
            key={day}
            menu={menu}
            day={day}
            dayEntries={dayEntries}
            dayNote={dayNote}
          />
        )
      })}
    </div>
  )
}

function DayListItem({
  menu,
  day,
  dayEntries,
  dayNote,
}: {
  menu: Menu
  day: number
  dayEntries: ReadonlyArray<MenuEntry>
  dayNote?: MenuDayNote
}) {
  const commit = useCommit()
  const { isOver, setNodeRef } = useDroppable({
    id: day,
  })
  const [noteVisible, setNoteVisible] = useState(() => dayNote !== undefined)
  const [noteDraft, setNoteDraft] = useState(dayNote?.note ?? "")
  useEffect(() => {
    setNoteDraft(dayNote?.note ?? "")
  }, [dayNote?.note])

  const saveNote = () => {
    const trimmed = noteDraft.trim()
    if (trimmed.length === 0) {
      if (dayNote) {
        commit(events.menuDayNoteRemove({ id: dayNote.id }))
      }
      return
    }

    if (dayNote) {
      if (trimmed === dayNote.note) return
      commit(
        events.menuDayNoteUpdate({
          ...dayNote,
          note: trimmed,
          updatedAt: DateTime.unsafeNow(),
        }),
      )
      return
    }

    commit(
      events.menuDayNoteAdd(
        MenuDayNote.fromForm({
          menuId: menu.id,
          day,
          note: trimmed,
        }),
      ),
    )
  }

  return (
    <div ref={setNodeRef} className="bg-card">
      <div
        className={cn(
          `w-full pr-2 pl-3 py-1 flex items-center justify-between border-b`,
          isOver
            ? "bg-primary-muted text-primary"
            : "bg-muted dark:bg-background text-muted-foreground dark:text-muted-foreground",
        )}
      >
        <div className="flex items-center gap-3 flex-1">
          <p className={`font-semibold`}>Day {day}</p>
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
                events.menuEntryAdd(
                  MenuEntry.fromForm({
                    menuId: menu.id,
                    recipeId: recipe.id,
                    day,
                  }),
                ),
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
            {dayEntries.map((entry) => (
              <DayEntryItem key={entry.id} entry={entry} />
            ))}
          </div>
        )}

        {dayEntries.length === 0 && (
          <div className="p-3 text-center">
            <p className="text-sm text-muted-foreground">
              No recipes added yet
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function DayEntryItem({ entry }: { entry: MenuEntry }) {
  const { id, recipe } = entry
  const commit = useCommit()

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    setActivatorNodeRef,
    isDragging,
  } = useDraggable({
    id: entry.id,
  })
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 999,
      }
    : undefined
  const [debouncedIsDragging, setDebouncedIsDragging] = useState(isDragging)
  useEffect(() => {
    let timeout: number | undefined
    if (isDragging) {
      setDebouncedIsDragging(true)
    } else {
      timeout = setTimeout(() => setDebouncedIsDragging(false), 100)
    }
    return () => {
      if (timeout) clearTimeout(timeout)
    }
  }, [isDragging])

  return (
    <Link
      className={cn(
        "flex items-center p-2 -mt-2 first:mt-0 gap-3 bg-card relative rounded-lg border border-transparent",
        isDragging && "border-border",
      )}
      to="/recipes/$id"
      disabled={debouncedIsDragging}
      params={{ id: recipe.id }}
      ref={setNodeRef}
      style={style}
      {...attributes}
    >
      <div className="flex items-stretch -ml-3">
        <div
          ref={setActivatorNodeRef}
          className={cn(
            "touch-none p-2 flex items-center",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
          {...listeners}
        >
          <GripVertical className="size-5 text-muted-foreground/50" />
        </div>
        <div className="relative w-12 h-12 -ml-0.5 shrink-0 rounded overflow-hidden">
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
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm  line-clamp-1">{recipe.title}</h4>
        <p className="text-xs text-muted-foreground">
          {[
            ...Option.match(recipe.totalTime, {
              onNone: () => [],
              onSome: (duration) => [Duration.format(duration)],
            }),
            ...(recipe.servings ? [`${recipe.servingsDisplay} servings`] : []),
          ].join(" • ")}
        </p>
      </div>
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault()
            commit(events.menuEntryRemove({ id }))
          }}
          className="h-8 w-8 p-0 text-muted-foreground/70 hover:text-red-600"
        >
          <X />
        </Button>
      </div>
    </Link>
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
      <Plus />
    </Button>
  )
}
