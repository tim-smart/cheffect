import { createFileRoute } from "@tanstack/react-router"
import { Search, Clock, Users, ChefHat, Plus, Star, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { allRecipesRx, searchStateRx } from "@/livestore/queries"
import { Result, useRx, useRxValue } from "@effect-rx/rx-react"
import * as Duration from "effect/Duration"
import { createRecipeRx } from "@/Recipes/rx"
import { events } from "@/livestore/schema"
import { Recipe } from "@/domain/Recipe"
import * as Cause from "effect/Cause"
import { useCommit } from "@/livestore/rx"

export const Route = createFileRoute("/")({
  component: CheffectHome,
})

export default function CheffectHome() {
  const recipes = useRxValue(allRecipesRx)

  return (
    <>
      {/* Search Bar */}
      <div className="mb-4">
        <SearchInput />
      </div>

      {/* Recipe Count */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          My Recipes (
          {recipes.pipe(
            Result.map((recipes) => recipes.length),
            Result.getOrElse(() => 0),
          )}
          )
        </h2>
      </div>

      {/* Recipe List - Mobile Optimized */}
      <div className="space-y-4">
        {Result.match(recipes, {
          onInitial: () => (
            <div className="text-gray-500 text-sm">Loading recipes...</div>
          ),
          onFailure: ({ cause }) => (
            <div className="text-red-500 text-sm">
              Error loading recipes: {Cause.pretty(cause)}
            </div>
          ),
          onSuccess: ({ value }) =>
            value.length === 0 ? (
              <NoResults />
            ) : (
              value.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))
            ),
        })}
      </div>
    </>
  )
}

const useSearchQuery = () =>
  Result.getOrElse(
    useRxValue(
      searchStateRx,
      Result.map((state) => state.query),
    ),
    () => "",
  )

function SearchInput() {
  const searchQuery = useSearchQuery()
  const commit = useCommit()

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder="Search recipes..."
          value={searchQuery}
          onChange={(e) => {
            commit(events.searchStateSet({ query: e.target.value }))
          }}
          className="pl-10 h-11"
        />
      </div>
      <Button variant="outline" size="sm" className="h-11 px-3 bg-transparent">
        <Filter className="w-4 h-4" />
      </Button>
    </div>
  )
}

function NoResults() {
  const searchQuery = useSearchQuery()
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

function AddRecipeButton({ small = false }: { small?: boolean }) {
  const [result, create] = useRx(createRecipeRx)
  const onClick = () => {
    const url = prompt("Enter recipe URL:")
    if (!url) return
    create(url)
  }
  if (small) {
    return (
      <Button
        size="sm"
        className="bg-orange-600 hover:bg-orange-700 h-9 px-3"
        onClick={onClick}
        disabled={result.waiting}
      >
        <Plus className="w-4 h-4" />
      </Button>
    )
  }
  return (
    <Button
      className="bg-orange-600 hover:bg-orange-700 h-12 px-6"
      onClick={onClick}
      disabled={result.waiting}
    >
      <Plus className="w-5 h-5 mr-2" />
      {result.waiting ? "Adding..." : "Add Recipe"}
    </Button>
  )
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Card className="overflow-hidden active:scale-[0.98] transition-transform">
      <div className="flex">
        {/* Recipe Image */}
        <div className="relative w-24 h-24 flex-shrink-0">
          <img
            src={recipe.imageUrl ?? "/placeholder.svg"}
            alt={recipe.title}
            width={96}
            height={96}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Recipe Info */}
        <CardContent className="flex-1 p-3">
          <h3 className="font-semibold text-base mb-2 line-clamp-1 pr-2">
            {recipe.title}
          </h3>

          <div className="flex items-center gap-3 text-sm text-gray-600 mb-2">
            {recipe.cookingTime && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span className="text-xs">
                  {Duration.format(recipe.cookingTime)}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              <span className="text-xs">{recipe.servings}</span>
            </div>
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              <span className="text-xs">{recipe.rating}</span>
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  )
}

// function RecipeTags({ tags }: { tags: string[] }) {
//   return (
//     <div className="flex flex-wrap gap-1">
//       {tags.slice(0, 2).map((tag) => (
//         <Badge key={tag} variant="secondary" className="text-xs px-2 py-0">
//           {tag}
//         </Badge>
//       ))}
//       {tags.length > 2 && (
//         <Badge variant="secondary" className="text-xs px-2 py-0">
//           +{tags.length - 2}
//         </Badge>
//       )}
//     </div>
//   )
// }
