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
import type { Recipe } from "@/domain/Recipe"
import * as DateTime from "effect/DateTime"
import { cn } from "@/lib/utils"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import { useWrite } from "@/EventLog"
import {
  allMenusAtom,
  menuDayPreviewsAtom,
  menuRecipeCountsAtom,
} from "@/Menus/atoms"
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
import { FadeImage } from "@/components/FadeImage"

export const Route = createFileRoute("/menus/")({
  component: MenusPage,
})

export function MenusPage() {
  return (
    <div className="pb-content">
      {/* Header */}
      <header className="bg-background sticky top-bar-offset z-10">
        <div className="page-wide pt-3 pb-3 md:pt-6">
          <div className="flex items-center justify-between md:min-h-11">
            {/* The count sits on the heading's baseline, as it does on the
                recipes page */}
            <div className="flex items-baseline">
              <h1 className="font-display text-[26px] md:text-[32px] md:leading-none font-medium tracking-tight">
                Menus
              </h1>
              <MenuCount />
            </div>
            <div className="flex-1" />
            <div>
              <AddMenuButton small />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="page-wide py-2 flex flex-col gap-4">
        <AddMenuForm />
        <MenuList />
      </main>
    </div>
  )
}

function MenuCount() {
  const result = useAtomValue(allMenusAtom)
  if (!AsyncResult.isSuccess(result)) return null
  return (
    <span className="ml-4 text-sm text-muted-foreground tabular-nums">
      {result.value.length} saved
    </span>
  )
}

function AddMenuForm() {
  const [showForm, setShowForm] = useAtom(showAddMenu)
  const write = useWrite()

  if (!showForm) return null

  return (
    <MenuForm
      className="md:max-w-md"
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
  // Tiles start at the top of their row: a fortnight is taller than a week
  return (
    <div className="grid items-start gap-x-3 gap-y-5 md:grid-cols-2 md:gap-x-5 md:gap-y-6 lg:grid-cols-3">
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
      <h3 className="text-lg font-medium  mb-2">No menus yet</h3>
      <p className="text-muted-foreground mb-6 px-4 max-w-sm mx-auto text-balance">
        Plan a week or a fortnight of recipes once, then add it to the meal plan
        whenever you like.
      </p>
      <AddMenuButton />
    </div>
  )
}

// A menu is a tile like a recipe's: its days as a grid of plates, then its
// name and size, with the actions on the name's line.
function MenuCard({ menu }: { menu: Menu }) {
  const write = useWrite()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  // The counts and previews also need the menu entries, so they can load
  // after the menus. Until then there's no count rather than "0 recipes",
  // and the day grid keeps its shape with every day bare.
  const counts = useAtomValue(menuRecipeCountsAtom)
  const recipeCount = AsyncResult.isSuccess(counts)
    ? (counts.value.get(menu.idString) ?? 0)
    : null
  const previews = useAtomValue(menuDayPreviewsAtom)
  const days = AsyncResult.isSuccess(previews)
    ? previews.value.get(menu.idString)
    : undefined
  return (
    <div className="group relative">
      <Link
        to="/menus/$id"
        params={{ id: menu.idString }}
        className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        disabled={editing}
      >
        <DayGrid days={menu.days} recipes={days} />
        <div className="mt-2 md:mt-3 pr-10">
          {editing ? (
            <MenuForm
              initialValue={menu}
              onSubmit={(updated) => {
                write(menuUpdate(updated))
                setEditing(false)
              }}
              onCancel={() => setEditing(false)}
              compact
            />
          ) : (
            <h3 className="font-display text-[18px] md:text-[20px] font-medium leading-6 tracking-tight line-clamp-1">
              {menu.name}
            </h3>
          )}
          <p className="mt-0.5 flex h-[18px] items-center gap-1 text-[13px] leading-[18px] text-muted-foreground tabular-nums">
            <span>{menu.days} days</span>
            {recipeCount !== null && (
              <>
                <span>·</span>
                <span>{recipeCount} recipes</span>
              </>
            )}
          </p>
        </div>
      </Link>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="absolute -right-1.5 bottom-0.5 size-9 rounded-full p-0 text-muted-foreground hover:text-foreground"
            aria-label={`Actions for ${menu.name}`}
          >
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

// The most days a tile draws; the day count beside the name stays exact
const gridDays = 35

// A menu's days as plates on a grid, a week to a row, so a week and a
// fortnight look like what they are. Each day shows the photo of its first
// recipe, a day whose recipe has no photo shows the recipe's initial, and an
// unplanned day is hatched. The menu's days are known before its entries
// load, so the grid keeps its shape, every day plain, while they arrive.
function DayGrid({
  days,
  recipes,
}: {
  days: number
  recipes: ReadonlyArray<Recipe | undefined> | undefined
}) {
  const count = Math.min(gridDays, Math.max(1, Math.floor(days)))
  return (
    <div
      className="grid grid-cols-7 gap-0.5 overflow-hidden rounded-xl"
      aria-hidden
    >
      {Array.from({ length: count }, (_, index) => {
        if (recipes === undefined) {
          return (
            <div key={index} className="aspect-square rounded-[5px] bg-muted" />
          )
        }
        const recipe = recipes[index]
        if (recipe === undefined) {
          return (
            <div
              key={index}
              className="aspect-square rounded-[5px] bg-muted/50 bg-[repeating-linear-gradient(135deg,var(--border)_0_1px,transparent_1px_6px)]"
            />
          )
        }
        // Keyed by recipe, so a day whose first recipe changes starts over
        return <DayPlate key={`${index}:${recipe.idString}`} recipe={recipe} />
      })}
    </div>
  )
}

// A day with a recipe: its photo, or its initial on the brand tint when it
// has no photo or the photo fails to load
function DayPlate({ recipe }: { recipe: Recipe }) {
  const [failed, setFailed] = useState(false)
  const photo = failed ? null : recipe.imageUrl
  const initial = Array.from(recipe.title.trim())[0]?.toLocaleUpperCase()
  return (
    <div
      title={recipe.title}
      className={cn(
        "@container relative aspect-square overflow-hidden rounded-[5px]",
        photo ? "bg-muted" : "bg-primary-muted text-primary",
      )}
    >
      {photo ? (
        <FadeImage
          src={photo}
          alt=""
          className="absolute inset-0 h-full w-full object-cover motion-safe:transition-[opacity,scale] motion-safe:duration-300 motion-safe:group-hover:scale-[1.04] motion-safe:group-active:scale-[0.97]"
          onError={() => setFailed(true)}
        />
      ) : initial ? (
        <span className="absolute inset-0 flex items-center justify-center font-display text-[48cqw] font-medium leading-none tracking-tight select-none">
          {initial}
        </span>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <ChefHat className="size-[42%] opacity-60" />
        </div>
      )}
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
