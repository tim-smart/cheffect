import { createFileRoute, Link } from "@tanstack/react-router"
import {
  X,
  Plus,
  ArrowLeft,
  Calendar,
  MoreVertical,
  Trash,
  GripVertical,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import * as Option from "effect/Option"
import * as Duration from "effect/Duration"
import { SelectRecipeDrawer } from "@/Recipes/Drawer"
import { router } from "@/Router"
import * as Array from "effect/Array"
import { useAtomSuspense, useAtomValue } from "@effect-atom/atom-react"
import { menuByIdAtom, menuEntriesAtom } from "@/Menus/atoms"
import { MenuEntry } from "@/domain/MenuEntry"
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

export const Route = createFileRoute("/menus/$id")({
  component: MenuDetailPage,
})

export function MenuDetailPage() {
  const { id } = Route.useParams()
  const commit = useCommit()
  const menu = useAtomSuspense(menuByIdAtom(id)).value
  const entries = useAtomValue(menuEntriesAtom(id))!

  return (
    <div className="bg-gray-50 pb-30">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
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
            <h1 className="text-lg font-semibold text-gray-900 line-clamp-1 flex-1">
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
                  Remove menu
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-2 py-3 flex flex-col gap-4">
        <DndContext
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
          <DayList menu={menu} entries={entries} />
        </DndContext>
        <div className="flex items-center">
          <div className="flex-1" />
          <Button
            onClick={() => {
              commit(
                events.menuUpdate({
                  ...menu,
                  days: menu.days + 1,
                  updatedAt: DateTime.unsafeNow(),
                }),
              )
            }}
          >
            <Plus className="w-4 h-4" />
            Add day
          </Button>
        </div>
      </main>
    </div>
  )
}

function DayList({
  menu,
  entries,
}: {
  menu: Menu
  entries: ReadonlyArray<MenuEntry>
}) {
  return (
    <div className="rounded-lg border border-gray-200 divide-y divide-gray-200 overflow-hidden">
      {Array.range(1, menu.days).map((day) => {
        const dayEntries = entries.filter((entry) => entry.day === day)
        return (
          <DayListItem
            key={day}
            menu={menu}
            day={day}
            dayEntries={dayEntries}
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
}: {
  menu: Menu
  day: number
  dayEntries: ReadonlyArray<MenuEntry>
}) {
  const commit = useCommit()
  const { isOver, setNodeRef } = useDroppable({
    id: day,
  })
  return (
    <div ref={setNodeRef} className="bg-white">
      <div
        className={cn(
          `w-full px-3 py-3 flex items-center justify-between border-b`,

          isOver ? "bg-orange-50 text-orange-600" : "bg-gray-50 text-gray-900",
        )}
      >
        <div className="flex items-center gap-3 flex-1">
          <p className={`font-semibold`}>Day {day}</p>
        </div>
        <div className="flex items-center gap-1">
          {menu.days > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
              onClick={() => {
                commit(
                  events.menuDayRemove({
                    id: menu.id,
                    day,
                    newDays: menu.days - 1,
                    updatedAt: DateTime.unsafeNow(),
                  }),
                )
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
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

      {/* Day Content - Always Visible */}
      <div>
        {dayEntries.length > 0 && (
          <div className="divide-y divide-gray-200">
            {dayEntries.map((entry) => (
              <DayEntryItem key={entry.id} entry={entry} />
            ))}
          </div>
        )}

        {dayEntries.length === 0 && (
          <div className="p-3 text-center">
            <p className="text-sm text-gray-500">No recipes added yet</p>
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
        borderWidth: "1px",
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
      className="flex items-center p-3 gap-3 bg-white relative rounded-lg border-gray-200"
      to="/recipes/$id"
      disabled={debouncedIsDragging}
      params={{ id: recipe.id }}
      ref={setNodeRef}
      style={style}
      {...attributes}
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
        <h4 className="font-medium text-sm text-gray-900 line-clamp-1">
          {recipe.title}
        </h4>
        <p className="text-xs text-gray-500">
          {[
            ...Option.match(recipe.totalTime, {
              onNone: () => [],
              onSome: (duration) => [Duration.format(duration)],
            }),
            ...(recipe.servings ? [`${recipe.servings} servings`] : []),
          ].join(" • ")}
        </p>
      </div>
      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
        <div
          ref={setActivatorNodeRef}
          className={cn(
            "touch-none p-2",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
          {...listeners}
        >
          <GripVertical className="size-5 text-gray-400" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault()
            commit(events.menuEntryRemove({ id }))
          }}
          className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
        >
          <X className="w-4 h-4" />
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
      className="h-8 w-8 p-0 text-orange-600 hover:bg-orange-100"
      {...props}
    >
      <Plus className="w-4 h-4" />
    </Button>
  )
}
