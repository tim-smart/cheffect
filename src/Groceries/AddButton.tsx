import { Plus, Check, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAtom } from "@effect/atom-react"
import type * as HashSet from "effect/HashSet"
import { Recipe } from "@/domain/Recipe"
import { addToGroceriesAtom } from "./runtime"

export function AddToGroceriesButton({
  recipes,
  excludeIngredients,
}: {
  recipes: Iterable<Recipe>
  excludeIngredients?: HashSet.HashSet<string>
}) {
  const [groceryAddResult, addToGroceries] = useAtom(addToGroceriesAtom)
  return (
    <Button
      variant="outline"
      onClick={() => addToGroceries({ recipes, excludeIngredients })}
      size="sm"
      className="gap-0 px-2!"
      title="Add to grocery list"
    >
      {groceryAddResult.waiting ? (
        <Check className="size-3 mt-px" />
      ) : (
        <Plus className="size-3 mt-px" />
      )}
      <ShoppingCart />
    </Button>
  )
}
