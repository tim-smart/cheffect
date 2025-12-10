import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
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
import {
  AtomRef,
  useAtom,
  useAtomRef,
  useAtomValue,
} from "@effect-atom/atom-react"
import React, { useMemo, useState } from "react"
import { RecipeList } from "./List"

export function SelectRecipeDrawer({
  children,
  onSelect,
}: {
  children: React.ReactNode
  onSelect: (recipe: Recipe) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild children={children} />
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>Select a recipe</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 flex flex-col gap-4">
            <SearchInput />
            <div className="h-80 overflow-y-auto">
              <SearchResults
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

function SearchInput() {
  const [query, setQuery] = useAtom(mealPlanRecipesQueryAtom)
  return (
    <Input
      placeholder="Search for recipes"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  )
}

function SearchResults({ onSelect }: { onSelect: (recipe: Recipe) => void }) {
  const query = useAtomValue(mealPlanRecipesQueryAtom)
  const recipes = useAtomValue(mealPlanRecipesAtom)
  return (
    <RecipeList recipes={recipes} searchQuery={query} onSelect={onSelect} />
  )
}
