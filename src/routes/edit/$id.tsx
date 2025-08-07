import { makeQueryAtom } from "@/livestore/atoms"
import { tables } from "@/livestore/schema"
import { useAtomSuspense } from "@effect-atom/atom-react"
import { queryDb } from "@livestore/livestore"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"

export const Route = createFileRoute("/edit/$id")({
  component: ProductScreen,
})

function ProductScreen() {
  const { id } = Route.useParams()
  const queryAtom = useMemo(
    () => makeQueryAtom(queryDb(tables.recipes.where("id", "=", id).first())),
    [id],
  )
  const recipe = useAtomSuspense(queryAtom).value
  return <div>Hello {recipe.title}!</div>
}
