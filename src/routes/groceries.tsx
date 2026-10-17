import { createFileRoute } from "@tanstack/react-router"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import {
  X,
  ShoppingCart,
  Check,
  SquareArrowRight as SquareArrowRightExit,
  MoreVertical,
  Edit,
  Trash,
  WandSparkles,
  LoaderCircle,
  CheckIcon,
  ChevronDown,
  GripVertical,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import * as Arr from "effect/Array"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Option from "effect/Option"
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  GroceryAisle,
  GroceryItem,
  GroceryItemId,
  PANTRY_GROCERY_LIST_NAME,
} from "@/domain/GroceryItem"
import type { RecipeId } from "@/domain/Recipe"
import { type EventPayload, useWrite, useWriteEvents } from "@/EventLog"
import { generateUuidBytes, uuidString } from "@/lib/Id"
import { FormBody, FormDisplay } from "@/lib/Form"
import {
  SelectWithLiteralsOrNull,
  TextInputOrNull,
  TextInput,
} from "@/lib/InatoForm"
import * as DateTime from "effect/DateTime"
import {
  beautifyGroceriesAtom,
  groceryCountAtom,
  groceryListNamesAtom,
  groceryNameAtom,
  groceryNameAutoCompleteAtom,
} from "@/Groceries/atoms"
import { groceryItemAddAtom, groceryItemEditAtom } from "@/Groceries/runtime"
import { Skeleton } from "@/components/ui/skeleton"
import { groceryCurrentListAtom } from "@/Groceries/currentList"
import { recipeTitleAtom } from "@/Recipes/atoms"
import { cn } from "@/lib/utils"
import { isAiEnabledAtom } from "@/services/AiHelpers"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  DndContext,
  pointerWithin,
  useDraggable,
  useDroppable,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core"

export const Route = createFileRoute("/groceries")({
  component: GroceryList,
})

const arrayMove = <T,>(items: readonly T[], from: number, to: number): T[] => {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

function GroceryList() {
  const currentList = useAtomValue(groceryCurrentListAtom)
  const result = useAtomValue(groceryCountAtom)

  const write = useWrite()
  const writeEvents = useWriteEvents()

  // A clear deletes the items this device shows, so an item added on another
  // device at the same time survives it.
  const clearShown = (shown: (item: GroceryItem) => boolean) => {
    if (result._tag !== "Success") return
    const ids = result.value.aisles.flatMap(({ items }) =>
      items.filter(shown).map((item) => item.id),
    )
    if (!Arr.isArrayNonEmpty(ids)) return
    write({ event: "GroceryItemsDeleted", payload: { ids } })
  }

  const clearCompleted = () => clearShown((item) => item.completed)

  const moveCompletedTargetList =
    currentList === PANTRY_GROCERY_LIST_NAME ? null : PANTRY_GROCERY_LIST_NAME

  // Each item's copy and delete are written together in one batch, so the
  // originals never go without their copies.
  const moveCompletedToOtherList = () => {
    if (result._tag !== "Success") {
      return
    }
    const now = DateTime.nowUnsafe()
    writeEvents(
      result.value.aisles.flatMap(({ items }) =>
        items
          .filter((item) => item.completed)
          .flatMap((item): Array<EventPayload> => [
            {
              event: "GroceryItemAdded",
              payload: new GroceryItem({
                ...item,
                id: GroceryItemId.make(generateUuidBytes()),
                list: moveCompletedTargetList,
                completed: false,
                createdAt: now,
                updatedAt: now,
              }),
            },
            { event: "GroceryItemDeleted", payload: { id: item.id } },
          ]),
      ),
    )
  }

  const clearAll = () => clearShown(() => true)

  const total = result._tag === "Success" ? result.value.total : 0
  const completed = result._tag === "Success" ? result.value.completed : 0
  const remaining = total - completed

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
                  {remaining} of {total} items remaining
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
                  <DropdownMenuItem
                    onClick={moveCompletedToOtherList}
                    disabled={completed === 0}
                  >
                    <SquareArrowRightExit className="w-4 h-4 mr-2" />
                    {moveCompletedTargetList === null
                      ? "Move completed to Groceries"
                      : "Move completed to Pantry"}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={clearAll}>
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

      {AsyncResult.builder(result)
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
  aisle: SelectWithLiteralsOrNull(GroceryAisle.literals),
})

const Display = FormDisplay.make(ItemFormSchema, Button)

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
  showDetails = true,
}: {
  currentList: string | null
  className?: string
  onSubmit: (item: GroceryItem) => void
  onCancel?: () => void
  initialValue?: GroceryItem | undefined
  compact?: boolean
  autocomplete?: boolean
  showDetails?: boolean
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
      onSubmit={({ decoded }, controls) => {
        const item = initialValue
          ? new GroceryItem({
              ...initialValue,
              ...decoded,
              updatedAt: DateTime.nowUnsafe(),
            })
          : GroceryItem.fromForm(decoded, currentList)
        onSubmit(item)
        controls.reset()
      }}
    >
      <NameAutoCompleteSync />
      <div className={cn(className, compact ? "p-2" : "p-3")}>
        {!compact && !isEditing && (
          <h3 className="font-medium mb-2">Add New Item</h3>
        )}
        <div className={compact ? "space-y-1" : "space-y-2"}>
          {autocomplete ? (
            <NameAutoComplete />
          ) : (
            <Display.name placeholder="Item name" />
          )}
          {showDetails && (
            <>
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
              <div
                className={`flex gap-2 ${compact ? "h-0 overflow-hidden" : ""}`}
              >
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
            </>
          )}
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
  const write = useWrite()
  const addGroceryItem = useAtomSet(groceryItemAddAtom)
  const beautifyResult = useAtomSet(beautifyGroceriesAtom)
  const canReorder = !showCompleted
  const lastOverId = useRef<string | null>(null)

  // Stable, so a row whose item didn't change skips re-rendering.
  const toggleItem = useCallback(
    (item: GroceryItem) => {
      write({
        event: "GroceryItemToggled",
        payload: { id: item.id, completed: !item.completed },
      })
      if ("vibrate" in navigator) {
        navigator.vibrate(3)
      }
    },
    [write],
  )

  const removeItem = useCallback(
    (item: GroceryItem) => {
      beautifyResult(Atom.Reset)
      write({ event: "GroceryItemDeleted", payload: { id: item.id } })
      if ("vibrate" in navigator) {
        navigator.vibrate(3)
      }
    },
    [write, beautifyResult],
  )

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

  const reorderAisles = (activeId: string, overId: string) => {
    const fromIndex = aisles.findIndex(({ name }) => name === activeId)
    const toIndex = aisles.findIndex(({ name }) => name === overId)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
    const nextOrder = arrayMove(aisles, fromIndex, toIndex)
    const updatedAt = DateTime.nowUnsafe()
    nextOrder.forEach(({ name }, index) => {
      write({
        event: "GroceryAisleOrderSet",
        payload: {
          list: currentList,
          aisle: name,
          sortOrder: index,
          updatedAt,
        },
      })
    })
  }

  return (
    <>
      {showForm && (
        <div className="bg-background border-b border-border">
          <GroceryItemForm
            currentList={currentList}
            className="max-w-lg mx-auto px-2"
            onSubmit={(item) => {
              addGroceryItem(item)
            }}
            compact
            autocomplete
            showDetails={false}
          />
        </div>
      )}
      <DndContext
        collisionDetection={pointerWithin}
        onDragStart={() => {
          lastOverId.current = null
        }}
        onDragOver={(event: DragOverEvent) => {
          if (!canReorder) return
          const overId = String(event?.over?.id ?? "")
          if (!overId || lastOverId.current === overId) return
          lastOverId.current = overId
          if ("vibrate" in navigator) {
            navigator.vibrate(3)
          }
        }}
        onDragEnd={(event: DragEndEvent) => {
          if (!canReorder) return
          const { active, over } = event
          if (!over) return
          reorderAisles(String(active.id), String(over.id))
          lastOverId.current = null
        }}
        onDragCancel={() => {
          lastOverId.current = null
        }}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 max-w-lg mx-auto p-2">
            {showCompleted && (
              <hr className="my-4 border-border border-3 rounded-lg w-2/5 mx-auto" />
            )}
            {/* Grocery List by Aisle */}
            {filteredAisles.map(({ name, items }) => (
              <GroceryAisleSection
                key={name}
                name={name}
                items={items}
                toggleItem={toggleItem}
                removeItem={removeItem}
                draggable={canReorder}
              />
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
        </div>
      </DndContext>
    </>
  )
}

function GroceryAisleSection({
  name,
  items,
  toggleItem,
  removeItem,
  draggable,
}: {
  name: string
  items: GroceryItem[]
  toggleItem: (item: GroceryItem) => void
  removeItem: (item: GroceryItem) => void
  draggable: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: name, disabled: !draggable })
  const { isOver, setNodeRef: setDroppableRef } = useDroppable({ id: name })
  const setNodeRef = (node: HTMLDivElement | null) => {
    setDraggableRef(node)
    setDroppableRef(node)
  }
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 999,
      }
    : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative rounded-lg transition-colors",
        isOver && !isDragging && "bg-primary-muted",
        isDragging && "bg-muted",
      )}
      {...attributes}
    >
      <div
        className={cn(
          "flex items-center justify-between mb-2 rounded-lg px-2 py-1",
          isOver && !isDragging && "text-primary",
        )}
      >
        <div className="flex items-center gap-2">
          {draggable && (
            <div
              ref={setActivatorNodeRef}
              className={cn(
                "touch-none p-1 -ml-1 rounded text-muted-foreground/60",
                isDragging ? "cursor-grabbing" : "cursor-grab",
              )}
              {...listeners}
            >
              <GripVertical className="size-5" />
            </div>
          )}
          <h2 className="font-semibold ">{name}</h2>
        </div>
      </div>

      <div className="rounded-lg overflow-hidden divide-y divide-border border border-border">
        {items.map((item) => (
          <GroceryListItem
            key={item.idString}
            item={item}
            toggleItem={toggleItem}
            removeItem={removeItem}
          />
        ))}
      </div>
    </div>
  )
}

// Memoised: the repo hands back the same item for a row a write didn't touch,
// so checking one item off re-renders only its row.
const GroceryListItem = memo(function GroceryListItem({
  item,
  toggleItem,
  removeItem,
}: {
  item: GroceryItem
  toggleItem: (item: GroceryItem) => void
  removeItem: (item: GroceryItem) => void
}) {
  const editItem = useAtomSet(groceryItemEditAtom)
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
              editItem({ item: updated, previousName: item.name })
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
                  <RecipeTitle key={uuidString(id)} id={id} />
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
})

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

// Renders nothing while the recipe is loading, or when it is missing (an item
// can sync before its recipe, or outlive it).
function RecipeTitle({ id }: { readonly id: RecipeId }) {
  const title = useAtomValue(recipeTitleAtom(uuidString(id))).pipe(
    AsyncResult.value,
    Option.flatten,
  )
  return Option.isSome(title) ? <span>{title.value}</span> : null
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
  const write = useWrite()
  const setName = Display.name.useControls().set
  const results = useAtomValue(groceryNameAutoCompleteAtom)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const onClick = (value: string) => {
    setName(value)
    inputRef.current?.focus()
    inputRef.current?.form?.requestSubmit()
  }
  const onRemove = (value: string) => {
    write({ event: "IngredientAisleRemoved", payload: { name: value } })
  }
  const stopPointer = (event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }
  return (
    <Command className="overflow-visible bg-transparent!">
      <Display.name
        placeholder="Add an item..."
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
                className="justify-between"
                onSelect={setName}
                onPointerDown={(e: React.PointerEvent<HTMLDivElement>) =>
                  e.preventDefault()
                }
                onPointerUp={(e: React.PointerEvent<HTMLDivElement>) => {
                  e.preventDefault()
                  onClick(name)
                }}
              >
                <span className="truncate">{name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onPointerDown={stopPointer}
                  onPointerUp={stopPointer}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onRemove(name)
                  }}
                  aria-label={`Remove ${name} from suggestions`}
                >
                  <X />
                </Button>
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
  const [currentList, setCurrentList] = useAtom(groceryCurrentListAtom)
  const listNames = useAtomValue(
    groceryListNamesAtom,
    AsyncResult.getOrElse(() => [null]),
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
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                if (inputTrimmed.length === 0) return
                setCurrentList(inputTrimmed)
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
                      setCurrentList(inputTrimmed)
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
                    setCurrentList(list)
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
