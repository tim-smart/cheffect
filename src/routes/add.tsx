import { RecipeFormSchema, RecipeInsert } from "@/domain/RecipeForm"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { RecipeForm } from "@/Recipes/Form"
import { router } from "@/Router"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

export const Route = createFileRoute("/add")({
  component: AddRecipe,
})

function AddRecipe() {
  const commit = useCommit()
  function onSubmit(data: typeof RecipeFormSchema.schema.Type) {
    const dataDecoded = Schema.decodeSync(RecipeInsert)(data)
    commit(events.recipeCreated(dataDecoded))
    router.navigate({ to: "/recipes/$id", params: { id: dataDecoded.id } })
  }
  return (
    <div className="pb-content">
      <RecipeForm onSubmit={onSubmit} />
    </div>
  )
}
