import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import {
  Plus,
  X,
  ShoppingCart,
  Check,
  MoreVertical,
  Edit,
  Trash,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { Result, useAtomValue } from "@effect-atom/atom-react"
import { allGroceryItemsAtom } from "@/livestore/queries"
import { GroceryIsle, GroceryItem } from "@/domain/GroceryItem"

export const Route = createFileRoute("/groceries")({
  component: GroceryList,
})

export default function GroceryList() {
  const commit = useCommit()
  const items = useAtomValue(
    allGroceryItemsAtom,
    Result.getOrElse(() => new Map<never, never>()),
  )
  const [newItemName, setNewItemName] = useState("")
  const [newItemQuantity, setNewItemQuantity] = useState("")
  const [selectedAisle, setSelectedAisle] = useState("Produce")
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editQuantity, setEditQuantity] = useState("")

  const toggleItem = (_item: GroceryItem) => {
    // TODO
  }

  const removeItem = (_item: GroceryItem) => {
    // TODO
  }

  const addItem = () => {
    if (!newItemName.trim()) return

    // const aisleIndex = groceryList.findIndex(
    //   (aisle) => aisle.name === selectedAisle,
    // )
    // if (aisleIndex === -1) return
    //
    // const newItem: GroceryItem = {
    //   id: Date.now().toString(),
    //   name: newItemName.trim(),
    //   quantity: newItemQuantity.trim() || undefined,
    //   completed: false,
    // }
    //
    // setGroceryList((prev) =>
    //   prev.map((aisle, i) =>
    //     i === aisleIndex
    //       ? {
    //           ...aisle,
    //           items: [...aisle.items, newItem],
    //         }
    //       : aisle,
    //   ),
    // )

    setNewItemName("")
    setNewItemQuantity("")
    setShowAddForm(false)
  }

  const clearCompleted = () => {}

  const clearAll = () => {
    commit(events.groceryItemCleared())
  }

  const startEditing = (item: any) => {
    setEditingItem(item.id)
    setEditName(item.name)
    setEditQuantity(item.quantity || "")
  }

  const saveEdit = (_edit: {}) => {
    if (!editName.trim()) return
    //
    // setGroceryList((prev) =>
    //   prev.map((aisle, i) =>
    //     i === aisleIndex
    //       ? {
    //           ...aisle,
    //           items: aisle.items.map((item) =>
    //             item.id === itemId
    //               ? {
    //                   ...item,
    //                   name: editName.trim(),
    //                   quantity: editQuantity.trim() || undefined,
    //                 }
    //               : item,
    //           ),
    //         }
    //       : aisle,
    //   ),
    // )

    setEditingItem(null)
    setEditName("")
    setEditQuantity("")
  }

  const cancelEdit = () => {
    setEditingItem(null)
    setEditName("")
    setEditQuantity("")
  }

  let totalItems = 0
  let completedItems = 0
  let aisles: Array<{ name: string; items: GroceryItem[] }> = []
  items.forEach((items, aisle) => {
    totalItems += items.length
    completedItems += items.filter((item) => item.completed).length
    aisles.push({ name: aisle, items })
  })

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
                  {completedItems} of {totalItems} items
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowAddForm(!showAddForm)}
                size="sm"
                className="bg-orange-600 hover:bg-orange-700"
              >
                <Plus className="w-4 h-4" />
              </Button>
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
                  width:
                    totalItems > 0
                      ? `${(completedItems / totalItems) * 100}%`
                      : "0%",
                }}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Add Item Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-3">Add New Item</h3>
            <div className="space-y-3">
              <div>
                <Input
                  placeholder="Item name"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Quantity (optional)"
                  value={newItemQuantity}
                  onChange={(e) => setNewItemQuantity(e.target.value)}
                  className="flex-1"
                />
                <select
                  value={selectedAisle}
                  onChange={(e) => setSelectedAisle(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                >
                  {GroceryIsle.literals.map((aisle) => (
                    <option key={aisle} value={aisle}>
                      {aisle}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={addItem}
                  className="flex-1 bg-orange-600 hover:bg-orange-700"
                >
                  Add Item
                </Button>
                <Button
                  onClick={() => setShowAddForm(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Grocery List by Aisle */}
        {aisles.map(({ name, items }) => {
          return (
            <div key={name}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
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
                      onChange={() => toggleItem(item)}
                      className="flex-shrink-0"
                    />

                    {editingItem === item.id ? (
                      // Edit mode
                      <div className="flex-1 space-y-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Item name"
                          className="text-sm"
                        />
                        <Input
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                          placeholder="Quantity (optional)"
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={() => saveEdit({})}
                            size="sm"
                            className="bg-orange-600 hover:bg-orange-700 text-xs px-2 py-1 h-7"
                          >
                            Save
                          </Button>
                          <Button
                            onClick={cancelEdit}
                            variant="outline"
                            size="sm"
                            className="text-xs px-2 py-1 h-7 bg-transparent"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Display mode
                      <>
                        <div
                          className="flex-1 min-w-0"
                          onDoubleClick={() => startEditing(item)}
                        >
                          <div
                            className={`${item.completed ? "line-through text-gray-500" : "text-gray-900"}`}
                          >
                            <span className="font-medium">{item.name}</span>
                            {item.quantity && (
                              <span className="text-sm text-gray-600 ml-2">
                                ({item.quantity})
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          onClick={() => startEditing(item)}
                          variant="ghost"
                          size="sm"
                          className="p-1 text-gray-400 hover:text-orange-500 flex-shrink-0"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </>
                    )}

                    {editingItem !== item.id && (
                      <Button
                        onClick={() => removeItem(item)}
                        variant="ghost"
                        size="sm"
                        className="p-1 text-gray-400 hover:text-red-500 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Empty State */}
        {totalItems === 0 && (
          <div className="text-center py-16">
            <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Your grocery list is empty
            </h3>
            <p className="text-gray-500 mb-6">
              Add items to start building your shopping list
            </p>
            <Button
              onClick={() => setShowAddForm(true)}
              className="bg-orange-600 hover:bg-orange-700 h-12 px-6"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add First Item
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
