import { Earth, Form, Image, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"
import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import { createRecipeAtom, extractRuntime, recipeFromImagesAtom } from "./atoms"
import { useContext, useId, useRef, useState, type Ref } from "react"
import { router } from "@/Router"

export function AddRecipeButton({ small = false }: { small?: boolean }) {
  const registry = useContext<AtomRegistry>(RegistryContext)
  const canExtract = AsyncResult.isSuccess(useAtomValue(extractRuntime))
  const createFromImage = useAtomSet(recipeFromImagesAtom)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [urlOpen, setUrlOpen] = useState(false)
  // The dialog opens from a menu item that unmounts as the menu closes, so
  // focus is handed back to the trigger explicitly
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <AddRecipeTrigger small={small} ref={triggerRef} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {canExtract && (
            <>
              <DropdownMenuItem onSelect={() => setUrlOpen(true)}>
                <Earth />
                From URL
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  fileInputRef.current!.value = ""
                  fileInputRef.current!.click()
                }}
              >
                <Image />
                From images
              </DropdownMenuItem>
            </>
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
      <AddFromUrlDialog
        open={urlOpen}
        onOpenChange={setUrlOpen}
        onClose={() => triggerRef.current?.focus()}
        onSubmit={(url) => {
          registry.set(createRecipeAtom, url)
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,android/allowCamera"
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) {
            createFromImage(files)
          }
        }}
      />
    </>
  )
}

const AddRecipeTrigger = function ({
  small,
  ref,
  ...rest
}: {
  small: boolean
  ref: Ref<HTMLButtonElement>
}) {
  if (small) {
    return (
      <Button
        size="sm"
        ref={ref}
        aria-label="Add recipe"
        className="bg-primary hover:bg-primary/90 size-10 rounded-full shadow-none [&_svg]:transition-transform [&_svg]:duration-300 [&_svg]:ease-spring motion-safe:[&[data-state=open]_svg]:rotate-45"
        {...rest}
      >
        <Plus />
      </Button>
    )
  }
  return (
    <Button
      ref={ref}
      className="bg-primary hover:bg-primary/90 h-12 px-6 rounded-full shadow-none [&_svg]:transition-transform [&_svg]:duration-300 [&_svg]:ease-spring motion-safe:[&[data-state=open]_svg]:rotate-45"
      {...rest}
    >
      <Plus />
      Add Recipe
    </Button>
  )
}

const urlHint = "Enter a web address, like https://example.com/recipe"
const urlInvalid = "That doesn't look like a web address."

// Accepts an address with or without its scheme; anything that isn't a web
// page is rejected before it reaches the extractor.
export const parseRecipeUrl = (input: string): string | null => {
  const trimmed = input.trim()
  if (trimmed === "") return null
  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`,
    )
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!url.hostname.includes(".")) return null
    return url.href
  } catch {
    return null
  }
}

function AddFromUrlDialog({
  open,
  onOpenChange,
  onClose,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onClose: () => void
  onSubmit: (url: string) => void
}) {
  const [value, setValue] = useState("")
  const [invalid, setInvalid] = useState(false)
  const inputId = useId()
  const hintId = useId()
  const close = () => {
    onOpenChange(false)
    setValue("")
    setInvalid(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true)
        else close()
      }}
    >
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-sm rounded-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onClose()
        }}
      >
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            const url = parseRecipeUrl(value)
            if (url === null) {
              setInvalid(true)
              return
            }
            onSubmit(url)
            close()
          }}
        >
          <DialogHeader className="text-left">
            <DialogTitle className="font-display text-[22px] font-medium tracking-tight">
              Add from a link
            </DialogTitle>
            <DialogDescription>
              Paste the address of a recipe page and Cheffect will read it for
              you.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>Recipe link</Label>
            <Input
              id={inputId}
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              placeholder="https://"
              value={value}
              aria-invalid={invalid || undefined}
              aria-describedby={hintId}
              // The field marks itself with the invalid ring and a nudge, so
              // the layout never shifts; the words go to screen readers
              className={invalid ? "motion-safe:animate-nudge" : undefined}
              onChange={(event) => {
                setValue(event.target.value)
                setInvalid(false)
              }}
            />
            <p id={hintId} className="sr-only" aria-live="polite">
              {invalid ? `${urlInvalid} ${urlHint}` : urlHint}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Add recipe</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
