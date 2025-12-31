import { createFileRoute } from "@tanstack/react-router"
import { Search, ArrowDownWideNarrow, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { allRecipesAtom, searchSortByAtom } from "@/livestore/queries"
import { Result, useAtom, useAtomValue } from "@effect-atom/atom-react"
import { events } from "@/livestore/schema"
import { SortBy } from "@/domain/Recipe"
import { storeIdAtom, useCommit } from "@/livestore/atoms"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useSearchQuery } from "@/Recipes/atoms"
import { RecipeList } from "@/Recipes/List"
import { useState } from "react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export const Route = createFileRoute("/")({
  component: CheffectHome,
})

export default function CheffectHome() {
  const recipes = useAtomValue(allRecipesAtom)

  return (
    <div className="max-w-lg mx-auto p-2 sm:p-4 pb-content!">
      {/* Search Bar */}
      <div className="mb-4">
        <SearchInput />
      </div>

      {/* Recipe Count */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold">My Recipes</h2>
      </div>

      {/* Recipe List - Mobile Optimized */}
      <div className="space-y-4">
        {Result.builder(recipes)
          .onInitial(() => <RecipeListSkeleton />)
          .onSuccess((recipes) => <WrappedList recipes={recipes} />)
          .render()}
      </div>

      <InviteIdChecker />
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
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            const target = e.target as HTMLInputElement
            target.blur()
          }}
          className={`pl-10 h-11 bg-card! ${searchQuery ? "pr-9" : ""}`}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => commit(events.searchStateSet({ query: "" }))}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600"
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
  const sortBy = useAtomValue(searchSortByAtom)
  const commit = useCommit()
  const set = (value: SortBy) =>
    commit(events.searchStateSet({ sortBy: value }))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-11 px-3 bg-card">
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

const invitesSeen = new Set<string>()

function InviteIdChecker() {
  const [open, setOpen] = useState(true)
  const [storeId, setStoreId] = useAtom(storeIdAtom)

  const inviteId = new URLSearchParams(window.location.search).get("invite_id")
  if (!inviteId || inviteId === storeId || invitesSeen.has(inviteId))
    return null

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) invitesSeen.add(inviteId)
        setOpen(open)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Accept invitation</DialogTitle>
          <DialogDescription>
            Someone has shared their recipe collection with you.
            <br />
            Once you "Accept", all data will be replaced with the shared data.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            type="submit"
            onClick={() => {
              console.log("Accepting invite", inviteId)
              setStoreId(inviteId)
              window.location.reload()
            }}
          >
            Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
