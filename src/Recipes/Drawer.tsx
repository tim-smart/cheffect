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
import { Recipe } from "@/domain/Recipe"
import {
  mealPlanRecipesAtom,
  mealPlanRecipesQueryAtom,
} from "@/livestore/queries"
import { RegistryContext, useAtom, useAtomValue } from "@effect-atom/atom-react"
import React, { useContext, useState } from "react"
import { RecipeList } from "./List"

export function SelectRecipeDrawer({
  children,
  onSelect,
}: {
  children: React.ReactNode
  onSelect: (recipe: Recipe) => void
}) {
  const [open, setOpen] = useState(false)
  const registry = useContext(RegistryContext)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  )

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
              onSubmit={() => {
                const recipe = registry.get(mealPlanRecipesAtom)![0]
                if (recipe) {
                  onSelect(recipe)
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

function SearchInput({ onSubmit }: { onSubmit: () => void }) {
  const [query, setQuery] = useAtom(mealPlanRecipesQueryAtom)
  return (
    <Input
      placeholder="Search for recipes"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          onSubmit()
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
  const recipes = useAtomValue(mealPlanRecipesAtom)!
  return (
    <RecipeList
      recipes={recipes}
      searchQuery={query}
      onSelect={onSelect}
      rounded={false}
      getScrollElement={getScrollElement}
    />
  )
}
