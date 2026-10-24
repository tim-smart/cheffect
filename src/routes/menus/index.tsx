import { createFileRoute, Link } from "@tanstack/react-router"
import {
  Plus,
  ChefHat,
  Edit,
  Calendar,
  MoreVertical,
  Trash,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { FormBody, FormDisplay } from "@/lib/Form"
import { TextInput } from "@/lib/InatoForm"
import { Menu } from "@/domain/Menu"
import * as DateTime from "effect/DateTime"
import { cn } from "@/lib/utils"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import { useWrite } from "@/EventLog"
import { allMenusAtom, menuRecipeCountsAtom } from "@/Menus/atoms"
import { useState, type CSSProperties } from "react"
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
import { MenuEvent, menuUpdate } from "@/Menus/Events"

export const Route = createFileRoute("/menus/")({
  component: MenusPage,
})

export function MenusPage() {
  return (
    <div className="pb-content">
      {/* Header */}
      <header className="bg-background sticky top-bar-offset z-10">
        <div className="page-narrow pt-3 pb-3 md:pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[26px] md:text-[32px] font-medium tracking-tight">
                Menus
              </h1>
            </div>
            <div className="flex-1" />
            <div>
              <AddMenuButton small />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="page-narrow py-2 flex flex-col gap-4">
        <AddMenuForm />
        <MenuList />
      </main>
    </div>
  )
}

function AddMenuForm() {
  const [showForm, setShowForm] = useAtom(showAddMenu)
  const write = useWrite()

  if (!showForm) return null

  return (
    <MenuForm
      onSubmit={(menu) => {
        write(MenuEvent.set(menu))
        setShowForm(false)
      }}
      onCancel={() => setShowForm(false)}
    />
  )
}

function MenuList() {
  // Doesn't suspend, so the page shows while the menus load.
  const result = useAtomValue(allMenusAtom)
  if (AsyncResult.isFailure(result)) {
    return (
      <p role="alert" className="text-center py-16 text-muted-foreground">
        Couldn't load menus. Reload the app to try again.
      </p>
    )
  }
  if (!AsyncResult.isSuccess(result)) return null
  const menus = result.value

  if (menus.length === 0) {
    return <NoResults />
  }
  return (
    <div className="flex flex-col gap-2">
      {menus.map((menu, index) => (
        <div
          key={menu.idString}
          className="motion-safe:animate-rise-in stagger"
          style={{ "--i": index } as CSSProperties}
        >
          <MenuCard menu={menu} />
        </div>
      ))}
    </div>
  )
}

function NoResults() {
  return (
    <div className="text-center py-16 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-500">
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
  const write = useWrite()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  // The counts also need the menu entries, so they can load after the menus.
  // Until then there's no count rather than "0 recipes".
  const counts = useAtomValue(menuRecipeCountsAtom)
  const recipeCount = AsyncResult.isSuccess(counts)
    ? (counts.value.get(menu.idString) ?? 0)
    : null
  return (
    <div className="flex items-center pr-2 rounded-xl bg-card active:bg-muted transition-colors">
      <Link
        to="/menus/$id"
        params={{ id: menu.idString }}
        className="flex-1 flex flex-col gap-0.5 min-h-16 justify-center pl-4 py-2.5"
        disabled={editing}
      >
        <div className="flex flex-row items-center gap-2">
          {editing ? (
            <div className="flex-1">
              <MenuForm
                initialValue={menu}
                onSubmit={(updated) => {
                  write(menuUpdate(updated))
                  setEditing(false)
                }}
                onCancel={() => setEditing(false)}
                compact
              />
            </div>
          ) : (
            <h3 className="font-display text-[20px] font-medium tracking-tight line-clamp-1">
              {menu.name}
            </h3>
          )}
        </div>

        <div className="flex items-center gap-1 text-[13px] text-muted-foreground tabular-nums">
          <span>{menu.days} days</span>
          {recipeCount !== null && (
            <>
              <span>·</span>
              <span>{recipeCount} recipes</span>
            </>
          )}
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
              id: menu.idString,
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
            variant="destructive"
            onClick={(e) => {
              e.preventDefault()
              setMenuOpen(false)
              if (!confirm("Are you sure you want to remove this menu?")) {
                return
              }
              write(MenuEvent.remove({ id: menu.id }))
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
      <Button
        variant="outline"
        size="sm"
        className="h-10 rounded-full px-4 shadow-none"
        onClick={() => setShowAddMenu(true)}
      >
        <Plus />
        New
      </Button>
    )
  }
  return (
    <Button
      className="bg-primary hover:bg-primary/90 h-12 px-6 rounded-full shadow-none"
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

const Display = FormDisplay.make(MenuFormSchema, Button)

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
      onSubmit={({ decoded }, controls) => {
        const item = initialValue
          ? new Menu({
              ...initialValue,
              ...decoded,
              updatedAt: DateTime.nowUnsafe(),
            })
          : Menu.fromForm(decoded)
        onSubmit(item)
        controls.reset()
      }}
    >
      {compact ? (
        <Display.name placeholder="Menu name" {...{ autoFocus: true }} />
      ) : (
        <div className={cn(className, "bg-card rounded-xl p-3")}>
          {!isEditing && <h3 className="font-medium  mb-2">Add new menu</h3>}
          <div className={"space-y-2"}>
            <div>
              <Display.name placeholder="Menu name" {...{ autoFocus: true }} />
            </div>
            <div className={`flex gap-2`}>
              <Button
                type="submit"
                className="flex-1 bg-primary hover:bg-primary/90"
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
