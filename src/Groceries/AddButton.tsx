import { Plus, Check, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAtom } from "@effect/atom-react"
import * as Effect from "effect/Effect"
import * as HashSet from "effect/HashSet"
import * as Option from "effect/Option"
import { Recipe } from "@/domain/Recipe"
import { GroceryItem } from "@/domain/GroceryItem"
import { GroceryRepo, learnedAisle } from "./Repo"
import { addGroceryItem, groceriesRuntime } from "./runtime"

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

// Adds the recipes' ingredients to the default list, skipping excluded ones
// and anything in the pantry, with the aisle learned for each name. The pantry
// and aisles are read once up front. Stays waiting for a few seconds after, so
// the button shows a check.
const addToGroceriesAtom = groceriesRuntime.fn<{
  readonly recipes: Iterable<Recipe>
  readonly excludeIngredients?: HashSet.HashSet<string> | undefined
}>()(
  Effect.fnUntraced(function* ({ recipes, excludeIngredients }) {
    const repo = yield* GroceryRepo
    const pantryItemNames = yield* repo.pantryNames
    const aisles = yield* repo.aisles
    for (const recipe of recipes) {
      for (const [gi, group] of recipe.ingredientsDisplay.entries()) {
        for (const [ii, ingredient] of group.ingredients.entries()) {
          if (
            excludeIngredients &&
            HashSet.has(excludeIngredients, ingredient.id(gi, ii))
          ) {
            continue
          }
          const item = GroceryItem.fromIngredient(null, ingredient, recipe)
          if (pantryItemNames.has(item.nameNormalized)) continue
          yield* addGroceryItem(
            new GroceryItem({
              ...item,
              aisle: Option.getOrNull(learnedAisle(aisles, item.name)),
            }),
          )
        }
      }
    }
    yield* Effect.sleep("3 seconds")
  }),
)
