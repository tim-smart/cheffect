import { Plus, Check, ChevronDown, ShoppingCart, X } from "lucide-react"
import { useContext, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RegistryContext, useAtom, useAtomValue } from "@effect/atom-react"
import * as Iterable from "effect/Iterable"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"
import { PANTRY_GROCERY_LIST_NAME } from "@/domain/GroceryItem"
import { Recipe } from "@/domain/Recipe"
import { checkedIngredientsAtom } from "@/Recipes/atoms"
import { cn } from "@/lib/utils"
import { groceryListNamesAtom, groceryInPantryAtom } from "./atoms"
import {
  type GroceryCandidate,
  type GroceryCandidateGroup,
  defaultGrocerySelection,
  groceryCandidates,
  selectedGroceryItems,
} from "./candidates"
import { addToGroceriesAtom } from "./runtime"

// Opens a dialog to pick which of the recipes' ingredients go on a grocery
// list. Pantry items and ingredients ticked off on a recipe start unselected.
export function AddToGroceriesButton({
  recipes,
}: {
  recipes: Iterable<Recipe>
}) {
  const [groceryAddResult, addToGroceries] = useAtom(addToGroceriesAtom)
  const [open, setOpen] = useState(false)
  const hasIngredients = Iterable.some(recipes, (recipe) =>
    recipe.ingredients.some((group) => group.ingredients.length > 0),
  )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-0 px-2!"
          title="Add to grocery list"
          disabled={!hasIngredients}
        >
          {groceryAddResult.waiting ? (
            <Check className="size-3 mt-px motion-safe:animate-tick-pop" />
          ) : (
            <Plus className="size-3 mt-px" />
          )}
          <ShoppingCart />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-sm max-h-[85dvh] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] rounded-2xl"
        aria-describedby={undefined}
        hideClose
      >
        <AddToGroceriesForm
          recipes={recipes}
          onSubmit={(items) => {
            addToGroceries(items)
            setOpen(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

const listLabel = (list: string | null) => list ?? "Grocery list"

function AddToGroceriesForm({
  recipes,
  onSubmit,
}: {
  recipes: Iterable<Recipe>
  onSubmit: (items: ReturnType<typeof selectedGroceryItems>) => void
}) {
  const inPantry = useAtomValue(groceryInPantryAtom)
  // Recipe ingredients are for buying, so the pantry isn't offered
  const lists = useAtomValue(groceryListNamesAtom).pipe(
    AsyncResult.map((names) =>
      names.filter((name) => name !== PANTRY_GROCERY_LIST_NAME),
    ),
    AsyncResult.getOrElse((): ReadonlyArray<string | null> => [null]),
  )
  const [list, setList] = useState<string | null>(null)
  return (
    <>
      {/* The close button shares the title's row, so the two line up */}
      <DialogHeader className="flex-row items-center gap-2 space-y-0 text-left">
        <DialogTitle className="flex flex-1 items-center gap-[0.3em] min-w-0 font-display text-[22px] font-medium tracking-tight">
          <span className="shrink-0">Add to</span>{" "}
          {lists.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 min-w-0 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                <span className="truncate">{listLabel(list)}</span>
                <ChevronDown className="size-5 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={list ?? ""}
                  onValueChange={(value) =>
                    setList(value === "" ? null : value)
                  }
                >
                  {lists.map((name) => (
                    <DropdownMenuRadioItem key={name ?? ""} value={name ?? ""}>
                      {listLabel(name)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="truncate">{listLabel(list)}</span>
          )}
        </DialogTitle>
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            // The cross itself, not the button around it, sits on the content edge
            className="-mr-3 shrink-0 text-muted-foreground [&_svg]:size-5"
          >
            <X />
          </Button>
        </DialogClose>
      </DialogHeader>
      {/* The selection starts from the pantry, so it waits for it */}
      {AsyncResult.isSuccess(inPantry) ? (
        <CandidateList
          recipes={recipes}
          inPantry={inPantry.value}
          list={list}
          onSubmit={onSubmit}
        />
      ) : null}
    </>
  )
}

function CandidateList({
  recipes,
  inPantry,
  list,
  onSubmit,
}: {
  recipes: Iterable<Recipe>
  inPantry: (name: string) => boolean
  list: string | null
  onSubmit: (items: ReturnType<typeof selectedGroceryItems>) => void
}) {
  const registry = useContext<AtomRegistry>(RegistryContext)
  // Worked out once as the dialog opens, so the list holds still while the
  // user picks
  const [groups] = useState(() =>
    groceryCandidates(recipes, {
      inPantry,
      ticked: (recipe) => registry.get(checkedIngredientsAtom(recipe.idString)),
    }),
  )
  const [selected, setSelected] = useState(() =>
    defaultGrocerySelection(groups),
  )
  const total = groups.reduce((n, group) => n + group.candidates.length, 0)
  const allSelected = selected.size === total
  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })

  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(selectedGroceryItems(groups, selected, list))
      }}
    >
      <div className="flex flex-col min-h-0 -mx-6">
        <div className="flex items-center justify-between px-6 pb-2">
          <span className="text-sm text-muted-foreground tabular-nums">
            {selected.size} of {total} selected
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-mr-3"
            onClick={() =>
              setSelected(
                allSelected
                  ? new Set()
                  : new Set(
                      groups.flatMap((group) =>
                        group.candidates.map((candidate) => candidate.key),
                      ),
                    ),
              )
            }
          >
            {allSelected ? "Deselect all" : "Select all"}
          </Button>
        </div>
        <div className="overflow-y-auto overscroll-contain border-y border-border px-6">
          {groups.map((group) => (
            <CandidateGroup
              key={group.key}
              group={group}
              showTitle={groups.length > 1}
              selected={selected}
              onToggle={toggle}
            />
          ))}
        </div>
      </div>
      {/* As much room above the button as below it */}
      <DialogFooter className="pt-2">
        {/* Starts focused, as the defaults are usually what's wanted */}
        <Button type="submit" disabled={selected.size === 0} autoFocus>
          {selected.size === 1 ? "Add 1 item" : `Add ${selected.size} items`}
        </Button>
      </DialogFooter>
    </form>
  )
}

function CandidateGroup({
  group,
  showTitle,
  selected,
  onToggle,
}: {
  group: GroceryCandidateGroup
  showTitle: boolean
  selected: ReadonlySet<string>
  onToggle: (key: string) => void
}) {
  return (
    <section className={showTitle ? "pb-2" : "py-2"}>
      {showTitle && (
        // Stays at the top of the list while its rows scroll under it
        <h3 className="sticky top-0 z-10 bg-background font-medium text-sm pt-3 pb-2 border-b border-border">
          {group.recipe.title}
        </h3>
      )}
      <div className="divide-y divide-border">
        {group.candidates.map((candidate) => (
          <CandidateRow
            key={candidate.key}
            candidate={candidate}
            checked={selected.has(candidate.key)}
            onToggle={() => onToggle(candidate.key)}
          />
        ))}
      </div>
    </section>
  )
}

const reasonLabel = {
  pantry: "In pantry",
  ticked: "Ticked off",
} as const

function CandidateRow({
  candidate,
  checked,
  onToggle,
}: {
  candidate: GroceryCandidate
  checked: boolean
  onToggle: () => void
}) {
  const { ingredient, reason } = candidate
  const quantity = ingredient.quantityWithUnit
  return (
    <label className="flex items-start gap-3 py-2.5 active:bg-muted transition-colors cursor-default">
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        className="mt-[0.2em] size-[18px] rounded-full"
      />
      {/* Quantity first, as on the recipe page */}
      <span
        className={cn(
          "flex-1 min-w-0 transition-colors duration-300",
          !checked && "text-muted-foreground",
        )}
      >
        {quantity && `${quantity} `}
        {ingredient.name}
      </span>
      {reason && (
        <span className="text-xs text-muted-foreground mt-[0.35em] shrink-0">
          {reasonLabel[reason]}
        </span>
      )}
    </label>
  )
}
