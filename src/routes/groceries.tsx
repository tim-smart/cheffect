import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { Plus, X, ShoppingCart, Check, MoreVertical, Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export const Route = createFileRoute("/groceries")({
  component: GroceryList,
})

type GroceryItem = {
  id: string
  name: string
  quantity?: string
  completed: boolean
}

type GroceryAisle = {
  name: string
  items: GroceryItem[]
}

const initialGroceryList: GroceryAisle[] = [
  {
    name: "Produce",
    items: [
      { id: "1", name: "Fresh basil", quantity: "1 bunch", completed: false },
      { id: "2", name: "Tomatoes", quantity: "4 large", completed: true },
      { id: "3", name: "Onions", quantity: "2 medium", completed: false },
      { id: "4", name: "Garlic", quantity: "1 bulb", completed: false },
    ],
  },
  {
    name: "Dairy",
    items: [
      { id: "5", name: "Heavy cream", quantity: "1 cup", completed: false },
      { id: "6", name: "Parmesan cheese", quantity: "200g", completed: false },
      { id: "7", name: "Butter", quantity: "1 stick", completed: true },
    ],
  },
  {
    name: "Pantry",
    items: [
      { id: "8", name: "Spaghetti", quantity: "500g", completed: false },
      { id: "9", name: "Olive oil", quantity: "1 bottle", completed: true },
      { id: "10", name: "Salt", quantity: "1 container", completed: false },
      { id: "11", name: "Black pepper", completed: false },
    ],
  },
  {
    name: "Meat & Seafood",
    items: [
      { id: "12", name: "Chicken breast", quantity: "1 lb", completed: false },
    ],
  },
]

export default function GroceryList() {
  const [groceryList, setGroceryList] =
    useState<GroceryAisle[]>(initialGroceryList)
  const [newItemName, setNewItemName] = useState("")
  const [newItemQuantity, setNewItemQuantity] = useState("")
  const [selectedAisle, setSelectedAisle] = useState("Produce")
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editQuantity, setEditQuantity] = useState("")

  const toggleItem = (aisleIndex: number, itemId: string) => {
    setGroceryList((prev) =>
      prev.map((aisle, i) =>
        i === aisleIndex
          ? {
              ...aisle,
              items: aisle.items.map((item) =>
                item.id === itemId
                  ? { ...item, completed: !item.completed }
                  : item,
              ),
            }
          : aisle,
      ),
    )
  }

  const removeItem = (aisleIndex: number, itemId: string) => {
    setGroceryList((prev) =>
      prev.map((aisle, i) =>
        i === aisleIndex
          ? {
              ...aisle,
              items: aisle.items.filter((item) => item.id !== itemId),
            }
          : aisle,
      ),
    )
  }

  const addItem = () => {
    if (!newItemName.trim()) return

    const aisleIndex = groceryList.findIndex(
      (aisle) => aisle.name === selectedAisle,
    )
    if (aisleIndex === -1) return

    const newItem: GroceryItem = {
      id: Date.now().toString(),
      name: newItemName.trim(),
      quantity: newItemQuantity.trim() || undefined,
      completed: false,
    }

    setGroceryList((prev) =>
      prev.map((aisle, i) =>
        i === aisleIndex
          ? {
              ...aisle,
              items: [...aisle.items, newItem],
            }
          : aisle,
      ),
    )

    setNewItemName("")
    setNewItemQuantity("")
    setShowAddForm(false)
  }

  const clearCompleted = () => {
    setGroceryList((prev) =>
      prev.map((aisle) => ({
        ...aisle,
        items: aisle.items.filter((item) => !item.completed),
      })),
    )
  }

  const startEditing = (item: GroceryItem) => {
    setEditingItem(item.id)
    setEditName(item.name)
    setEditQuantity(item.quantity || "")
  }

  const saveEdit = (aisleIndex: number, itemId: string) => {
    if (!editName.trim()) return

    setGroceryList((prev) =>
      prev.map((aisle, i) =>
        i === aisleIndex
          ? {
              ...aisle,
              items: aisle.items.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      name: editName.trim(),
                      quantity: editQuantity.trim() || undefined,
                    }
                  : item,
              ),
            }
          : aisle,
      ),
    )

    setEditingItem(null)
    setEditName("")
    setEditQuantity("")
  }

  const cancelEdit = () => {
    setEditingItem(null)
    setEditName("")
    setEditQuantity("")
  }

  const totalItems = groceryList.reduce(
    (total, aisle) => total + aisle.items.length,
    0,
  )
  const completedItems = groceryList.reduce(
    (total, aisle) =>
      total + aisle.items.filter((item) => item.completed).length,
    0,
  )

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
                  {groceryList.map((aisle) => (
                    <option key={aisle.name} value={aisle.name}>
                      {aisle.name}
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
        {groceryList.map((aisle, aisleIndex) => {
          const aisleCompletedItems = aisle.items.filter(
            (item) => item.completed,
          ).length
          const aisleProgress =
            aisle.items.length > 0
              ? (aisleCompletedItems / aisle.items.length) * 100
              : 0

          return (
            <div key={aisle.name}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  {aisle.name}
                </h2>
                <Badge variant="secondary" className="text-xs">
                  {aisleCompletedItems}/{aisle.items.length}
                </Badge>
              </div>

              {aisle.items.length > 0 ? (
                <div className="bg-white rounded-lg overflow-hidden divide-y divide-gray-200 border border-gray-200">
                  {aisle.items.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 transition-colors ${
                        item.completed ? "bg-gray-50" : "active:bg-gray-50"
                      }`}
                    >
                      <Checkbox
                        checked={item.completed}
                        onChange={() => toggleItem(aisleIndex, item.id)}
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
                              onClick={() => saveEdit(aisleIndex, item.id)}
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
                          onClick={() => removeItem(aisleIndex, item.id)}
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
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
                  <p className="text-gray-500 text-sm">
                    No items in this aisle
                  </p>
                </div>
              )}
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
