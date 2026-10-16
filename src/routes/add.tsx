import { RecipeFormSchema, RecipeInsert } from "@/domain/RecipeForm"
import { useWrite } from "@/EventLog"
import { RecipeForm } from "@/Recipes/Form"
import { router } from "@/Router"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

export const Route = createFileRoute("/add")({
  component: AddRecipe,
})

function AddRecipe() {
  const write = useWrite()
  async function onSubmit(data: typeof RecipeFormSchema.schema.Type) {
    const recipe = Schema.decodeSync(RecipeInsert)(data)
    await write({ event: "RecipeCreated", payload: recipe })
    router.navigate({ to: "/recipes/$id", params: { id: recipe.idString } })
  }
  return (
    <div className="pb-content">
      <RecipeForm onSubmit={onSubmit} />
    </div>
  )
}
