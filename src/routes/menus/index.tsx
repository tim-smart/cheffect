import { createFileRoute, Link } from "@tanstack/react-router"
import {
  BookOpen,
  Plus,
  ChefHat,
  Edit,
  Calendar,
  MoreVertical,
  Trash,
} from "lucide-react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export const Route = createFileRoute("/menus/")({
  component: MenusPage,
})

export function MenusPage() {
  return (
    <div className="pb-content">
      {/* Header */}
      <header className="bg-background border-b border-border sticky top-0 z-10">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold ">Menus</h1>
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
      className={`rounded-lg border bg-card overflow-hidden divide-y divide-border border-border`}
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
      <ChefHat className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
      <h3 className="text-lg font-medium  mb-2">No menus found</h3>
      <p className="text-muted-foreground mb-6 px-4">
        Start by adding your first menu
      </p>
      <AddMenuButton />
    </div>
  )
}

function MenuCard({ menu }: { menu: Menu }) {
  const commit = useCommit()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const recipeCount = useAtomValue(menuRecipeCountAtom(menu.id))
  return (
    <div className="flex items-center pr-2 active:bg-muted transition-colors">
      <Link
        to="/menus/$id"
        params={{ id: menu.id }}
        className="flex-1 flex flex-col gap-1 h-20 justify-center pl-4"
        disabled={editing}
      >
        <div className="flex flex-row items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
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

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-0.5">{menu.days} days</div>
          &bull;
          <div className="flex items-center gap-0.5">{recipeCount} recipes</div>
        </div>
      </Link>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="p-2">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <MealPlanDatePicker
            target={MealPlanDatePickerTarget.Menu({
              id: menu.id,
            })}
            onSelect={() => setMenuOpen(false)}
          >
            <DropdownMenuItem>
              <Calendar />
              Add to meal plan
            </DropdownMenuItem>
          </MealPlanDatePicker>
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault()
              setMenuOpen(false)
              setTimeout(() => setEditing(true), 50)
            }}
          >
            <Edit />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault()
              setMenuOpen(false)
              if (!confirm("Are you sure you want to remove this menu?")) {
                return
              }
              commit(events.menuRemove({ id: menu.id }))
            }}
          >
            <Trash />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

const showAddMenu = Atom.make(false)

function AddMenuButton({ small = false }: { small?: boolean }) {
  const setShowAddMenu = useAtomSet(showAddMenu)

  if (small) {
    return (
      <Button variant="outline" size="sm" onClick={() => setShowAddMenu(true)}>
        <Plus />
        New
      </Button>
    )
  }
  return (
    <Button
      className="bg-primary hover:bg-orange-700 h-12 px-6"
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
            "bg-background rounded-lg border border-border p-3",
          )}
        >
          {!isEditing && <h3 className="font-medium  mb-2">Add new menu</h3>}
          <div className={"space-y-2"}>
            <div>
              <Display.name placeholder="Menu name" {...{ autoFocus: true }} />
            </div>
            <div className={`flex gap-2`}>
              <Button
                type="submit"
                className="flex-1 bg-primary hover:bg-orange-700"
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
