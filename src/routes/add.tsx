import { RecipeFormSchema, RecipeInsert } from "@/domain/RecipeForm"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { RecipeForm } from "@/Recipes/Form"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

export const Route = createFileRoute("/add")({
  component: AddRecipe,
})

function AddRecipe() {
  const commit = useCommit()
  function onSubmit(data: typeof RecipeFormSchema.schema.Type) {
    commit(events.recipeCreated(Schema.decodeSync(RecipeInsert)(data)))
  }
  return (
    <div className="pb-30">
      <RecipeForm onSubmit={onSubmit} />
    </div>
  )
}
