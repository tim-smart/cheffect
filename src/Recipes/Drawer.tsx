import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Slot } from "@radix-ui/react-slot"
import { Recipe } from "@/domain/Recipe"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import React, { useState } from "react"
import {
  mealPlanRecipesAtom,
  mealPlanRecipesQueryAtom,
  recipesRuntime,
} from "./atoms"
import { RecipeList } from "./List"
import { RecipeRepo } from "./Repo"

// The best match for the query, read from the repo rather than from whatever
// the results list last rendered.
const firstMatchAtom = recipesRuntime.fn<string>()((query) =>
  RecipeRepo.use((repo) => repo.search({ query, sortBy: "title" })).pipe(
    Effect.map(Array.head),
  ),
)

export function SelectRecipeDrawer({
  children,
  onSelect,
}: {
  children: React.ReactNode
  onSelect: (recipe: Recipe) => void
}) {
  // Mounting a drawer is real work (it measures the page for its snap
  // points), and a week of days wants seven of them. Until the trigger is
  // first pressed there is only the trigger; the drawer mounts on that
  // press, already open, and stays mounted from then on
  const [open, setOpen] = useState<boolean | null>(null)
  const firstMatch = useAtomSet(firstMatchAtom, { mode: "promise" })
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  )

  if (open === null) {
    return (
      <Slot
        aria-haspopup="dialog"
        aria-expanded={false}
        onClick={() => setOpen(true)}
      >
        {children}
      </Slot>
    )
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild children={children} />
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>Select a recipe</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 flex flex-col gap-4">
            <SearchInput
              onSubmit={async (query) => {
                const recipe = await firstMatch(query)
                if (Option.isSome(recipe)) {
                  onSelect(recipe.value)
                  setOpen(false)
                }
              }}
            />
            <div
              ref={setScrollElement}
              className="h-80 overflow-y-auto border border-border rounded-lg"
            >
              <SearchResults
                getScrollElement={() => scrollElement}
                onSelect={(recipe) => {
                  onSelect(recipe)
                  setOpen(false)
                }}
              />
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function SearchInput({ onSubmit }: { onSubmit: (query: string) => void }) {
  const [query, setQuery] = useAtom(mealPlanRecipesQueryAtom)
  return (
    <Input
      placeholder="Search for recipes"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          onSubmit(query)
        }
      }}
      autoFocus
    />
  )
}

function SearchResults({
  getScrollElement,
  onSelect,
}: {
  getScrollElement: () => HTMLElement | null
  onSelect: (recipe: Recipe) => void
}) {
  const query = useAtomValue(mealPlanRecipesQueryAtom)
  const recipes = useAtomValue(mealPlanRecipesAtom)
  return AsyncResult.builder(recipes)
    .onSuccess((recipes) => (
      <RecipeList
        recipes={recipes}
        searchQuery={query}
        onSelect={onSelect}
        rounded={false}
        getScrollElement={getScrollElement}
      />
    ))
    .render()
}
