import { Button } from "@/components/ui/button"
import { Recipe } from "@/domain/Recipe"
import { RecipeInsert } from "@/domain/RecipeForm"
import { useWrite } from "@/EventLog"
import { recipeFormByIdAtom } from "@/Recipes/atoms"
import { Display, RecipeForm, RecipeFormSkeleton } from "@/Recipes/Form"
import { NoRecipeFound } from "@/Recipes/NoRecipeFound"
import { router } from "@/Router"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Option from "effect/Option"
import { useAtomValue } from "@effect/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { ArrowLeft, Save } from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/edit/$id")({
  component: EditRecipeScreen,
})

function EditRecipeScreen() {
  const { id } = Route.useParams()
  const result = useAtomValue(recipeFormByIdAtom(id))
  const write = useWrite()
  const [saving, setSaving] = useState(false)
  const formId = Display.Form.id
  return AsyncResult.builder(result)
    .onInitial(() => <RecipeFormSkeleton />)
    .onSuccess((found) => {
      if (Option.isNone(found)) return <NoRecipeFound />
      const [initialValue, recipe] = found.value
      return (
        <div className="pb-content">
          <Header recipe={recipe} formId={formId} saving={saving} />
          <RecipeForm
            initialValue={initialValue}
            variant="edit"
            onSubmit={async (data) => {
              if (saving) return
              setSaving(true)
              const formRecipe = Schema.decodeSync(RecipeInsert)(data)
              // history.back() can leave the document, so wait for the edit to
              // be persisted first
              await write({
                event: "RecipeUpdated",
                payload: Recipe.update.make({
                  ...formRecipe,
                  id: recipe.id,
                  ingredientScale: recipe.ingredientScale,
                  updatedAt: DateTime.nowUnsafe(),
                }),
              }).finally(() => setSaving(false))
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

function Header({
  recipe,
  formId,
  saving,
}: {
  recipe: {
    readonly title: string
  }
  formId: string
  saving: boolean
}) {
  return (
    <header className="bg-background border-b border-border sticky top-0 z-10">
      <div className="px-2 pr-4 py-4">
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
          <Button
            type="submit"
            form={formId}
            size="sm"
            variant="outline"
            disabled={saving}
          >
            <Save />
            Save
          </Button>
        </div>
      </div>
    </header>
  )
}
