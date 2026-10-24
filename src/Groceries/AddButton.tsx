import { Plus, Check, ShoppingCart } from "lucide-react"
import { useContext, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { RegistryContext, useAtom, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"
import { Recipe } from "@/domain/Recipe"
import { checkedIngredientsAtom } from "@/Recipes/atoms"
import { cn } from "@/lib/utils"
import { groceryPantryNamesAtom } from "./atoms"
import {
  type GroceryCandidate,
  type GroceryCandidateGroup,
  defaultGrocerySelection,
  groceryCandidates,
  selectedGroceryItems,
} from "./candidates"
import { addToGroceriesAtom } from "./runtime"

// Opens a dialog to pick which of the recipes' ingredients go on the grocery
// list. Pantry items and ingredients ticked off on a recipe start unselected.
export function AddToGroceriesButton({
  recipes,
}: {
  recipes: Iterable<Recipe>
}) {
  const [groceryAddResult, addToGroceries] = useAtom(addToGroceriesAtom)
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-0 px-2!"
          title="Add to grocery list"
        >
          {groceryAddResult.waiting ? (
            <Check className="size-3 mt-px motion-safe:animate-tick-pop" />
          ) : (
            <Plus className="size-3 mt-px" />
          )}
          <ShoppingCart />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto] rounded-2xl">
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

function AddToGroceriesForm({
  recipes,
  onSubmit,
}: {
  recipes: Iterable<Recipe>
  onSubmit: (items: ReturnType<typeof selectedGroceryItems>) => void
}) {
  const pantryNames = useAtomValue(groceryPantryNamesAtom)
  return (
    <>
      <DialogHeader className="text-left">
        <DialogTitle className="font-display text-[22px] font-medium tracking-tight">
          Add to groceries
        </DialogTitle>
        <DialogDescription>
          Pantry items and ingredients you've ticked off start unselected.
        </DialogDescription>
      </DialogHeader>
      {/* The selection starts from the pantry, so it waits for it */}
      {AsyncResult.isSuccess(pantryNames) ? (
        <CandidateList
          recipes={recipes}
          pantryNames={pantryNames.value}
          onSubmit={onSubmit}
        />
      ) : null}
    </>
  )
}

function CandidateList({
  recipes,
  pantryNames,
  onSubmit,
}: {
  recipes: Iterable<Recipe>
  pantryNames: ReadonlySet<string>
  onSubmit: (items: ReturnType<typeof selectedGroceryItems>) => void
}) {
  const registry = useContext<AtomRegistry>(RegistryContext)
  // Worked out once as the dialog opens, so the list holds still while the
  // user picks
  const [groups] = useState(() =>
    groceryCandidates(recipes, {
      pantryNames,
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
        onSubmit(selectedGroceryItems(groups, selected))
      }}
    >
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">
          There are no ingredients to add.
        </p>
      ) : (
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
      )}
      <DialogFooter className="gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={selected.size === 0}>
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
    <section className="py-2">
      {showTitle && (
        <h3 className="font-medium text-sm pt-1 pb-1">{group.recipe.title}</h3>
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
      <span
        className={cn(
          "flex-1 min-w-0 transition-colors duration-300",
          !checked && "text-muted-foreground",
        )}
      >
        {ingredient.name}
        {quantity && (
          <span className="text-sm text-muted-foreground ml-2 tabular-nums">
            {quantity}
          </span>
        )}
      </span>
      {reason && (
        <span className="text-xs text-muted-foreground mt-[0.35em] shrink-0">
          {reasonLabel[reason]}
        </span>
      )}
    </label>
  )
}
