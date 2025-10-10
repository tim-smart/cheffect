import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import {
  X,
  ShoppingCart,
  Check,
  MoreVertical,
  Edit,
  Trash,
  WandSparkles,
  LoaderCircle,
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
import { beautifyGroceriesAtom, groceryCountAtom } from "@/Groceries/atoms"
import { Skeleton } from "@/components/ui/skeleton"
import clsx from "clsx"

export const Route = createFileRoute("/groceries")({
  component: GroceryList,
})

function GroceryList() {
  const result = useAtomValue(groceryCountAtom)

  const commit = useCommit()
  const clearCompleted = () => {
    commit(events.groceryItemClearedCompleted())
  }

  const clearAll = () => {
    commit(events.groceryItemCleared())
  }

  const total = result._tag === "Success" ? result.value.total : 0
  const completed = result._tag === "Success" ? result.value.completed : 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-6 h-6 text-orange-600" />
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  Grocery List
                </h1>
                <p className="text-sm text-gray-500">
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
                <DropdownMenuContent align="end">
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
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: total > 0 ? `${(completed / total) * 100}%` : "0%",
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {Result.builder(result)
        .onSuccess((state) => <GroceryListList {...state} />)
        .orElse(() => (
          <GroceryListSkeleton />
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

const aisleOptions = [
  {
    label: "Unknown",
    value: null as string | null,
  },
].concat(
  GroceryAisle.literals.map((value) => ({
    label: value,
    value,
  })),
)

function GroceryItemForm({
  className,
  onSubmit,
  onCancel,
  initialValue,
  compact = false,
}: {
  className?: string
  onSubmit: (item: GroceryItem) => void
  onCancel?: () => void
  initialValue?: GroceryItem | undefined
  compact?: boolean
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
          : GroceryItem.fromForm(decoded)
        onSubmit(item)
        controls.reset()
      }}
    >
      <div
        className={clsx(
          className,
          compact
            ? "bg-white p-3"
            : "bg-white rounded-lg border border-gray-200 p-3",
        )}
      >
        {!compact && !isEditing && (
          <h3 className="font-medium text-gray-900 mb-2">Add New Item</h3>
        )}
        <div className={compact ? "space-y-1" : "space-y-2"}>
          <div>
            <Display.name placeholder="Item name" />
          </div>
          <div className={`flex ${compact ? "gap-1" : "gap-2"}`}>
            <Display.quantity
              placeholder="Quantity (optional)"
              className="flex-1"
            />
            <Display.aisle options={aisleOptions as any} />
          </div>
          <div className={`flex gap-2 ${compact ? "h-0 overflow-hidden" : ""}`}>
            <Button
              type="submit"
              className="flex-1 bg-orange-600 hover:bg-orange-700"
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
}: Atom.Success<typeof groceryCountAtom>) {
  const commit = useCommit()
  const [editingItem, setEditingItem] = useState<GroceryItem | null>(null)
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

  const startEditing = (item: GroceryItem) => {
    cancelBeautify()
    setEditingItem(item)
  }

  const cancelEdit = () => {
    setEditingItem(null)
  }

  return (
    <>
      {/* Add Item Form */}
      <div className="bg-white border-b border-gray-200">
        <GroceryItemForm
          className="max-w-lg mx-auto px-2 sm:px-4"
          onSubmit={(item) => {
            commit(events.groceryItemAdded(item))
          }}
          compact
        />
      </div>
      <div className="space-y-4 max-w-lg mx-auto p-2 sm:p-4">
        {/* Grocery List by Aisle */}
        {aisles.map(({ name, items }) => {
          return (
            <div key={name}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900">{name}</h2>
              </div>

              <div className="bg-white rounded-lg overflow-hidden divide-y divide-gray-200 border border-gray-200">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 transition-colors ${
                      item.completed ? "bg-gray-50" : "active:bg-gray-50"
                    }`}
                  >
                    <Checkbox
                      checked={item.completed}
                      onCheckedChange={() => toggleItem(item)}
                      className="flex-shrink-0"
                    />

                    {editingItem?.id === item.id ? (
                      // Edit mode
                      <div className="flex-1">
                        <GroceryItemForm
                          initialValue={item}
                          onSubmit={(updated) => {
                            commit(events.groceryItemUpdated(updated))
                            setEditingItem(null)
                          }}
                          onCancel={cancelEdit}
                        />
                      </div>
                    ) : (
                      // Display mode
                      <>
                        <div
                          className="flex-1 min-w-0"
                          onClick={() => toggleItem(item)}
                        >
                          <div
                            className={`${item.completed ? "line-through text-gray-500" : "text-gray-900"}`}
                          >
                            <span>{item.name}</span>
                            {item.quantity && (
                              <span className="text-sm text-gray-600 ml-2">
                                ({item.quantity})
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <Button
                            onClick={() => startEditing(item)}
                            variant="ghost"
                            size="sm"
                            className="!p-2 text-gray-400 hover:text-orange-500 flex-shrink-0"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {editingItem?.id !== item.id && (
                            <Button
                              onClick={() => removeItem(item)}
                              variant="ghost"
                              size="sm"
                              className="!p-2 text-gray-400 hover:text-red-500 flex-shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Empty State */}
        {total === 0 && (
          <div className="text-center py-16">
            <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Your grocery list is empty
            </h3>
            <p className="text-gray-500 mb-6">
              Add items to start building your shopping list
            </p>
          </div>
        )}
      </div>
    </>
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

  return (
    <Button
      onClick={() => beautifyGroceries()}
      disabled={result.waiting}
      variant="outline"
    >
      {result.waiting ? (
        <LoaderCircle className="w-4 h-4 animate-spin" />
      ) : (
        <WandSparkles className="w-4 h-4" />
      )}
    </Button>
  )
}
