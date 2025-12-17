import { Link } from "@tanstack/react-router"
import { Clock, Users, ChefHat, Star, ArrowRight } from "lucide-react"
import * as Duration from "effect/Duration"
import { Recipe } from "@/domain/Recipe"
import { AddRecipeButton } from "@/Recipes/AddRecipeButton"
import * as Option from "effect/Option"
import { Button } from "@/components/ui/button"
import clsx from "clsx"
import { Placeholder } from "@/components/placeholder"

export function RecipeList({
  recipes,
  searchQuery,
  onSelect,
  rounded = true,
}: {
  recipes: ReadonlyArray<Recipe>
  searchQuery: string
  onSelect?: ((recipe: Recipe) => void) | undefined
  rounded?: boolean
}) {
  if (recipes.length === 0) {
    return <NoResults searchQuery={searchQuery} />
  }
  return (
    <div
      className={clsx(
        rounded && `rounded-lg border`,
        `bg-white overflow-hidden divide-y divide-gray-200 border-gray-200`,
      )}
    >
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} onSelect={onSelect} />
      ))}
    </div>
  )
}

function NoResults({ searchQuery }: { readonly searchQuery: string }) {
  return (
    <div className="text-center py-16">
      <ChefHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        No recipes found
      </h3>
      <p className="text-gray-500 mb-6 px-4">
        {searchQuery
          ? "Try adjusting your search terms"
          : "Start by adding your first recipe"}
      </p>
      <AddRecipeButton />
    </div>
  )
}

function RecipeCard({
  recipe,
  onSelect,
}: {
  recipe: Recipe
  onSelect?: ((recipe: Recipe) => void) | undefined
}) {
  return (
    <Link
      to="/recipes/$id"
      params={{ id: recipe.id }}
      className="block active:bg-gray-50 transition-colors"
      onClick={
        onSelect
          ? (e) => {
              e.preventDefault()
              onSelect(recipe)
            }
          : undefined
      }
    >
      <div className="flex items-center h-20">
        {/* Recipe Image - No whitespace */}
        <div className="relative h-full aspect-square">
          {recipe.imageUrl ? (
            <img
              src={recipe.imageUrl}
              alt={recipe.title}
              className="object-cover h-full w-full"
            />
          ) : (
            <Placeholder />
          )}
        </div>

        {/* Recipe Info - More condensed */}
        <div className="flex-1 flex-col p-3">
          <h3 className="mb-1 line-clamp-1 pr-1">{recipe.title}</h3>

          <div className="flex items-center gap-2 text-sm text-gray-500">
            {recipe.totalTime.pipe(
              Option.map((d) => (
                <div className="flex items-center gap-0.5">
                  <Clock className="w-4 h-4" />
                  <span>{Duration.format(d)}</span>
                </div>
              )),
              Option.getOrNull,
            )}
            {recipe.servings !== null && (
              <div className="flex items-center gap-0.5">
                <Users className="w-4 h-4" />
                <span>{recipe.servings}</span>
              </div>
            )}
            {recipe.rating !== null && (
              <div className="flex items-center gap-0.5">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                <span>{recipe.rating}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Arrow */}
        {onSelect && (
          <div>
            <Button variant="ghost" size="icon" className="h-8 w-8 mr-2">
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </Link>
  )
}
