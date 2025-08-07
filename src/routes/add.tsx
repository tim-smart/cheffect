import { RecipeForm } from "@/Recipes/Form"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/add")({
  component: AddRecipe,
})

function AddRecipe() {
  return <RecipeForm />
}
