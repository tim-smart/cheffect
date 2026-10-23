import { AiChatModal } from "@/AiChat"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { AddRecipeButton } from "@/Recipes/AddRecipeButton"
import { router } from "@/Router"
import {
  createRootRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router"
import {
  BookOpen,
  Calendar,
  ChefHat,
  Settings,
  ShoppingCart,
} from "lucide-react"
import { useEffect, useState } from "react"

export const Route = createRootRoute({
  component: () => {
    // Recipe pages belong to the Recipes tab, so it stays active rather than
    // fading out when a recipe opens. Reads the same location as `Link`, so
    // both update in the same render.
    const onRecipePage = useLocation({
      select: (location) => /^\/(recipes|edit)\//.test(location.pathname),
    })
    const pathname = useLocation({ select: (location) => location.pathname })
    // The tab icon hops on navigation, not on the first paint
    const [initialPath] = useState(pathname)
    const [navigated, setNavigated] = useState(false)
    useEffect(() => {
      if (pathname !== initialPath) setNavigated(true)
    }, [pathname, initialPath])
    return (
      <div>
        <header className="bg-background sticky top-0 z-10">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <button
                className="group flex items-center gap-2 cursor-pointer"
                type="button"
                onClick={() => {
                  router.navigate({ to: "/" })
                }}
              >
                <ChefHat
                  className="w-6 h-6 text-primary cursor-pointer origin-bottom motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-spring motion-safe:group-hover:-rotate-12 motion-safe:group-active:-rotate-12"
                  strokeWidth={1.75}
                />
                <h1 className="font-display text-2xl font-semibold leading-none tracking-tight">
                  Cheffect
                </h1>
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
          {/* Each screen fades in; opacity only, so scroll restoration and
              the sticky headers are untouched */}
          <div
            key={pathname}
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
          >
            <Outlet />
          </div>
          <AiChatModal />
          <Toaster toastOptions={{ style: { bottom: "4rem" } }} />
        </main>

        {/* Bottom Navigation - Mobile First */}
        <nav
          className={`fixed bottom-0 left-0 right-0 bg-card border-t border-border px-2 pt-1 nav-pb ${navigated ? "nav-animated" : ""}`}
        >
          <div className="flex justify-around">
            <Link
              to="/"
              className="flex flex-col items-center gap-1 py-2 px-4 transition-colors"
              activeProps={{ className: "text-primary" }}
              inactiveProps={
                onRecipePage
                  ? {
                      className: "text-primary",
                      "aria-current": "page",
                      "data-status": "active",
                    }
                  : {
                      className: "text-muted-foreground active:text-foreground",
                    }
              }
            >
              <ChefHat className="w-6 h-6" strokeWidth={1.75} />
              <span className="text-xs font-semibold">Recipes</span>
            </Link>

            <Link
              to="/groceries"
              className="flex flex-col items-center gap-1 py-2 px-4 transition-colors"
              activeProps={{ className: "text-primary" }}
              inactiveProps={{
                className: "text-muted-foreground active:text-foreground",
              }}
            >
              <ShoppingCart className="w-6 h-6" strokeWidth={1.75} />
              <span className="text-xs font-semibold">Grocery</span>
            </Link>

            <Link
              to="/plan"
              className="flex flex-col items-center gap-1 py-2 px-4 transition-colors"
              activeProps={{ className: "text-primary" }}
              inactiveProps={{
                className: "text-muted-foreground active:text-foreground",
              }}
            >
              <Calendar className="w-6 h-6" strokeWidth={1.75} />
              <span className="text-xs font-semibold">Meal Plan</span>
            </Link>

            <Link
              to="/menus"
              className="flex flex-col items-center gap-1 py-2 px-4 transition-colors"
              activeProps={{ className: "text-primary" }}
              inactiveProps={{
                className: "text-muted-foreground active:text-foreground",
              }}
            >
              <BookOpen className="w-6 h-6" strokeWidth={1.75} />
              <span className="text-xs font-semibold">Menus</span>
            </Link>
          </div>
        </nav>
      </div>
    )
  },
})
