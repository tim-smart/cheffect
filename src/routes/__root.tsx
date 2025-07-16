import { createRootRoute, Outlet } from "@tanstack/react-router"

export const Route = createRootRoute({
  component: () => (
    <div className="container mx-auto max-w-7xl">
      <Outlet />
    </div>
  ),
})
