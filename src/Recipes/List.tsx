import { Link, useElementScrollRestoration } from "@tanstack/react-router"
import { Clock, Users, ChefHat, Star, ArrowRight } from "lucide-react"
import * as Duration from "effect/Duration"
import { Recipe } from "@/domain/Recipe"
import { AddRecipeButton } from "@/Recipes/AddRecipeButton"
import * as Option from "effect/Option"
import { Button } from "@/components/ui/button"
import clsx from "clsx"
import { Placeholder } from "@/components/placeholder"
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual"

export function RecipeList({
  recipes,
  searchQuery,
  onSelect,
  rounded = true,
  getScrollElement,
}: {
  recipes: ReadonlyArray<Recipe>
  searchQuery: string
  onSelect?: ((recipe: Recipe) => void) | undefined
  rounded?: boolean
  getScrollElement?: () => HTMLElement | null
}) {
  const virtualizer = getScrollElement
    ? useVirtualizer({
        count: recipes.length,
        getScrollElement,
        estimateSize: () => 81,
        overscan: 10,
      })
    : useWindowVirtualizer({
        initialOffset: useElementScrollRestoration({
          getElement: () => window,
        })?.scrollY,
        count: recipes.length,
        estimateSize: () => 81,
        overscan: 10,
      })

  if (recipes.length === 0) {
    return <NoResults searchQuery={searchQuery} />
  }
  return (
    <div
      className={clsx(
        rounded && `rounded-lg border`,
        `overflow-hidden divide-y divide-border border-border relative last:border-b`,
      )}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const recipe = recipes[virtualRow.index]
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <RecipeCard recipe={recipe} onSelect={onSelect} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NoResults({ searchQuery }: { readonly searchQuery: string }) {
  return (
    <div className="text-center py-16">
      <ChefHat className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
      <h3 className="text-lg font-medium mb-2">No recipes found</h3>
      <p className="text-muted-foreground mb-6 px-4">
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
      className="block bg-card active:bg-card/50 transition-colors"
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

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                <span>{recipe.servingsDisplay}</span>
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
