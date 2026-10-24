import { AiChatModal } from "@/AiChat"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
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
import { useEffect, useState, type ReactNode } from "react"

const tabs = [
  { to: "/", label: "Recipes", icon: ChefHat },
  { to: "/groceries", label: "Grocery", icon: ShoppingCart },
  { to: "/plan", label: "Meal Plan", icon: Calendar },
  { to: "/menus", label: "Menus", icon: BookOpen },
] as const

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

    // `/recipes/:id` keeps the Recipes link active without matching its path
    const activeProps = { className: "text-primary" }
    const inactivePropsFor = (to: string) =>
      to === "/" && onRecipePage
        ? {
            className: "text-primary",
            "aria-current": "page" as const,
            "data-status": "active",
          }
        : { className: "text-muted-foreground active:text-foreground" }

    return (
      <div>
        {/* Top bar. On phones: the wordmark and two actions. On desktops the
            tab bar's links move up here, set in the display face like the
            running heads of a cookbook, and the bar stays while pages scroll */}
        <header className="bg-background sticky top-0 z-10">
          <div className="page-wide py-3 md:h-16 md:py-0">
            <div className="flex h-full items-center justify-between gap-6">
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

              <nav
                aria-label="Primary"
                className="hidden md:flex items-center gap-0.5 lg:gap-1 flex-1 ml-2 lg:ml-4"
              >
                {tabs.map(({ to, label }) => (
                  <TopLink
                    key={to}
                    to={to}
                    active={to === "/" ? onRecipePage : undefined}
                  >
                    {label}
                  </TopLink>
                ))}
              </nav>

              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  className="p-2 md:size-10 md:rounded-full"
                  aria-label="Settings"
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

        {/* Bottom tab bar, phones only */}
        <nav
          className={cn(
            "fixed bottom-0 left-0 right-0 bg-card border-t border-border px-2 pt-1 nav-pb md:hidden",
            navigated && "nav-animated",
          )}
        >
          <div className="flex justify-around">
            {tabs.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex flex-col items-center gap-1 py-2 px-4 transition-colors"
                activeProps={activeProps}
                inactiveProps={inactivePropsFor(to)}
              >
                <Icon className="w-6 h-6" strokeWidth={1.75} />
                <span className="text-xs font-semibold">{label}</span>
              </Link>
            ))}
          </div>
        </nav>
      </div>
    )
  },
})

// A top-bar link: the display face, muted until it's the current page, which
// sits on a quiet pill. `active` forces the state for pages that belong to a
// tab without sharing its path.
function TopLink({
  to,
  active,
  children,
}: {
  to: (typeof tabs)[number]["to"]
  active?: boolean | undefined
  children: ReactNode
}) {
  const className =
    "inline-flex h-9 items-center rounded-full px-3 lg:px-3.5 font-display text-[17px] font-medium tracking-tight whitespace-nowrap transition-colors"
  return (
    <Link
      to={to}
      className={className}
      activeProps={{ className: "bg-muted text-foreground" }}
      inactiveProps={
        active
          ? {
              className: "bg-muted text-foreground",
              "aria-current": "page",
              "data-status": "active",
            }
          : {
              className:
                "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            }
      }
    >
      {children}
    </Link>
  )
}
