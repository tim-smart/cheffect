import { Button } from "@/components/ui/button"
import { Recipe } from "@/domain/Recipe"
import { RecipeInsert } from "@/domain/RecipeForm"
import { useWrite } from "@/EventLog"
import { recipeUpdate } from "@/Recipes/Events"
import { recipeFormByIdAtom } from "@/Recipes/atoms"
import {
  RecipeForm,
  RecipeFormHeader,
  RecipeFormSkeleton,
  recipeFormId,
} from "@/Recipes/Form"
import { NoRecipeFound } from "@/Recipes/NoRecipeFound"
import { router } from "@/Router"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Option from "effect/Option"
import { useAtomValue } from "@effect/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { Save } from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/edit/$id")({
  component: EditRecipeScreen,
})

function EditRecipeScreen() {
  const { id } = Route.useParams()
  const result = useAtomValue(recipeFormByIdAtom(id))
  const write = useWrite()
  const [saving, setSaving] = useState(false)
  return AsyncResult.builder(result)
    .onInitial(() => <RecipeFormSkeleton />)
    .onSuccess((found) => {
      if (Option.isNone(found)) return <NoRecipeFound />
      const [initialValue, recipe] = found.value
      return (
        <div className="pb-content">
          <RecipeFormHeader
            title={recipe.title}
            action={
              <Button
                type="submit"
                form={recipeFormId}
                size="sm"
                variant="outline"
                disabled={saving}
              >
                <Save />
                Save
              </Button>
            }
          />
          <RecipeForm
            initialValue={initialValue}
            variant="edit"
            onSubmit={async (data) => {
              if (saving) return
              setSaving(true)
              const formRecipe = Schema.decodeSync(RecipeInsert)(data)
              // history.back() can leave the document, so wait for the edit to
              // be persisted first
              await write(
                recipeUpdate(
                  Recipe.update.make({
                    ...formRecipe,
                    id: recipe.id,
                    ingredientScale: recipe.ingredientScale,
                    updatedAt: DateTime.nowUnsafe(),
                  }),
                ),
              ).finally(() => setSaving(false))
              if (router.history.length > 1) {
                return router.history.back()
              }
              router.navigate({
                to: "/recipes/$id",
                params: { id: recipe.idString },
              })
            }}
          />
        </div>
      )
    })
    .render()
}
