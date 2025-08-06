import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useRxSet } from "@effect-rx/rx-react"
import { createRecipeRx } from "./rx"

export function AddRecipeButton({ small = false }: { small?: boolean }) {
  const createRecipe = useRxSet(createRecipeRx)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <AddRecipeTrigger small={small} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onClick={() => {
            const url = prompt("Enter recipe URL:")
            if (!url) return
            createRecipe(url)
          }}
        >
          From URL
        </DropdownMenuItem>
        <DropdownMenuItem>From scratch</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const AddRecipeTrigger = function ({ small, ...rest }: { small: boolean }) {
  if (small) {
    return (
      <Button
        size="sm"
        className="cursor-pointer bg-orange-600 hover:bg-orange-700 h-9 px-3"
        {...rest}
      >
        <Plus className="w-4 h-4" />
      </Button>
    )
  }
  return (
    <Button
      className="cursor-pointer bg-orange-600 hover:bg-orange-700 h-12 px-6"
      {...rest}
    >
      <Plus className="w-5 h-5 mr-2" />
      Add Recipe
    </Button>
  )
}
