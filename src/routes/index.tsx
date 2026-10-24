import { createFileRoute } from "@tanstack/react-router"
import { Search, ArrowDownWideNarrow, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useAtom, useAtomValue } from "@effect/atom-react"
import { type Recipe, SortBy } from "@/domain/Recipe"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  allRecipesAtom,
  recipeSearchQueryAtom,
  recipeSortByAtom,
} from "@/Recipes/atoms"
import { RecipeList } from "@/Recipes/List"

export const Route = createFileRoute("/")({
  component: CheffectHome,
})

export default function CheffectHome() {
  const recipes = useAtomValue(allRecipesAtom)
  const searching = useAtomValue(recipeSearchQueryAtom) !== ""

  return (
    <div className="page-wide pt-3 md:pt-6 pb-content!">
      {/* The title and count share a row with the search on desktops; on
          phones the search drops to its own row */}
      <div className="mb-5 md:mb-8 flex flex-wrap items-center gap-y-4">
        <h2 className="font-display text-[32px] md:text-[36px] font-medium leading-none tracking-tight">
          Recipes
        </h2>
        {AsyncResult.isSuccess(recipes) && (
          <span className="ml-auto md:ml-4 text-sm text-muted-foreground tabular-nums">
            {recipes.value.length} {searching ? "matching" : "saved"}
          </span>
        )}
        <div className="basis-full md:basis-auto md:ml-auto md:w-full md:max-w-md">
          <SearchInput />
        </div>
      </div>

      <div className="space-y-4">
        {AsyncResult.builder(recipes)
          .onInitial(() => <RecipeListSkeleton />)
          .onSuccess((recipes) => <WrappedList recipes={recipes} />)
          .render()}
      </div>
    </div>
  )
}

function WrappedList({ recipes }: { recipes: ReadonlyArray<Recipe> }) {
  const searchQuery = useAtomValue(recipeSearchQueryAtom)
  return <RecipeList recipes={recipes} searchQuery={searchQuery} />
}

function SearchInput() {
  const [searchQuery, setSearchQuery] = useAtom(recipeSearchQueryAtom)

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          type="text"
          placeholder="Search recipes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            const target = e.target as HTMLInputElement
            target.blur()
          }}
          className={`pl-10 h-11 bg-card! rounded-full shadow-none ${searchQuery ? "pr-9" : ""}`}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50 motion-safe:duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <SortButton />
    </div>
  )
}

function SortButton() {
  const [sortBy, set] = useAtom(recipeSortByAtom)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Sort recipes"
          className="size-11 rounded-full bg-card shadow-none"
        >
          <ArrowDownWideNarrow className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {SortBy.map(({ label, value }) => (
          <DropdownMenuCheckboxItem
            key={value}
            checked={sortBy === value}
            onClick={() => set(value)}
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RecipeListSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 md:gap-x-5 gap-y-4">
      <Skeleton className="h-32 md:h-44 rounded-xl" />
      <Skeleton className="h-32 md:h-44 rounded-xl" />
      <Skeleton className="h-32 md:h-44 rounded-xl" />
      <Skeleton className="h-32 md:h-44 rounded-xl hidden md:block" />
    </div>
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
