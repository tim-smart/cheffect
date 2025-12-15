import { createFileRoute, Link } from "@tanstack/react-router"
import { X, Plus, ArrowLeft, Calendar } from "lucide-react"
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

export const Route = createFileRoute("/menu/$id")({
  component: MenuDetailPage,
})

export function MenuDetailPage() {
  const { id } = Route.useParams()
  const commit = useCommit()
  const menu = useAtomSuspense(menuByIdAtom(id)).value
  const entries = useAtomValue(menuEntriesAtom(id))!

  return (
    <div className="bg-gray-50 pb-20">
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
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold text-gray-900 line-clamp-1 flex-1">
              {menu.name}
            </h1>
            <MealPlanDatePicker
              target={MealPlanDatePickerTarget.Menu({
                id: menu.id,
              })}
            >
              <Button variant="outline" size="icon" className="h-8 w-8">
                <Calendar className="w-4 h-4" />
              </Button>
            </MealPlanDatePicker>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-2 py-3 flex flex-col gap-4">
        <DayList menu={menu} entries={entries} />
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
  const commit = useCommit()
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-200">
      {Array.range(1, menu.days).map((day) => {
        const dayEntries = entries.filter((entry) => entry.day === day)
        return (
          <div key={day} className="bg-white">
            <div
              className={`w-full px-3 py-3 flex items-center justify-between border-b bg-gray-50`}
            >
              <div className="flex items-center gap-3 flex-1">
                <p className={`font-semibold text-gray-900`}>Day {day}</p>
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
                  {dayEntries.map(({ id, recipe }) => (
                    <Link
                      key={id}
                      className="flex items-center p-3 gap-3"
                      to="/recipe/$id"
                      params={{ id: recipe.id }}
                    >
                      <div className="relative w-12 h-12 shrink-0 rounded overflow-hidden">
                        <img
                          src={recipe.imageUrl || "/placeholder.svg"}
                          alt={recipe.title}
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                        />
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
                            ...(recipe.servings
                              ? [`${recipe.servings} servings`]
                              : []),
                          ].join(" • ")}
                        </p>
                      </div>
                      <div>
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
      })}
    </div>
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
