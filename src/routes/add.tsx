import { createRecipeAtom } from "@/Recipes/atoms"
import { RecipeForm, RecipeFormSkeleton } from "@/Recipes/Form"
import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as Cause from "effect/Cause"

export const Route = createFileRoute("/add")({
  component: AddRecipe,
})

function AddRecipe() {
  const result = useAtomValue(createRecipeAtom)
  return Result.builder(result)
    .onWaiting(() => <RecipeFormSkeleton />)
    .onSuccess((initialValue) => <RecipeForm initialValue={initialValue} />)
    .onFailure((cause) => (
      <div className="flex flex-col p-4 mb-8 max-w-lg mx-auto gap-4">
        <h2 className="text-2xl font-bold">Error</h2>
        <p>{Cause.pretty(cause)}</p>
      </div>
    ))
    .onInitial(() => <RecipeForm />)
    .render()
}
