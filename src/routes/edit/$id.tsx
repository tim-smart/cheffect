import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/edit/$id")({
  component: ProductScreen,
})

function ProductScreen() {
  const { id } = Route.useParams()
  return <div>Hello {id}!</div>
}
