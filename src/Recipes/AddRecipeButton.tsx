import { Earth, Form, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RegistryContext, Result, useAtomValue } from "@effect-atom/atom-react"
import { createRecipeAtom, extractRuntime } from "./atoms"
import { useContext } from "react"
import { router } from "@/Router"

export function AddRecipeButton({ small = false }: { small?: boolean }) {
  const registry = useContext(RegistryContext)
  const canExtract = Result.isSuccess(useAtomValue(extractRuntime))
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <AddRecipeTrigger small={small} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {canExtract && (
          <DropdownMenuItem
            onClick={() => {
              const url = prompt("Enter recipe URL:")
              if (!url) return
              registry.set(createRecipeAtom, url)
            }}
          >
            <Earth />
            From URL
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => {
            router.navigate({ to: "/add" })
          }}
        >
          <Form />
          From scratch
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const AddRecipeTrigger = function ({ small, ...rest }: { small: boolean }) {
  if (small) {
    return (
      <Button
        size="sm"
        className="bg-primary hover:bg-orange-700 h-9 px-3"
        {...rest}
      >
        <Plus />
      </Button>
    )
  }
  return (
    <Button className="bg-primary hover:bg-orange-700 h-12 px-6" {...rest}>
      <Plus />
      Add Recipe
    </Button>
  )
}