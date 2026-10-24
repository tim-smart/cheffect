import { createFileRoute, Link } from "@tanstack/react-router"
import { DayNoteField, useDayNote } from "@/components/DayNote"
import {
  X,
  Plus,
  ArrowLeft,
  Calendar,
  MoreVertical,
  Trash,
  GripVertical,
  MessageSquarePlus,
  MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import * as Option from "effect/Option"
import * as Duration from "effect/Duration"
import { SelectRecipeDrawer } from "@/Recipes/Drawer"
import { router } from "@/Router"
import * as Array from "effect/Array"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { menuByIdAtom, setMenuDaysAtom } from "@/Menus/atoms"
import type { MenuDetail } from "@/Menus/Repo"
import { MenuEntry } from "@/domain/MenuEntry"
import { MenuDayNote } from "@/domain/MenuDayNote"
import { useWrite } from "@/EventLog"
import { Menu, type MenuId } from "@/domain/Menu"
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
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core"
import { cn, quantityFormatter } from "@/lib/utils"
import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import {
  MenuEvent,
  MenuEntryEvent,
  MenuDayNoteEvent,
  menuEntryDay,
  menuDayNoteUpdate,
} from "@/Menus/Events"

export const Route = createFileRoute("/menus/$id")({
  component: MenuDetailPage,
})

// Days open their note on mount, so the page waits for the first snapshot.
export function MenuDetailPage() {
  const { id } = Route.useParams()
  const result = useAtomValue(menuByIdAtom(id))
  return AsyncResult.builder(result)
    .onSuccess((found) =>
      Option.match(found, {
        onNone: () => <NoMenuFound />,
        onSome: (detail) => <MenuDetails detail={detail} />,
      }),
    )
    .render()
}

function NoMenuFound() {
  return (
    <div className="p-4 text-center text-gray-600">
      <h2 className="text-xl font-semibold mb-2">Menu Not Found</h2>
      <p className="text-sm">
        The menu you are looking for does not exist or has been removed.
      </p>
    </div>
  )
}

function MenuDetails({ detail }: { detail: MenuDetail }) {
  const { menu, entries, notes: dayNotes } = detail
  const write = useWrite()
  const setMenuDays = useAtomSet(setMenuDaysAtom)
  const setDays = (days: number) => setMenuDays({ menu, days })

  return (
    <div className="pb-content">
      {/* Header */}
      <header className="bg-background sticky top-bar-offset z-10">
        <div className="page-wide pt-3 pb-3 md:pt-6">
          <div className="flex items-center gap-2 -ml-2 md:-ml-3 md:min-h-11">
            <Button
              variant="ghost"
              size="sm"
              className="size-10 rounded-full"
              aria-label="Back"
              onClick={() => router.history.back()}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="font-display text-[22px] md:text-[32px] font-medium leading-tight tracking-tight line-clamp-2 flex-1">
              {menu.name}
            </h1>
            <MealPlanDatePicker
              target={MealPlanDatePickerTarget.Menu({
                id: menu.idString,
              })}
            >
              <Button
                variant="outline"
                size="sm"
                className="h-10 rounded-full px-4 shadow-none"
              >
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
                  variant="destructive"
                  onClick={() => {
                    if (
                      !confirm("Are you sure you want to remove this menu?")
                    ) {
                      return
                    }
                    router.navigate({ to: "/menus" })
                    write(MenuEvent.remove({ id: menu.id }))
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
      <main className="page-wide py-2 flex flex-col gap-4">
        <DndContext
          onDragOver={() => {
            if (!("vibrate" in navigator)) return
            navigator.vibrate(3)
          }}
          onDragEnd={(event: DragEndEvent) => {
            const { active, over } = event
            const targetDay = over?.id as number | undefined
            if (targetDay === undefined) return
            const entry = entries.find((e) => e.idString === active.id)
            if (!entry || entry.day === targetDay) return
            write(
              menuEntryDay(
                { id: entry.id, menuId: menu.id },
                targetDay,
                DateTime.nowUnsafe(),
              ),
            )
          }}
        >
          <DayList menu={menu} entries={entries} dayNotes={dayNotes} />
        </DndContext>
        <div className="flex items-center">
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Days</span>
            <Input
              type="number"
              min={1}
              className="w-16 bg-card"
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
    <div className="divide-y divide-border">
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
  const write = useWrite()
  const { isOver, setNodeRef } = useDroppable({
    id: day,
  })
  const [noteDraft, setNoteDraft] = useState(dayNote?.note ?? "")
  useEffect(() => {
    setNoteDraft(dayNote?.note ?? "")
  }, [dayNote?.note])

  const saveNote = () => {
    const trimmed = noteDraft.trim()
    if (trimmed.length === 0) {
      if (dayNote) {
        write(
          MenuDayNoteEvent.remove({
            id: dayNote.id,
            menuId: menu.id,
          }),
        )
      }
      return
    }

    if (dayNote) {
      if (trimmed === dayNote.note) return
      write(
        menuDayNoteUpdate(menu.id, {
          ...dayNote,
          note: trimmed,
          updatedAt: DateTime.nowUnsafe(),
        }),
      )
      return
    }

    write(
      MenuDayNoteEvent.set(
        MenuDayNote.fromForm({
          menuId: menu.id,
          day,
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
    // On desktops each day is a row of the menu's agenda: the day and its
    // buttons in a column on the left, its meals and note beside them. The
    // grid places things; the DOM keeps the order the keyboard follows
    <div
      ref={setNodeRef}
      className={cn(
        "py-2.5 md:py-4 md:grid md:grid-cols-[10rem_minmax(0,1fr)] md:items-start md:gap-x-6",
        isOver && "bg-primary-muted -mx-2 px-2 rounded-xl border-transparent",
      )}
    >
      <div className="w-full flex items-center justify-between md:contents">
        <div className="flex items-center gap-3 flex-1 md:col-start-1 md:row-start-1">
          <p
            className={cn(
              "font-display text-[20px] md:text-[22px] font-medium leading-tight tracking-tight",
              isOver && "text-primary",
            )}
          >
            Day {day}
          </p>
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
                MenuEntryEvent.set(
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

      {/* Day Content - Always Visible */}
      <div className="md:col-start-2 md:row-start-1 md:row-span-2">
        {note.open && (
          <div className="mt-1.5 md:mt-0 md:mb-2 md:max-w-2xl">
            <DayNoteField
              value={noteDraft}
              onChange={setNoteDraft}
              {...note.fieldProps}
              autoFocus={note.focusOnOpen}
            />
          </div>
        )}

        {dayEntries.length > 0 && (
          <div className="mt-1.5 space-y-1.5 md:mt-0 md:space-y-0 md:flex md:flex-wrap md:gap-2">
            {dayEntries.map((entry) => (
              <DayEntryItem
                key={entry.idString}
                menuId={menu.id}
                entry={entry}
              />
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

function DayEntryItem({ menuId, entry }: { menuId: MenuId; entry: MenuEntry }) {
  const { id, recipe } = entry
  const write = useWrite()

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    setActivatorNodeRef,
    isDragging,
  } = useDraggable({
    id: entry.idString,
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
      timeout = window.setTimeout(() => setDebouncedIsDragging(false), 100)
    }
    return () => {
      if (timeout) window.clearTimeout(timeout)
    }
  }, [isDragging])

  return (
    <Link
      className={cn(
        "flex items-center p-1.5 pr-1 gap-3 bg-card relative rounded-xl transition-colors active:bg-muted md:w-80 md:hover:bg-muted",
        isDragging && "shadow-lg",
      )}
      to="/recipes/$id"
      disabled={debouncedIsDragging}
      params={{ id: recipe.idString }}
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
        <div className="relative w-12 h-12 -ml-0.5 shrink-0 rounded-lg overflow-hidden bg-muted">
          {/* the placeholder sits behind the photo, so it shows when the
              photo is missing or fails to load */}
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
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault()
            write(MenuEntryEvent.remove({ id, menuId }))
          }}
          className="h-8 w-8 p-0 text-muted-foreground/60 hover:text-destructive"
          aria-label="Remove meal"
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
      aria-label="Add a meal"
      {...props}
    >
      <Plus />
    </Button>
  )
}
