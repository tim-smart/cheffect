import { RecipeFormSchema, RecipeInsert } from "@/domain/RecipeForm"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { createRecipeAtom } from "@/Recipes/atoms"
import { RecipeForm, RecipeFormSkeleton } from "@/Recipes/Form"
import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Schema from "effect/Schema"

export const Route = createFileRoute("/add")({
  component: AddRecipe,
})

function AddRecipe() {
  const result = useAtomValue(createRecipeAtom)
  const commit = useCommit()
  function onSubmit(data: typeof RecipeFormSchema.schema.Type) {
    commit(events.recipeCreated(Schema.decodeSync(RecipeInsert)(data)))
  }
  return Result.builder(result)
    .onWaiting(() => <RecipeFormSkeleton />)
    .onSuccess((initialValue) => (
      <RecipeForm initialValue={initialValue} onSubmit={onSubmit} />
    ))
    .onFailure((cause) => (
      <div className="flex flex-col p-4 mb-8 max-w-lg mx-auto gap-4">
        <h2 className="text-2xl font-bold">Error</h2>
        <p>{Cause.pretty(cause)}</p>
      </div>
    ))
    .onInitial(() => <RecipeForm onSubmit={onSubmit} />)
    .render()
}
