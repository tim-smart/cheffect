import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Plus, X, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import * as DateTime from "effect/DateTime"
import { useAtom, useAtomSet, useAtomSuspense } from "@effect-atom/atom-react"
import { mealPlanEntriesAtom, mealPlanWeekAtom } from "@/livestore/queries"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"

export const Route = createFileRoute("/plan")({
  component: MealPlanPage,
})

const recipes = [
  {
    id: 1,
    title: "Creamy Garlic Pasta",
    image: "/placeholder.svg?height=200&width=300",
    cookTime: "25 min",
    servings: 4,
  },
  {
    id: 2,
    title: "Honey Glazed Salmon",
    image: "/placeholder.svg?height=200&width=300",
    cookTime: "20 min",
    servings: 2,
  },
  {
    id: 3,
    title: "Chicken Tikka Masala",
    image: "/placeholder.svg?height=200&width=300",
    cookTime: "45 min",
    servings: 6,
  },
  {
    id: 4,
    title: "Avocado Toast Supreme",
    image: "/placeholder.svg?height=200&width=300",
    cookTime: "10 min",
    servings: 1,
  },
  {
    id: 5,
    title: "Beef Stir Fry",
    image: "/placeholder.svg?height=200&width=300",
    cookTime: "15 min",
    servings: 3,
  },
  {
    id: 6,
    title: "Chocolate Chip Cookies",
    image: "/placeholder.svg?height=200&width=300",
    cookTime: "30 min",
    servings: 24,
  },
]

interface MealPlan {
  [key: string]: number[]
}

const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

const formatDate = (date: Date) => {
  return date.toISOString().split("T")[0]
}

export function MealPlanPage() {
  const today = DateTime.unsafeMakeZoned(new Date()).pipe(DateTime.removeTime)
  const [weekStart, setWeekStart] = useAtom(mealPlanWeekAtom)
  const recipesNew = useAtomSuspense(mealPlanEntriesAtom).value
  console.log(recipesNew)
  const [mealPlan, setMealPlan] = useState<MealPlan>({
    [formatDate(new Date(weekStart.epochMillis + 0 * 24 * 60 * 60 * 1000))]: [
      1, 4,
    ],
    [formatDate(new Date(weekStart.epochMillis + 1 * 24 * 60 * 60 * 1000))]: [
      2, 5,
    ],
    [formatDate(new Date(weekStart.epochMillis + 2 * 24 * 60 * 60 * 1000))]: [
      3,
    ],
    [formatDate(new Date(weekStart.epochMillis + 3 * 24 * 60 * 60 * 1000))]: [
      1, 2, 6,
    ],
    [formatDate(new Date(weekStart.epochMillis + 4 * 24 * 60 * 60 * 1000))]: [
      4, 5,
    ],
  })
  const [showRecipeSelector, setShowRecipeSelector] = useState<string | null>(
    null,
  )

  const getWeekDays = () => {
    const days = []
    for (let i = 0; i < 7; i++) {
      days.push(DateTime.add(weekStart, { days: i }))
    }
    return days
  }

  const isToday = (date: DateTime.Utc) => DateTime.Equivalence(date, today)

  const weekDays = getWeekDays()

  const handleAddRecipe = (dateStr: string, recipeId: number) => {
    setMealPlan((prev) => ({
      ...prev,
      [dateStr]: [...(prev[dateStr] || []), recipeId],
    }))
    setShowRecipeSelector(null)
  }

  const handleRemoveRecipe = (dateStr: string, index: number) => {
    setMealPlan((prev) => ({
      ...prev,
      [dateStr]: prev[dateStr].filter((_, i) => i !== index),
    }))
  }

  const handlePreviousWeek = () => {
    setWeekStart(DateTime.subtract(weekStart, { weeks: 1 }))
  }

  const handleNextWeek = () => {
    setWeekStart(DateTime.add(weekStart, { weeks: 1 }))
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-orange-600" />
              <h1 className="text-lg font-bold text-gray-900">Meal Plan</h1>
            </div>
          </div>

          {/* Week Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreviousWeek}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <div className="text-center flex-1">
              <p className="text-xs font-medium text-gray-900">
                {DateTime.formatUtc(weekStart, {
                  month: "short",
                  day: "numeric",
                })}{" "}
                -{" "}
                {weekStart.pipe(
                  DateTime.add({ days: 6 }),
                  DateTime.formatUtc({
                    month: "short",
                    day: "numeric",
                  }),
                )}
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleNextWeek}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 py-3">
        {/* Week List */}
        <div className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-200">
          {weekDays.map((date) => {
            const dateStr = DateTime.formatIsoDate(date)
            const dateParts = DateTime.toPartsUtc(date)
            const isTodayDate = isToday(date)
            const dayRecipes = mealPlan[dateStr] || []

            return (
              <div key={date.epochMillis} className="bg-white">
                {/* Day Header with Add Button */}
                <div
                  className={`w-full px-3 py-3 flex items-center justify-between border-b ${
                    isTodayDate ? "bg-orange-50" : "bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div>
                      <p
                        className={`font-semibold text-sm ${isTodayDate ? "text-orange-600" : "text-gray-900"}`}
                      >
                        {dayNames[dateParts.weekDay]}
                      </p>
                      <p
                        className={`text-xs ${isTodayDate ? "text-orange-500" : "text-gray-500"}`}
                      >
                        {DateTime.formatUtc(date, {
                          month: "short",
                          day: "numeric",
                        })}
                        {isTodayDate && " • Today"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setShowRecipeSelector(
                          showRecipeSelector === dateStr ? null : dateStr,
                        )
                      }
                      className="h-8 w-8 p-0 text-orange-600 hover:bg-orange-100"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Day Content - Always Visible */}
                <div>
                  {dayRecipes.length > 0 && (
                    <div className="divide-y divide-gray-200">
                      {dayRecipes.map((recipeId, index) => {
                        const recipe = recipes.find((r) => r.id === recipeId)
                        if (!recipe) return null

                        return (
                          <div
                            key={index}
                            className="flex items-center p-3 gap-3"
                          >
                            <div className="relative w-12 h-12 shrink-0 rounded overflow-hidden">
                              <img
                                src={recipe.image || "/placeholder.svg"}
                                alt={recipe.title}
                                width={48}
                                height={48}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm text-gray-900 line-clamp-1">
                                {recipe.title}
                              </h4>
                              <p className="text-xs text-gray-500">
                                {recipe.cookTime} • {recipe.servings} servings
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveRecipe(dateStr, index)}
                              className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {dayRecipes.length === 0 && !showRecipeSelector && (
                    <div className="p-3 text-center">
                      <p className="text-sm text-gray-500">No meals planned</p>
                    </div>
                  )}

                  {/* Recipe Selector */}
                  {showRecipeSelector === dateStr && (
                    <div className="bg-gray-50 divide-y divide-gray-200">
                      {recipes.map((recipe) => (
                        <button
                          key={recipe.id}
                          onClick={() => handleAddRecipe(dateStr, recipe.id)}
                          className="w-full flex items-center gap-3 px-3 py-3 active:bg-gray-200 transition-colors text-left"
                        >
                          <div className="relative w-10 h-10 shrink-0 rounded overflow-hidden">
                            <img
                              src={recipe.image || "/placeholder.svg"}
                              alt={recipe.title}
                              width={40}
                              height={40}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="font-medium text-xs text-gray-900 line-clamp-1">
                              {recipe.title}
                            </h5>
                            <p className="text-xs text-gray-500">
                              {recipe.cookTime}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
