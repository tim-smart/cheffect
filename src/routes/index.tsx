import { createFileRoute } from "@tanstack/react-router"
import { Search, ArrowDownWideNarrow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { allRecipesAtom, searchSortByAtom } from "@/livestore/queries"
import { Result, useAtomValue } from "@effect-atom/atom-react"
import { events } from "@/livestore/schema"
import { SortBy } from "@/domain/Recipe"
import { useCommit } from "@/livestore/atoms"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useSearchQuery } from "@/Recipes/atoms"
import { RecipeList } from "@/Recipes/List"

export const Route = createFileRoute("/")({
  component: CheffectHome,
})

export default function CheffectHome() {
  const recipes = useAtomValue(allRecipesAtom)

  return (
    <div className="max-w-lg mx-auto p-2 sm:p-4 pb-30">
      {/* Search Bar */}
      <div className="mb-4">
        <SearchInput />
      </div>

      {/* Recipe Count */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">My Recipes</h2>
      </div>

      {/* Recipe List - Mobile Optimized */}
      <div className="space-y-4">
        {Result.builder(recipes)
          .onInitial(() => <RecipeListSkeleton />)
          .onSuccess((recipes) => <WrappedList recipes={recipes} />)
          .render()}
      </div>
    </div>
  )
}

function WrappedList({ recipes }: { recipes: ReadonlyArray<any> }) {
  const searchQuery = useSearchQuery()
  return <RecipeList recipes={recipes} searchQuery={searchQuery} />
}

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
      <SortButton />
    </div>
  )
}

function SortButton() {
  const sortBy = useAtomValue(searchSortByAtom)
  const commit = useCommit()
  const set = (value: SortBy) =>
    commit(events.searchStateSet({ sortBy: value }))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-11 px-3 bg-transparent"
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
    <div className="flex flex-col gap-2">
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
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
