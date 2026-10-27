import { RecipeFormSchema, RecipeInsert } from "@/domain/RecipeForm"
import { useWrite } from "@/EventLog"
import { RecipeEvent } from "@/Recipes/Events"
import { RecipeForm, RecipeFormHeader } from "@/Recipes/Form"
import { router } from "@/Router"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

export const Route = createFileRoute("/add")({
  component: AddRecipe,
})

function AddRecipe() {
  const write = useWrite()
  async function onSubmit(data: typeof RecipeFormSchema.Type) {
    const recipe = Schema.decodeSync(RecipeInsert)(data)
    await write(RecipeEvent.set(recipe))
    router.navigate({ to: "/recipes/$id", params: { id: recipe.idString } })
  }
  return (
    <div className="pb-content">
      <RecipeFormHeader title="New recipe" />
      <RecipeForm onSubmit={onSubmit} />
    </div>
  )
}
