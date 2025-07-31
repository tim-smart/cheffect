import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRx } from "@effect-rx/rx-react"
import { createRecipeRx } from "@/Recipes/rx"

export function AddRecipeButton({ small = false }: { small?: boolean }) {
  const [result, create] = useRx(createRecipeRx)
  const onClick = () => {
    const url = prompt("Enter recipe URL:")
    if (!url) return
    create(url)
  }
  if (small) {
    return (
      <Button
        size="sm"
        className="bg-orange-600 hover:bg-orange-700 h-9 px-3"
        onClick={onClick}
        disabled={result.waiting}
      >
        <Plus className="w-4 h-4" />
      </Button>
    )
  }
  return (
    <Button
      className="bg-orange-600 hover:bg-orange-700 h-12 px-6"
      onClick={onClick}
      disabled={result.waiting}
    >
      <Plus className="w-5 h-5 mr-2" />
      {result.waiting ? "Adding..." : "Add Recipe"}
    </Button>
  )
}
