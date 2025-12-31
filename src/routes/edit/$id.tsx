import { Button } from "@/components/ui/button"
import { Recipe } from "@/domain/Recipe"
import { RecipeInsert } from "@/domain/RecipeForm"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { recipeFormByIdAtom } from "@/Recipes/atoms"
import { RecipeForm, RecipeFormSkeleton } from "@/Recipes/Form"
import { NoRecipeFound } from "@/Recipes/NoRecipeFound"
import { router } from "@/Router"
import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { ArrowLeft } from "lucide-react"

export const Route = createFileRoute("/edit/$id")({
  component: EditRecipeScreen,
})

function EditRecipeScreen() {
  const { id } = Route.useParams()
  const result = useAtomValue(recipeFormByIdAtom(id))
  const commit = useCommit()
  return Result.builder(result)
    .onWaiting(() => <RecipeFormSkeleton />)
    .onSuccess(([initialValue, recipe]) => (
      <div className="pb-content">
        <Header recipe={recipe} />
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
                  ingredientScale: recipe.ingredientScale,
                  updatedAt: DateTime.unsafeNow(),
                }),
              ),
            )
            if (router.history.length > 1) {
              return router.history.back()
            }
            router.navigate({
              to: "/recipes/$id",
              params: { id: recipe.id },
            })
          }}
        />
      </div>
    ))
    .onErrorTag("NoSuchElementException", () => <NoRecipeFound />)
    .render()
}

function Header({
  recipe,
}: {
  recipe: {
    readonly id: string
    readonly title: string
  }
}) {
  return (
    <header className="bg-background border-b border-border sticky top-0 z-10">
      <div className="px-2 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="p-2"
            onClick={() => router.history.back()}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold  line-clamp-1 flex-1">
            {recipe.title}
          </h1>
        </div>
      </div>
    </header>
  )
}
