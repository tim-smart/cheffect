import { makeQueryRx } from "@/livestore/rx"
import { tables } from "@/livestore/schema"
import { useRxSuspense } from "@effect-rx/rx-react"
import { queryDb } from "@livestore/livestore"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"

export const Route = createFileRoute("/edit/$id")({
  component: ProductScreen,
})

function ProductScreen() {
  const { id } = Route.useParams()
  const queryRx = useMemo(
    () => makeQueryRx(queryDb(tables.recipes.where("id", "=", id).first())),
    [id],
  )
  const recipe = useRxSuspense(queryRx).value
  return <div>Hello {recipe.title}!</div>
}
