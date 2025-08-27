import { Recipe } from "@/domain/Recipe"
import { RecipeInsert } from "@/domain/RecipeForm"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { recipeFormByIdAtom } from "@/Recipes/atoms"
import { RecipeForm, RecipeFormSkeleton } from "@/Recipes/Form"
import { NoRecipeFound } from "@/Recipes/NoRecipeFound"
import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

export const Route = createFileRoute("/edit/$id")({
  component: ProductScreen,
})

function ProductScreen() {
  const { id } = Route.useParams()
  const result = useAtomValue(recipeFormByIdAtom(id))
  const commit = useCommit()
  return Result.builder(result)
    .onWaiting(() => <RecipeFormSkeleton />)
    .onSuccess(([initialValue, recipe]) => (
      <RecipeForm
        initialValue={initialValue}
        variant="edit"
        onSubmit={(data) => {
          const formRecipe = Schema.decodeSync(RecipeInsert)(data)
          commit(
            events.recipeUpdated(
              Recipe.update.make({
                ...formRecipe,
                id: recipe.id,
                updatedAt: undefined,
              }),
            ),
          )
        }}
      />
    ))
    .onErrorTag("NoSuchElementException", () => <NoRecipeFound />)
    .render()
}
