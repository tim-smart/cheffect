import { Plus, Check, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Atom, useAtom } from "@effect-atom/atom-react"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import * as Effect from "effect/Effect"
import { Recipe } from "@/domain/Recipe"
import { GroceryItem } from "@/domain/GroceryItem"
import * as HashSet from "effect/HashSet"

export function AddToGroceriesButton({
  recipes,
  excludeIngredients,
}: {
  recipes: Iterable<Recipe>
  excludeIngredients?: HashSet.HashSet<string>
}) {
  const commit = useCommit()
  const [groceryAddResult, setGroceryAddCompleted] =
    useAtom(groceryAddCompleted)
  const addWeekToGrocery = () => {
    for (const recipe of recipes) {
      recipe.ingredients.forEach((group, gi) => {
        group.ingredients.forEach((ingredient, ii) => {
          if (
            excludeIngredients &&
            HashSet.has(excludeIngredients, ingredient.id(gi, ii))
          ) {
            return
          }
          commit(
            events.groceryItemAdded(
              GroceryItem.fromIngredient(ingredient, recipe),
            ),
          )
        })
      })
    }
    setGroceryAddCompleted()
  }
  return (
    <Button
      variant="outline"
      onClick={addWeekToGrocery}
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

const groceryAddCompleted = Atom.fn<void>()(
  Effect.fnUntraced(function* () {
    yield* Effect.sleep("3 seconds")
  }),
)
