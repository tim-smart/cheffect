import { AddRecipeButton } from "@/Recipes/AddRecipeButton"
import { router } from "@/Router"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { ChefHat, Settings, ShoppingCart } from "lucide-react"
import { useState } from "react"

export const Route = createRootRoute({
  component: () => {
    const [activeTab, setActiveTab] = useState("home")
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* Mobile Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between">
              <button
                className="flex items-center gap-3 cursor-pointer"
                type="button"
                onClick={() => {
                  router.navigate({ to: "/" })
                }}
              >
                <ChefHat className="w-7 h-7 text-orange-600 cursor-pointer" />
                <h1 className="text-xl font-bold text-gray-900">Cheffect</h1>
              </button>
              <AddRecipeButton small />
            </div>
          </div>
        </header>

        <main>
          <Outlet />
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
  },
})
