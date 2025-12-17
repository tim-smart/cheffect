import { createFileRoute, Link } from "@tanstack/react-router"
import { BookOpen, Plus, ChefHat, Edit, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FormBody, FormDisplay } from "@inato-form/core"
import { TextInput } from "@inato-form/fields"
import * as Effect from "effect/Effect"
import { ShadcnReactHookFormLayer } from "@/lib/InatoForm"
import { Menu } from "@/domain/Menu"
import * as DateTime from "effect/DateTime"
import { cn } from "@/lib/utils"
import {
  Atom,
  useAtom,
  useAtomSet,
  useAtomSuspense,
  useAtomValue,
} from "@effect-atom/atom-react"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { allMenusAtom, menuRecipeCountAtom } from "@/Menus/atoms"
import { useState } from "react"
import {
  MealPlanDatePicker,
  MealPlanDatePickerTarget,
} from "@/MealPlan/DatePicker"

export const Route = createFileRoute("/menus")({
  component: MenusPage,
})

export function MenusPage() {
  return (
    <div className="bg-gray-50 pb-30">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-orange-600" />
              <h1 className="text-lg font-bold text-gray-900">Menus</h1>
            </div>
            <div className="flex-1" />
            <div>
              <AddMenuButton small />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-2 py-3 flex flex-col gap-4">
        <AddMenuForm />
        <MenuList />
      </main>
    </div>
  )
}

function AddMenuForm() {
  const [showForm, setShowForm] = useAtom(showAddMenu)
  const commit = useCommit()

  if (!showForm) return null

  return (
    <MenuForm
      className="max-w-lg mx-auto px-2 sm:px-4"
      onSubmit={(menu) => {
        commit(events.menuAdd(menu))
        setShowForm(false)
      }}
      onCancel={() => setShowForm(false)}
    />
  )
}

function MenuList() {
  const menus = useAtomSuspense(allMenusAtom).value

  if (menus.length === 0) {
    return <NoResults />
  }
  return (
    <div
      className={`rounded-lg border bg-white overflow-hidden divide-y divide-gray-200 border-gray-200`}
    >
      {menus.map((menu) => (
        <MenuCard key={menu.id} menu={menu} />
      ))}
    </div>
  )
}

function NoResults() {
  return (
    <div className="text-center py-16">
      <ChefHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">No menus found</h3>
      <p className="text-gray-500 mb-6 px-4">Start by adding your first menu</p>
      <AddMenuButton />
    </div>
  )
}

function MenuCard({ menu }: { menu: Menu }) {
  const commit = useCommit()
  const [editing, setEditing] = useState(false)
  const recipeCount = useAtomValue(menuRecipeCountAtom(menu.id))
  return (
    <div className="flex items-center h-20 pl-4 pr-2 active:bg-gray-50 transition-colors">
      <Link
        to="/menu/$id"
        params={{ id: menu.id }}
        className="flex-1 flex flex-col gap-1"
        disabled={editing}
      >
        <div className="flex flex-row items-center gap-2">
          <BookOpen className="w-5 h-5 text-orange-600" />
          <h3 className={cn(editing ? "" : "line-clamp-1", "font-medium")}>
            {editing ? (
              <MenuForm
                initialValue={menu}
                onSubmit={(updated) => {
                  commit(events.menuUpdate(updated))
                  setEditing(false)
                }}
                onCancel={() => setEditing(false)}
                compact
              />
            ) : (
              menu.name
            )}
          </h3>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="flex items-center gap-0.5">{menu.days} days</div>
          &bull;
          <div className="flex items-center gap-0.5">{recipeCount} recipes</div>
        </div>
      </Link>

      <div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.preventDefault()
            setEditing(true)
          }}
        >
          <Edit />
        </Button>
        <MealPlanDatePicker
          target={MealPlanDatePickerTarget.Menu({
            id: menu.id,
          })}
        >
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Calendar />
          </Button>
        </MealPlanDatePicker>
      </div>
    </div>
  )
}

const showAddMenu = Atom.make(false)

function AddMenuButton({ small = false }: { small?: boolean }) {
  const setShowAddMenu = useAtomSet(showAddMenu)

  if (small) {
    return (
      <Button variant="outline" size="sm" onClick={() => setShowAddMenu(true)}>
        <Plus className="w-4 h-4" />
        Menu
      </Button>
    )
  }
  return (
    <Button
      className="bg-orange-600 hover:bg-orange-700 h-12 px-6"
      onClick={() => setShowAddMenu(true)}
    >
      <Plus />
      Add Menu
    </Button>
  )
}

const MenuFormSchema = FormBody.struct({
  name: TextInput.Required,
})

const Display = FormDisplay.make(MenuFormSchema).pipe(
  Effect.provide(ShadcnReactHookFormLayer),
  Effect.runSync,
)

function MenuForm({
  className,
  onSubmit,
  onCancel,
  initialValue,
  compact = false,
}: {
  className?: string
  onSubmit: (item: Menu) => void
  onCancel?: () => void
  initialValue?: Menu | undefined
  compact?: boolean
}) {
  const isEditing = !!initialValue
  return (
    <Display.Form
      initialValues={
        initialValue
          ? {
              encoded: {
                ...initialValue,
              },
            }
          : undefined
      }
      onError={(error) => {
        console.error("Form submission error:", error)
      }}
      onSubmit={(...args) => {
        const [{ decoded }] = args
        const controls = (args as any)[1]
        const item = initialValue
          ? new Menu({
              ...initialValue,
              ...decoded,
              updatedAt: DateTime.unsafeNow(),
            })
          : Menu.fromForm(decoded)
        onSubmit(item)
        controls.reset()
      }}
    >
      {compact ? (
        <Display.name placeholder="Menu name" {...{ autoFocus: true }} />
      ) : (
        <div
          className={cn(
            className,
            "bg-white rounded-lg border border-gray-200 p-3",
          )}
        >
          {!isEditing && (
            <h3 className="font-medium text-gray-900 mb-2">Add new menu</h3>
          )}
          <div className={"space-y-2"}>
            <div>
              <Display.name placeholder="Menu name" {...{ autoFocus: true }} />
            </div>
            <div className={`flex gap-2`}>
              <Button
                type="submit"
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                {isEditing ? "Save" : "Add menu"}
              </Button>
              {onCancel && (
                <Button
                  type="button"
                  onClick={() => onCancel()}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Display.Form>
  )
}
