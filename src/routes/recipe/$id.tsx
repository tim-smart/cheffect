import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Recipe } from "@/domain/Recipe"
import { AddToGroceriesButton } from "@/Groceries/AddButton"
import { useCommit } from "@/livestore/atoms"
import { recipeByIdAtom } from "@/livestore/queries"
import { events } from "@/livestore/schema"
import {
  MealPlanDatePicker,
  MealPlanDatePickerTarget,
} from "@/MealPlan/DatePicker"
import { NoRecipeFound } from "@/Recipes/NoRecipeFound"
import { router } from "@/Router"
import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import {
  ArrowLeft,
  Calendar,
  Clock,
  Edit,
  MoreVertical,
  Star,
  Trash,
  Users,
} from "lucide-react"
import { useEffect, useState } from "react"

export const Route = createFileRoute("/recipe/$id")({
  component: RouteComponent,
})

function RouteComponent() {
  const { id } = Route.useParams()
  const result = useAtomValue(recipeByIdAtom(id))
  return Result.builder(result)
    .onSuccess((recipe) => <RecipeDetails recipe={recipe} />)
    .onErrorTag("NoSuchElementException", () => <NoRecipeFound />)
    .render()
}

export function RecipeDetails({ recipe }: { recipe: Recipe }) {
  const commit = useCommit()

  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(
    new Set(),
  )
  const stepElements: Array<HTMLDivElement> = []
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " ")) {
        return
      }
      e.preventDefault()
      const nextIndex =
        e.key === "ArrowUp"
          ? Math.max(currentStep - 1, 0)
          : Math.min(currentStep + 1, recipe.steps.length - 1)
      setCurrentStep(nextIndex)
      stepElements[nextIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [currentStep, recipe.steps.length, stepElements])

  const toggleIngredient = (ingredientId: string) => {
    const newChecked = new Set(checkedIngredients)
    if (newChecked.has(ingredientId)) {
      newChecked.delete(ingredientId)
    } else {
      newChecked.add(ingredientId)
    }
    setCheckedIngredients(newChecked)
  }

  return (
    <div className="pb-30">
      {/* Header */}
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
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="p-2">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to="/edit/$id" params={{ id: recipe.id }}>
                      <Edit />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <MealPlanDatePicker
                    target={MealPlanDatePickerTarget.New({
                      recipeId: recipe.id,
                    })}
                  >
                    <DropdownMenuItem>
                      <Calendar />
                      Add to meal plan
                    </DropdownMenuItem>
                  </MealPlanDatePicker>
                  <DropdownMenuItem
                    onClick={() => {
                      if (
                        !confirm("Are you sure you want to delete this recipe?")
                      ) {
                        return
                      }
                      commit(
                        events.recipeDeleted({
                          id: recipe.id,
                          deletedAt: DateTime.unsafeNow(),
                        }),
                      )
                      return router.history.back()
                    }}
                  >
                    <Trash />
                    Remove recipe
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-white p-4">
        {/* Recipe Image & Basic Info */}
        <div className="grid grid-cols-2 sm:flex sm:gap-10 items-center gap-2 text-sm text-gray-600">
          {recipe.prepTime && (
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>Prep: {Duration.format(recipe.prepTime)}</span>
            </div>
          )}
          {recipe.cookingTime && (
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>Cook: {Duration.format(recipe.cookingTime)}</span>
            </div>
          )}
          {recipe.servings && (
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>{recipe.servings} servings</span>
            </div>
          )}
          {recipe.rating && (
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span>{recipe.rating}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col md:items-start gap-4 mt-4 md:flex-row max-w-7xl md:px-4 mx-auto">
        {/* Ingredients */}
        <div className="bg-white flex-1 md:rounded-lg">
          <div className="p-4">
            <div className="flex">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Ingredients
              </h2>
              <div className="flex-1" />
              <AddToGroceriesButton recipes={[recipe]} />
            </div>

            <div className="space-y-6">
              {recipe.ingredients.map((group, groupIndex) => (
                <div key={groupIndex}>
                  {group.name && (
                    <h3 className="font-medium text-gray-900 mb-3 text-base">
                      {group.name}
                    </h3>
                  )}

                  <div className="bg-white rounded-lg overflow-hidden divide-y divide-gray-200 border border-gray-200">
                    {group.ingredients.map((ingredient, ingredientIndex) => {
                      const ingredientId = `${groupIndex}-${ingredientIndex}`
                      const isChecked = checkedIngredients.has(ingredientId)

                      return (
                        <div
                          key={ingredientIndex}
                          className="flex items-start gap-3 p-3 active:bg-gray-50 transition-colors"
                          onClick={() => toggleIngredient(ingredientId)}
                        >
                          <Checkbox
                            checked={isChecked}
                            onChange={() => toggleIngredient(ingredientId)}
                            className="mt-0.5"
                          />
                          <div
                            className={`flex-1 ${isChecked ? "line-through text-gray-500" : "text-gray-900"}`}
                          >
                            <span>
                              {ingredient.quantity && (
                                <>
                                  {ingredient.quantity}
                                  {ingredient.unit &&
                                    ` ${ingredient.unit}`}{" "}
                                </>
                              )}
                              {ingredient.name}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-white flex-2 lg:rounded-lg">
          <div className="p-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Instructions
            </h2>

            <div className="space-y-4">
              {recipe.steps.map((step, stepIndex) => (
                <div
                  key={stepIndex}
                  ref={(el) => {
                    stepElements[stepIndex] = el!
                  }}
                  className={`border rounded-lg p-4 transition-all ${
                    currentStep === stepIndex
                      ? "border-orange-500 bg-orange-50"
                      : "border-gray-200 bg-white"
                  }`}
                  onClick={() => setCurrentStep(stepIndex)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                        currentStep === stepIndex
                          ? "bg-orange-600 text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {stepIndex + 1}
                    </div>

                    <div className="flex-1">
                      <p className="text-gray-900 leading-relaxed mb-3">
                        {step.text}
                      </p>

                      {step.tips.length > 0 && (
                        <div className="space-y-2">
                          {step.tips.map((tip, tipIndex) => (
                            <div
                              key={tipIndex}
                              className="flex items-start gap-2"
                            >
                              <span className="text-orange-600 text-sm mt-0.5">
                                💡
                              </span>
                              <p className="text-sm text-gray-600 italic">
                                {tip}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
