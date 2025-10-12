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
import { createFileRoute, Link } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { ArrowLeft } from "lucide-react"

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
      <>
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
                  updatedAt: undefined,
                }),
              ),
            )
          }}
        />
      </>
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
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
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
          <h1 className="text-lg font-semibold text-gray-900 line-clamp-1 flex-1">
            {recipe.title}
          </h1>
        </div>
      </div>
    </header>
  )
}
