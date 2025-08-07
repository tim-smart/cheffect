import { Skeleton } from "@/components/ui/skeleton"
import { RecipeForm } from "@/Recipes/Form"
import { createRecipeRx } from "@/Recipes/rx"
import { Result, useRxValue } from "@effect-rx/rx-react"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/add")({
  component: AddRecipe,
})

function AddRecipe() {
  const extractedRecipe = useRxValue(createRecipeRx)
  return Result.builder(extractedRecipe)
    .onWaiting(() => (
      <div className="flex flex-col p-4 mb-8 max-w-lg mx-auto gap-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Extracting recipe...
        </h2>
        <Skeleton className="h-72 mb-4 w-full" />
        <Skeleton className="h-48 mb-4 w-full" />
        <Skeleton className="h-48 mb-4 w-full" />
      </div>
    ))
    .onErrorTag("ParseError", (e) => (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red-500">Error: {e.message}</div>
      </div>
    ))
    .onSuccess((recipe) => <RecipeForm initialValues={recipe} />)
    .orElse(() => <RecipeForm />)
}
