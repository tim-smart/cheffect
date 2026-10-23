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
import { useEffect, useState, type CSSProperties, type MouseEvent } from "react"
import { FadeImage } from "@/components/FadeImage"

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
  // The recipes page shows photo tiles two to a row; the pickers keep rows
  const tiles = onSelect === undefined && getScrollElement === undefined
  const columns = tiles ? 2 : 1
  const rowCount = Math.ceil(recipes.length / columns)
  const virtualizer = getScrollElement
    ? useVirtualizer({
        count: recipes.length,
        getScrollElement,
        estimateSize: () => 81,
        overscan: 5,
      })
    : useWindowVirtualizer({
        initialOffset: useElementScrollRestoration({
          getElement: () => window,
        })?.scrollY,
        count: rowCount,
        estimateSize: () => (tiles ? 216 : 81),
        overscan: 10,
      })

  // Rows that mount in the first moments rise in, staggered by their place
  // on screen; rows scrolled into view later simply appear
  const entering = useEntering()

  if (recipes.length === 0) {
    return <NoResults searchQuery={searchQuery} />
  }
  if (tiles) {
    return (
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow, position) => (
          <div
            key={virtualRow.key}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {/* The entrance animates an inner element: the row's own
                transform is the virtualizer's */}
            <div
              className={clsx(
                "grid grid-cols-2 gap-x-3 pb-4",
                entering && "motion-safe:animate-rise-in stagger",
              )}
              style={{ "--i": position } as CSSProperties}
            >
              {recipes
                .slice(
                  virtualRow.index * columns,
                  (virtualRow.index + 1) * columns,
                )
                .map((recipe) => (
                  <RecipeTile key={recipe.idString} recipe={recipe} />
                ))}
            </div>
          </div>
        ))}
      </div>
    )
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

// True for the first moments after mount, long enough for a staggered
// entrance to finish before the class is dropped
function useEntering() {
  const [entering, setEntering] = useState(true)
  useEffect(() => {
    const timeout = setTimeout(() => setEntering(false), 900)
    return () => clearTimeout(timeout)
  }, [])
  return entering
}

function NoResults({ searchQuery }: { readonly searchQuery: string }) {
  return (
    <div className="text-center py-16 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-500">
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

function RecipeTile({ recipe }: { recipe: Recipe }) {
  const meta = [
    ...Option.match(recipe.totalTime, {
      onNone: () => [],
      onSome: (d) => [Duration.format(d)],
    }),
    ...(recipe.servings !== null ? [`Serves ${recipe.servingsDisplay}`] : []),
  ]
  return (
    <Link
      to="/recipes/$id"
      params={{ id: recipe.idString }}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <div className="relative h-32 overflow-hidden rounded-xl bg-muted">
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <ChefHat className="size-10 opacity-30" />
        </div>
        {recipe.imageUrl && (
          <FadeImage
            src={recipe.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-[opacity,scale] duration-300 motion-safe:group-hover:scale-[1.03] motion-safe:group-active:scale-[0.97]"
            onError={(event) => {
              event.currentTarget.hidden = true
            }}
          />
        )}
      </div>
      {/* A fixed text block keeps every row 216px, which the virtualizer
          relies on to restore the scroll position exactly */}
      <div className="mt-2 h-16">
        <h3 className="font-display text-[16px] font-medium leading-[22px] line-clamp-2">
          {recipe.title}
        </h3>
        <p className="mt-0.5 flex h-[18px] items-center gap-1 text-[12.5px] leading-[18px] text-muted-foreground tabular-nums">
          {meta.join(" · ")}
          {recipe.rating !== null && (
            <>
              {meta.length > 0 && " · "}
              <Star className="size-3 fill-current" />
              {recipe.rating}
            </>
          )}
        </p>
      </div>
    </Link>
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
      params={{ id: recipe.idString }}
      className="block bg-card active:bg-card/50 transition-colors"
      onClick={
        onSelect
          ? (e: MouseEvent<HTMLAnchorElement>) => {
              e.preventDefault()
              onSelect(recipe)
            }
          : undefined
      }
    >
      <div className="flex items-center h-20">
        {/* Recipe Image - No whitespace */}
        <div className="relative h-full aspect-square">
          <Placeholder />
          {recipe.imageUrl && (
            <img
              src={recipe.imageUrl}
              alt=""
              className="absolute inset-0 object-cover h-full w-full"
              onError={(event) => {
                event.currentTarget.hidden = true
              }}
            />
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
