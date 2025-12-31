import { AiChatModal } from "@/AiChat"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { AddRecipeButton } from "@/Recipes/AddRecipeButton"
import { router } from "@/Router"
import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import {
  BookOpen,
  Calendar,
  ChefHat,
  Settings,
  ShoppingCart,
} from "lucide-react"

export const Route = createRootRoute({
  component: () => {
    return (
      <div>
        <header className="bg-background border-b border-border sticky top-0 z-10">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <button
                className="flex items-center gap-3 cursor-pointer"
                type="button"
                onClick={() => {
                  router.navigate({ to: "/" })
                }}
              >
                <ChefHat className="w-7 h-7 text-primary cursor-pointer" />
                <h1 className="text-xl font-bold">Cheffect</h1>
              </button>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  className="p-2"
                  onClick={() => {
                    router.navigate({ to: "/settings" })
                  }}
                >
                  <Settings />
                </Button>
                <AddRecipeButton small />
              </div>
            </div>
          </div>
        </header>

        <main>
          <Outlet />
          <AiChatModal />
          <Toaster toastOptions={{ style: { bottom: "4rem" } }} />
        </main>

        {/* Bottom Navigation - Mobile First */}
        <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border px-4 py-2 nav-pb">
          <div className="flex justify-around">
            <Link
              to="/"
              className="flex flex-col items-center py-2 px-4 rounded-lg transition-colors"
              activeProps={{ className: "text-primary bg-primary-muted" }}
              inactiveProps={{
                className: "text-muted-foreground active:bg-muted",
              }}
            >
              <ChefHat className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Recipes</span>
            </Link>

            <Link
              to="/groceries"
              className="flex flex-col items-center py-2 px-4 rounded-lg transition-colors"
              activeProps={{ className: "text-primary bg-primary-muted" }}
              inactiveProps={{
                className: "text-muted-foreground active:bg-muted",
              }}
            >
              <ShoppingCart className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Grocery</span>
            </Link>

            <Link
              to="/plan"
              className="flex flex-col items-center py-2 px-4 rounded-lg transition-colors"
              activeProps={{ className: "text-primary bg-primary-muted" }}
              inactiveProps={{
                className: "text-muted-foreground active:bg-muted",
              }}
            >
              <Calendar className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Meal Plan</span>
            </Link>

            <Link
              to="/menus"
              className="flex flex-col items-center py-2 px-4 rounded-lg transition-colors"
              activeProps={{ className: "text-primary bg-primary-muted" }}
              inactiveProps={{
                className: "text-muted-foreground active:bg-muted",
              }}
            >
              <BookOpen className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">Menus</span>
            </Link>
          </div>
        </nav>
      </div>
    )
  },
})
