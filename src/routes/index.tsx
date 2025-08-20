import { createFileRoute, Link } from "@tanstack/react-router"
import { Search, Clock, Users, ChefHat, Star, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { allRecipesAtom, searchStateAtom } from "@/livestore/queries"
import { Result, useAtomValue } from "@effect-atom/atom-react"
import * as Duration from "effect/Duration"
import { events } from "@/livestore/schema"
import { Recipe } from "@/domain/Recipe"
import { useCommit } from "@/livestore/atoms"
import { AddRecipeButton } from "@/Recipes/AddRecipeButton"

export const Route = createFileRoute("/")({
  component: CheffectHome,
})

export default function CheffectHome() {
  const recipes = useAtomValue(allRecipesAtom)

  return (
    <div className="max-w-lg mx-auto p-2 sm:p-4">
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
        {Result.builder(recipes)
          .onInitial(() => (
            <div className="text-gray-500 text-sm">Loading recipes...</div>
          ))
          .onSuccess((recipes) => <RecipeList recipes={recipes} />)
          .render()}
      </div>
    </div>
  )
}

const useSearchQuery = () =>
  Result.getOrElse(
    useAtomValue(
      searchStateAtom,
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

function RecipeList({ recipes }: { recipes: ReadonlyArray<Recipe> }) {
  if (recipes.length === 0) {
    return <NoResults />
  }
  return (
    <div className="bg-white rounded-lg overflow-hidden divide-y divide-gray-200 border border-gray-200">
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
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

function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      to="/recipe/$id"
      params={{ id: recipe.id }}
      className="block active:bg-gray-50 transition-colors"
    >
      <div className="flex items-center">
        {/* Recipe Image - No whitespace */}
        <div className="relative w-16 h-16 flex-shrink-0 overflow-hidden">
          <img
            src={recipe.imageUrl ?? "/placeholder.svg"}
            alt={recipe.title}
            width={96}
            height={96}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Recipe Info - More condensed */}
        <div className="flex-1 flex-col p-2">
          <h3 className="font-medium text-sm mb-1 line-clamp-1 pr-1">
            {recipe.title}
          </h3>

          <div className="flex items-center gap-2 text-xs text-gray-600">
            {recipe.cookingTime && (
              <div className="flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                <span>{Duration.format(recipe.cookingTime)}</span>
              </div>
            )}
            {recipe.servings !== null && (
              <div className="flex items-center gap-0.5">
                <Users className="w-3 h-3" />
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
      </div>
    </Link>
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
