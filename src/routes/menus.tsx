import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/menus")({
  component: RouteComponent,
})

function RouteComponent() {
  return <Outlet />
}
