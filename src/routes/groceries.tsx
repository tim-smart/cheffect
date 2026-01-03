import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import {
  X,
  ShoppingCart,
  Check,
  MoreVertical,
  Edit,
  Trash,
  WandSparkles,
  LoaderCircle,
  CheckIcon,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import {
  Atom,
  Result,
  useAtom,
  useAtomSet,
  useAtomValue,
} from "@effect-atom/atom-react"
import { GroceryAisle, GroceryItem } from "@/domain/GroceryItem"
import { FormBody, FormDisplay } from "@inato-form/core"
import { TextInput } from "@inato-form/fields"
import {
  SelectWithLiteralsOrNull,
  ShadcnReactHookFormLayer,
  TextInputOrNull,
} from "@/lib/InatoForm"
import * as Effect from "effect/Effect"
import * as DateTime from "effect/DateTime"
import {
  beautifyGroceriesAtom,
  groceryCountAtom,
  groceryItemAddAtom,
  groceryNameAtom,
  groceryNameAutoCompleteAtom,
} from "@/Groceries/atoms"
import { Skeleton } from "@/components/ui/skeleton"
import clsx from "clsx"
import {
  groceryListNamesAtom,
  groceryListStateAtom,
  recipeTitleAtom,
} from "@/livestore/queries"
import { cn } from "@/lib/utils"
import { isAiEnabledAtom } from "@/services/AiHelpers"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import * as Function from "effect/Function"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export const Route = createFileRoute("/groceries")({
  component: GroceryList,
})

function GroceryList() {
  const currentList = useAtomValue(groceryListStateAtom).pipe(
    Result.map((state) => state.currentList),
    Result.getOrElse(Function.constNull),
  )
  const result = useAtomValue(groceryCountAtom)

  const commit = useCommit()
  const clearCompleted = () => {
    commit(events.groceryItemClearedCompleted({ list: currentList }))
  }

  const clearAll = () => {
    commit(events.groceryItemCleared({ list: currentList }))
  }

  const total = result._tag === "Success" ? result.value.total : 0
  const completed = result._tag === "Success" ? result.value.completed : 0

  return (
    <div className="pb-content">
      {/* Header */}
      <header className="bg-background border-b border-border sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-6 h-6 text-primary" />
              <div>
                <ListCombobox>
                  <h1 className="text-lg font-semibold flex items-center gap-1">
                    {currentList ?? "Grocery list"}
                    <ChevronDown className="block size-5" />
                  </h1>
                </ListCombobox>
                <p className="text-sm text-muted-foreground">
                  {completed} of {total} items
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <BeautifyButton />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="p-2">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={clearCompleted}>
                    <Check className="w-4 h-4 mr-2" />
                    Clear completed
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={clearAll}>
                    <Trash className="w-4 h-4 mr-2" />
                    Clear all items
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3">
            <div className="w-full bg-border rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{
                  width: total > 0 ? `${(completed / total) * 100}%` : "0%",
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {Result.builder(result)
        .onSuccess((state) => (
          <>
            <GroceryListList {...state} currentList={currentList} showForm />
            <GroceryListList
              {...state}
              currentList={currentList}
              showCompleted
            />
          </>
        ))
        .orElse(() => (
          <div className="max-w-lg mx-auto">
            <GroceryListSkeleton />
          </div>
        ))}
    </div>
  )
}

const ItemFormSchema = FormBody.struct({
  name: TextInput.Required,
  quantity: TextInputOrNull,
  aisle: SelectWithLiteralsOrNull(...GroceryAisle.literals),
})

const Display = FormDisplay.make(ItemFormSchema).pipe(
  Effect.provide(ShadcnReactHookFormLayer),
  Effect.runSync,
)

const aisleOptions = GroceryAisle.literals.map((value) => ({
  label: value,
  value,
}))

function GroceryItemForm({
  className,
  currentList,
  onSubmit,
  onCancel,
  initialValue,
  compact = false,
  autocomplete = false,
}: {
  currentList: string | null
  className?: string
  onSubmit: (item: GroceryItem) => void
  onCancel?: () => void
  initialValue?: GroceryItem | undefined
  compact?: boolean
  autocomplete?: boolean
}) {
  const isEditing = !!initialValue
  return (
    <Display.Form
      initialValues={
        initialValue
          ? {
              encoded: {
                ...initialValue,
                quantity: initialValue.quantity ?? "",
                aisle: initialValue.aisle ?? "",
              },
            }
          : undefined
      }
      onError={(error) => {
        console.error("Form submission error:", error)
      }}
      onSubmit={(...args) => {
        const [{ decoded }] = args
        const controls = (args as any)[1]
        const item = initialValue
          ? new GroceryItem({
              ...initialValue,
              ...decoded,
              updatedAt: DateTime.unsafeNow(),
            })
          : GroceryItem.fromForm(decoded, currentList)
        onSubmit(item)
        controls.reset()
      }}
    >
      <NameAutoCompleteSync />
      <div
        className={clsx(
          className,
          compact ? "p-3" : "rounded-lg border border-border p-3",
        )}
      >
        {!compact && !isEditing && (
          <h3 className="font-medium  mb-2">Add New Item</h3>
        )}
        <div className={compact ? "space-y-1" : "space-y-2"}>
          {autocomplete ? (
            <NameAutoComplete />
          ) : (
            <Display.name placeholder="Item name" />
          )}
          <div className={`flex ${compact ? "gap-1" : "gap-2"}`}>
            <Display.quantity
              placeholder="Quantity (optional)"
              className="flex-1"
              {...{ tabIndex: -1 }}
            />
            <Display.aisle
              options={aisleOptions}
              placeholder="Other"
              {...{ tabIndex: -1 }}
            />
          </div>
          <div className={`flex gap-2 ${compact ? "h-0 overflow-hidden" : ""}`}>
            <Button
              type="submit"
              className="flex-1 bg-primary hover:bg-orange-700"
            >
              {isEditing ? "Save" : "Add Item"}
            </Button>
            {onCancel && (
              <Button
                onClick={() => onCancel()}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>
    </Display.Form>
  )
}

function GroceryListList({
  total,
  aisles,
  currentList,
  showCompleted = false,
  showForm = false,
}: Atom.Success<typeof groceryCountAtom> & {
  readonly showCompleted?: boolean
  readonly showForm?: boolean
  readonly currentList: string | null
}) {
  const commit = useCommit()
  const addGroceryItem = useAtomSet(groceryItemAddAtom)
  const beautifyResult = useAtomSet(beautifyGroceriesAtom)
  const cancelBeautify = () => beautifyResult(Atom.Reset)

  const toggleItem = (item: GroceryItem) => {
    commit(
      events.groceryItemToggled({ id: item.id, completed: !item.completed }),
    )
  }

  const removeItem = (item: GroceryItem) => {
    cancelBeautify()
    commit(events.groceryItemDeleted({ id: item.id }))
  }

  const filteredAisles = aisles.flatMap((aisle) => {
    const items = aisle.items.filter((item) =>
      showCompleted ? item.completed : !item.completed,
    )
    if (items.length === 0) {
      return []
    }
    return [
      {
        ...aisle,
        items,
      },
    ]
  })

  if (showCompleted && filteredAisles.length === 0) {
    return null
  }

  return (
    <>
      {showForm && (
        <div className="bg-background border-b border-border">
          <GroceryItemForm
            currentList={currentList}
            className="max-w-lg mx-auto px-2 sm:px-4"
            onSubmit={(item) => {
              addGroceryItem(item)
            }}
            compact
            autocomplete
          />
        </div>
      )}
      <div className="space-y-4 max-w-lg mx-auto p-2 sm:p-4">
        {showCompleted && <h2 className="text-lg font-semibold ">Completed</h2>}
        {/* Grocery List by Aisle */}
        {aisles
          .flatMap((aisle) => {
            const items = aisle.items.filter((item) =>
              showCompleted ? item.completed : !item.completed,
            )
            if (items.length === 0) {
              return []
            }
            return [
              {
                ...aisle,
                items,
              },
            ]
          })
          .map(({ name, items }) => (
            <div key={name}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold ">{name}</h2>
              </div>

              <div className="rounded-lg overflow-hidden divide-y divide-border border border-border">
                {items.map((item) => (
                  <GroceryListItem
                    key={item.id}
                    item={item}
                    toggleItem={toggleItem}
                    removeItem={removeItem}
                  />
                ))}
              </div>
            </div>
          ))}

        {/* Empty State */}
        {total === 0 && (
          <div className="text-center py-16">
            <ShoppingCart className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">
              Your grocery list is empty
            </h3>
            <p className="text-muted-foreground mb-6">
              Add items to start building your shopping list
            </p>
          </div>
        )}
      </div>
    </>
  )
}

function GroceryListItem({
  item,
  toggleItem,
  removeItem,
}: {
  item: GroceryItem
  toggleItem: (item: GroceryItem) => void
  removeItem: (item: GroceryItem) => void
}) {
  const commit = useCommit()
  const [editingItem, setEditingItem] = useState(false)
  return (
    <div
      className={cn(
        `flex items-center gap-3 pl-3 transition-colors bg-card ${item.completed ? "bg-muted" : "active:bg-muted dark:active:bg-card/50"}`,
        editingItem ? "" : "cursor-default",
      )}
    >
      <Checkbox
        checked={item.completed}
        onCheckedChange={() => toggleItem(item)}
        className="shrink-0"
      />

      {editingItem ? (
        // Edit mode
        <div className="flex-1">
          <GroceryItemForm
            initialValue={item}
            currentList={item.list}
            onSubmit={(updated) => {
              commit(events.groceryItemUpdated(updated))
              setEditingItem(false)
            }}
            onCancel={() => setEditingItem(false)}
          />
        </div>
      ) : (
        // Display mode
        <>
          <div
            className={cn(
              "flex-1 min-w-0 flex flex-col leading-tight py-1 justify-center",
              item.recipeIds ? "pt-2" : "min-h-13",
              `${item.completed ? "text-muted-foreground" : ""}`,
            )}
            onClick={() => toggleItem(item)}
          >
            <div>
              <span>{item.name}</span>
              {item.quantity && (
                <span className="text-sm text-muted-foreground ml-2">
                  ({item.quantity})
                </span>
              )}
            </div>
            {item.recipeIds && (
              <div className="text-xs text-muted-foreground [&>*:not(:last-child)]:after:content-['•'] pb-1 [&>*:not(:last-child)]:after:mx-1">
                {item.recipeIds.map((id) => (
                  <RecipeTitle key={id} id={id} />
                ))}
              </div>
            )}
          </div>
          <div>
            <Button
              onClick={() => setEditingItem(true)}
              variant="ghost"
              size="sm"
              className="p-2! text-muted-foreground hover:text-orange-500 shrink-0 -mr-2"
            >
              <Edit />
            </Button>
            <Button
              onClick={() => removeItem(item)}
              variant="ghost"
              size="sm"
              className="p-2! text-muted-foreground hover:text-red-500 shrink-0"
            >
              <X />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function GroceryListSkeleton() {
  return (
    <div className="p-4 pt-12 space-y-4">
      <Skeleton className="h-12 w-full mb-4" />
      <Skeleton className="h-12 w-full mb-4" />
      <Skeleton className="h-12 w-full mb-4" />
      <Skeleton className="h-12 w-full mb-4" />
      <Skeleton className="h-12 w-full mb-4" />
    </div>
  )
}

function BeautifyButton() {
  const [result, beautifyGroceries] = useAtom(beautifyGroceriesAtom)
  const aiEnabled = useAtomValue(isAiEnabledAtom)
  if (!aiEnabled) {
    return null
  }

  return (
    <Button
      onClick={() => beautifyGroceries()}
      disabled={result.waiting}
      variant="outline"
      size="sm"
    >
      {result.waiting ? (
        <LoaderCircle className="w-4 h-4 animate-spin" />
      ) : (
        <WandSparkles className="w-4 h-4" />
      )}
    </Button>
  )
}

function RecipeTitle({ id }: { readonly id: string }) {
  const title = useAtomValue(recipeTitleAtom(id))
  return <span>{title}</span>
}

function NameAutoCompleteSync() {
  const name = Display.name.useControls().watch()
  const setName = useAtomSet(groceryNameAtom)
  useEffect(() => {
    setName(name ?? "")
  }, [name])
  return null
}

function NameAutoComplete() {
  const setName = Display.name.useControls().set
  const results = useAtomValue(groceryNameAutoCompleteAtom)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const onClick = (value: string) => {
    setName(value)
    inputRef.current?.focus()
    inputRef.current?.form?.requestSubmit()
  }
  return (
    <Command className="overflow-visible bg-transparent!">
      <Display.name
        placeholder="Item name"
        {...{
          onFocus(e: React.FocusEvent) {
            inputRef.current = e.target as HTMLInputElement
            setFocused(true)
          },
          onBlur(e: React.FocusEvent) {
            if (e.relatedTarget?.hasAttribute("cmdk-list")) return
            setFocused(false)
          },
          onKeyDown(e: React.KeyboardEvent) {
            if (e.key !== "Enter") return
            const input = e.target as HTMLInputElement
            setTimeout(() => {
              input.form?.requestSubmit()
            }, 0)
          },
        }}
      />
      <div
        className={cn(
          "relative z-10",
          focused && results.length > 0 ? "block" : "hidden",
        )}
      >
        <CommandList className="animate-in fade-in-0 zoom-in-95 absolute top-2 z-1 w-full rounded-xl bg-background border shadow-lg">
          <CommandGroup>
            <CommandItem value="-" className="hidden" />
            {results.map((name) => (
              <CommandItem
                key={name}
                onSelect={setName}
                onPointerDown={(e) => e.preventDefault()}
                onPointerUp={(e) => {
                  e.preventDefault()
                  onClick(name)
                }}
              >
                {name}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </div>
    </Command>
  )
}

function ListCombobox({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useAtom(groceryListStateAtom)
  const currentList = state.pipe(
    Result.map((s) => s.currentList),
    Result.getOrElse(() => null),
  )
  const listNames = useAtomValue(
    groceryListNamesAtom,
    Result.getOrElse(() => [null]),
  )
  const [inputValue, setInputValue] = useState("")
  const inputTrimmed = inputValue.trim()

  const hasCurrentList = listNames.includes(currentList as any)
  const hasInputList = listNames.includes(inputTrimmed as any)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger onClick={() => setOpen(true)}>{children}</PopoverTrigger>
      <PopoverContent
        className="p-0 min-w-[--radix-popper-anchor-width]"
        align="start"
      >
        <Command value={currentList ?? ""}>
          <CommandInput
            placeholder="Search or create list..."
            value={inputValue}
            onValueChange={setInputValue}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (inputTrimmed.length === 0) return
                setState({ currentList: inputTrimmed })
                setOpen(false)
                setInputValue("")
              }
            }}
          />
          <CommandList>
            <CommandGroup>
              {inputTrimmed &&
                currentList !== inputTrimmed &&
                !hasInputList && (
                  <CommandItem
                    onPointerUp={() => {
                      setState({ currentList: inputTrimmed })
                      setOpen(false)
                      setInputValue("")
                    }}
                  >
                    Create "{inputTrimmed}"
                  </CommandItem>
                )}
              {listNames.map((list) => (
                <CommandItem
                  key={list ?? "default"}
                  onPointerUp={() => {
                    setState({ currentList: list })
                    setOpen(false)
                  }}
                >
                  <CheckIcon
                    className={
                      list === currentList ? "opacity-100" : "opacity-0"
                    }
                  />
                  {list ?? "Grocery list"}
                </CommandItem>
              ))}
              {!hasCurrentList && currentList && (
                <CommandItem>
                  <CheckIcon />
                  {currentList}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
