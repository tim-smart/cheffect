import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { aiChatOpenAtom } from "@/atoms"
import { Recipe } from "@/domain/Recipe"
import { recipeSortByAtom, recipesAtom } from "@/Recipes/atoms"
import { searchRecipes } from "@/Recipes/Repo"
import { router } from "@/Router"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Duration from "effect/Duration"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { ChefHat } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

// ⌘K on Apple keyboards, Ctrl+K elsewhere. Ctrl+K on a Mac deletes to the
// end of the line in text fields, so it is left to do that. Apple keyboards
// are told apart as the chat's ⌘J does
const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

/** The shortcut as this keyboard writes it, for hints */
export const quickSearchShortcut = isApple ? "⌘K" : "Ctrl+K"

const isShortcut = (e: KeyboardEvent) =>
  e.key.toLowerCase() === "k" &&
  !e.shiftKey &&
  !e.altKey &&
  !e.isComposing &&
  (isApple ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)

// A destination picked from the results. Each kind of destination is a group
// of its own; recipes are the only one so far
type Go = (
  navigate: (options: { readonly replace: boolean }) => Promise<void>,
) => void

/**
 * Jumps to a recipe from any screen with ⌘K. The dialog sits over the page,
 * so dismissing it leaves the page as it was and puts the focus back where
 * it was; only picking a result navigates.
 */
export function QuickSearch() {
  const [open, setOpen] = useState(false)
  // Where the focus was when the search opened. Radix returns the focus to a
  // dialog's trigger, and the shortcut has none, so it is put back by hand
  const returnFocus = useRef<HTMLElement | null>(null)
  // Set when a result is picked: the focus belongs to the page being opened,
  // not to the one being left
  const navigating = useRef(false)
  const setAiChatOpen = useAtomSet(aiChatOpenAtom)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isShortcut(e)) return
      // The shortcut closes the search as it opened it, but leaves other
      // dialogs, popovers, menus and lists alone, as the chat's shortcut
      // does: they hold the focus, and opening over them would stack modals
      if (
        !open &&
        e.target instanceof Element &&
        e.target.closest(
          "[role=dialog], [role=alertdialog], [role=menu], [role=listbox]",
        ) !== null
      ) {
        return
      }
      e.preventDefault()
      // a held key would open and close the search on every repeat
      if (e.repeat) return
      if (!open && document.activeElement instanceof HTMLElement) {
        returnFocus.current = document.activeElement
      }
      setOpen(!open)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  // The chat can cover the page, full screen on phones or maximized, so it
  // is minimized to show where the search went; its draft and conversation
  // stay. The chat steps back out of the history entry it pushed when it
  // closes on that entry, which would undo a navigation still under way. So
  // the navigation replaces the chat's entry, and the chat closes once it
  // has landed, finding its entry gone
  const go: Go = async (navigate) => {
    navigating.current = true
    setOpen(false)
    await navigate({ replace: history.state?.aiChatOpen === true })
    setAiChatOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        className="top-[12vh] translate-y-0 w-[calc(100%-2rem)] max-w-xl gap-0 overflow-hidden rounded-xl p-0 data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          const element = returnFocus.current
          returnFocus.current = null
          if (navigating.current) {
            navigating.current = false
          } else if (element?.isConnected) {
            element.focus({ preventScroll: true })
          }
        }}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <SearchCommand go={go} />
      </DialogContent>
    </Dialog>
  )
}

// Mounted while the dialog is open, so every search starts empty
function SearchCommand({ go }: { readonly go: Go }) {
  // Unlike the recipes page, the results render with the query rather than
  // deferred: there are few of them, and cmdk selects the first result as
  // the query changes, which has to be the first of the new results
  const [query, setQuery] = useState("")
  // Every query starts its results at the top, with the first selected. cmdk
  // selects the first result itself, but scrolls to it only when the
  // selection changes, and before the results show it, so it lands on the
  // result the old query had selected. The selection is cleared with the
  // query, leaving cmdk nothing to scroll to, and the list goes to the top
  const [selected, setSelected] = useState("")
  const listRef = useRef<HTMLDivElement>(null)
  return (
    <Command
      shouldFilter={false}
      loop
      value={selected}
      onValueChange={setSelected}
      className="rounded-none bg-background"
    >
      <CommandInput
        value={query}
        onValueChange={(query: string) => {
          setQuery(query)
          setSelected("")
          if (listRef.current) listRef.current.scrollTop = 0
        }}
        placeholder="Search recipes..."
        className="h-13 text-base md:text-sm"
      />
      <CommandList
        ref={listRef}
        className="max-h-[min(24rem,60vh)] scroll-py-2 overscroll-contain"
      >
        <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">
          No recipes found
        </CommandEmpty>
        <RecipeResults query={query} go={go} />
      </CommandList>
      <div
        aria-hidden
        className="hidden pointer-fine:flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground"
      >
        <span>
          <Key>↑</Key> <Key>↓</Key> to move
        </span>
        <span>
          <Key>↵</Key> to open
        </span>
        <span>
          <Key>esc</Key> to close
        </span>
      </div>
    </Command>
  )
}

function Key({ children }: { readonly children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border px-1 font-sans text-[11px] leading-none">
      {children}
    </kbd>
  )
}

// Enough to find a recipe by name; a broader query narrows rather than scrolls
const recipeLimit = 50

function RecipeResults({
  query,
  go,
}: {
  readonly query: string
  readonly go: Go
}) {
  const recipes = useAtomValue(recipesAtom)
  const sortBy = useAtomValue(recipeSortByAtom)
  // Ranked as the recipes page ranks them, in the order it is sorted by
  const results = useMemo(
    () =>
      AsyncResult.map(recipes, (recipes) =>
        searchRecipes(recipes, { query, sortBy }).slice(0, recipeLimit),
      ),
    [recipes, query, sortBy],
  )
  if (!AsyncResult.isSuccess(results) || results.value.length === 0) {
    return null
  }
  return (
    <CommandGroup heading="Recipes" className="p-2">
      {results.value.map((recipe) => (
        <CommandItem
          key={recipe.idString}
          value={recipe.idString}
          onSelect={() =>
            go(({ replace }) =>
              router.navigate({
                to: "/recipes/$id",
                params: { id: recipe.idString },
                replace,
              }),
            )
          }
          className="gap-3 rounded-lg px-2 py-2"
        >
          <RecipeResult recipe={recipe} />
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

function RecipeResult({ recipe }: { readonly recipe: Recipe }) {
  const meta = [
    ...Option.match(recipe.totalTime, {
      onNone: () => [],
      onSome: (d) => [Duration.format(d)],
    }),
    ...(recipe.servings !== null ? [`Serves ${recipe.servingsDisplay}`] : []),
  ]
  // By code point, so an emoji at the front stays whole
  const initial = [...recipe.title.trim()][0]?.toUpperCase() ?? ""
  return (
    <>
      {/* The photo, or the recipe's initial as on its tile */}
      <div
        data-photo={recipe.imageUrl ? "loading" : "none"}
        className="group/thumb relative size-10 shrink-0 overflow-hidden rounded-md bg-muted"
      >
        <div
          aria-hidden
          className="absolute inset-0 hidden items-center justify-center bg-primary-muted text-primary/80 group-data-[photo=none]/thumb:flex"
        >
          {initial ? (
            <span className="font-display text-lg font-medium leading-none">
              {initial}
            </span>
          ) : (
            <ChefHat className="opacity-60" />
          )}
        </div>
        {recipe.imageUrl && (
          <img
            src={recipe.imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.hidden = true
              event.currentTarget.parentElement!.dataset.photo = "none"
            }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{recipe.title}</div>
        {meta.length > 0 && (
          <div className="truncate text-xs text-muted-foreground tabular-nums">
            {meta.join(" · ")}
          </div>
        )}
      </div>
    </>
  )
}
