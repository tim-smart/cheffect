import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import {
  Search,
  Clock,
  Users,
  ChefHat,
  ShoppingCart,
  Settings,
  Plus,
  Star,
  Filter,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { useQuery } from "@livestore/react"
import { allRecipes$ } from "@/livestore/queries"
import { Rx, useRx, useRxSet, useRxValue } from "@effect-rx/rx-react"
import * as Duration from "effect/Duration"
import { createRecipeRx } from "@/services/Ai"

export const Route = createFileRoute("/")({
  component: CheffectHome,
})

export default function CheffectHome() {
  const recipes = useQuery(allRecipes$)

  const [activeTab, setActiveTab] = useState("home")

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Mobile Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ChefHat className="w-7 h-7 text-orange-600" />
              <h1 className="text-xl font-bold text-gray-900">Cheffect</h1>
            </div>
            <Button
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 h-9 px-3"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 py-4">
        {activeTab === "home" && (
          <>
            {/* Search Bar */}
            <div className="mb-4">
              <SearchInput />
            </div>

            {/* Recipe Count */}
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                My Recipes ({recipes.length})
              </h2>
            </div>

            {/* Recipe List - Mobile Optimized */}
            <div className="space-y-4">
              {recipes.map((recipe) => (
                <Card
                  key={recipe.id}
                  className="overflow-hidden active:scale-[0.98] transition-transform"
                >
                  <div className="flex">
                    {/* Recipe Image */}
                    <div className="relative w-24 h-24 flex-shrink-0">
                      <img
                        src="/placeholder.svg"
                        alt={recipe.title}
                        width={96}
                        height={96}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Recipe Info */}
                    <CardContent className="flex-1 p-3">
                      <h3 className="font-semibold text-base mb-2 line-clamp-1 pr-2">
                        {recipe.title}
                      </h3>

                      <div className="flex items-center gap-3 text-sm text-gray-600 mb-2">
                        {recipe.cookingTime && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span className="text-xs">
                              {Duration.format(recipe.cookingTime)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          <span className="text-xs">{recipe.servings}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          <span className="text-xs">{recipe.rating}</span>
                        </div>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              ))}
            </div>

            {recipes.length === 0 && <NoResults />}
          </>
        )}

        {activeTab === "grocery" && (
          <div className="text-center py-16">
            <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Grocery List
            </h3>
            <p className="text-gray-500">This section will be designed next</p>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="text-center py-16">
            <Settings className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Settings</h3>
            <p className="text-gray-500">This section will be designed next</p>
          </div>
        )}
      </main>

      {/* Bottom Navigation - Mobile First */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 safe-area-pb">
        <div className="flex justify-around">
          <button
            onClick={() => setActiveTab("home")}
            className={`flex flex-col items-center py-2 px-4 rounded-lg transition-colors ${
              activeTab === "home"
                ? "text-orange-600 bg-orange-50"
                : "text-gray-500 active:bg-gray-100"
            }`}
          >
            <ChefHat className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Recipes</span>
          </button>

          <button
            onClick={() => setActiveTab("grocery")}
            className={`flex flex-col items-center py-2 px-4 rounded-lg transition-colors ${
              activeTab === "grocery"
                ? "text-orange-600 bg-orange-50"
                : "text-gray-500 active:bg-gray-100"
            }`}
          >
            <ShoppingCart className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Grocery</span>
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`flex flex-col items-center py-2 px-4 rounded-lg transition-colors ${
              activeTab === "settings"
                ? "text-orange-600 bg-orange-50"
                : "text-gray-500 active:bg-gray-100"
            }`}
          >
            <Settings className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Settings</span>
          </button>
        </div>
      </nav>
    </div>
  )
}

const searchQueryRx = Rx.make("")

function SearchInput() {
  const [searchQuery, setSearchQuery] = useRx(searchQueryRx)

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder="Search recipes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-11"
        />
      </div>
      <Button variant="outline" size="sm" className="h-11 px-3 bg-transparent">
        <Filter className="w-4 h-4" />
      </Button>
    </div>
  )
}

function NoResults() {
  const searchQuery = useRxValue(searchQueryRx)
  return (
    <div className="text-center py-16">
      <ChefHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        No recipes found
      </h3>
      <p className="text-gray-500 mb-6 px-4">
        {searchQuery
          ? "Try adjusting your search terms"
          : "Start by adding your first recipe"}
      </p>
      <AddRecipeButton />
    </div>
  )
}

function AddRecipeButton() {
  const create = useRxSet(createRecipeRx)
  const onClick = () => {
    const url = prompt("Enter recipe URL:")
    if (!url) return
    create(url)
  }
  return (
    <Button
      className="bg-orange-600 hover:bg-orange-700 h-12 px-6"
      onClick={onClick}
    >
      <Plus className="w-5 h-5 mr-2" />
      Add Recipe
    </Button>
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
