import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { clearAiMemoryAtom } from "@/AiChat/runtime"
import { SyncSettings } from "@/Sync/SyncSettings"
import { importPaprikaAtom } from "@/Recipes/atoms"
import {
  aiChatModel,
  aiCountry,
  mealPlanWeekStart,
  openAiApiKey,
  openAiApiUrl,
  Setting,
  exportAllAtom,
  importAllAtom,
  openAiModel,
} from "@/Settings"
import { useAtom, useAtomSet, useAtomSuspense } from "@effect/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import {
  CommandList,
  CommandInput,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  Command,
} from "@/components/ui/command"
import { Schema } from "effect"
import type * as SchemaAST from "effect/SchemaAST"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  Import,
  MoreVertical,
  Share,
} from "lucide-react"
import { useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { countries } from "country-data-list"

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
})

const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]
const weekDayOptions = days.map((day, index) => ({
  label: day,
  value: index.toString(),
}))

function SettingsPage() {
  const exportAllData = useAtomSet(exportAllAtom)
  const [importAllResult, importAllData] = useAtom(importAllAtom)
  const importAllRef = useRef<HTMLInputElement>(null)
  // The picked file waits here until the import is confirmed. It stays set
  // after closing so the dialog keeps its text while it fades out.
  const [importAllFile, setImportAllFile] = useState<File>()
  const [confirmImportAll, setConfirmImportAll] = useState(false)

  const importPaprika = useAtomSet(importPaprikaAtom)
  const importPaprikaRef = useRef<HTMLInputElement>(null)

  const clearMemory = useAtomSet(clearAiMemoryAtom)

  return (
    <div className="pb-content">
      {/* Header */}
      <header className="bg-background sticky top-bar-offset z-10">
        <div className="page-wide pt-3 pb-3 md:pt-6">
          <div className="flex items-center justify-between md:min-h-11">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[26px] md:text-[32px] md:leading-none font-medium tracking-tight">
                Settings
              </h1>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="p-2">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    exportAllData()
                  }}
                >
                  <Share />
                  Export all data
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={importAllResult.waiting}
                  onClick={() => {
                    importAllRef.current?.click()
                  }}
                >
                  <Import />
                  Import all data
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    importPaprikaRef.current?.click()
                  }}
                >
                  <Import />
                  Import from Paprika
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={importAllRef}
              type="file"
              className="hidden"
              accept="text/plain"
              onChange={(e) => {
                const file = e.target.files?.[0]
                // Cleared so picking the same file again imports it again.
                e.target.value = ""
                if (!file) return
                setImportAllFile(file)
                setConfirmImportAll(true)
              }}
            />
            <AlertDialog
              open={confirmImportAll}
              onOpenChange={setConfirmImportAll}
            >
              <AlertDialogContent className="sm:max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle>Import all data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Recipes, meal plans, menus and groceries from{" "}
                    <span className="font-medium text-foreground break-words">
                      {importAllFile?.name}
                    </span>{" "}
                    are merged into this device. Your settings and grocery
                    aisles are replaced by the ones in the file. Anything
                    deleted since the export doesn't come back.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      if (importAllFile) importAllData(importAllFile)
                    }}
                  >
                    Import and replace settings
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <input
              ref={importPaprikaRef}
              type="file"
              className="hidden"
              accept=".paprikarecipes,.paprikarecipe"
              onChange={(e) => {
                const file = e.target.files?.[0]
                // Cleared so picking the same file again imports it again.
                e.target.value = ""
                if (!file) return
                importPaprika(file)
              }}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="page-wide py-2 flex flex-col gap-6 md:gap-10 md:py-4">
        <SettingSection title="AI Settings">
          <SettingControl
            setting={openAiApiKey}
            render={({ value, onChange, onBlur, onKeyDown }) => (
              <Input
                id={openAiApiKey.name}
                type="password"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => onBlur()}
                onKeyDown={onKeyDown}
              />
            )}
          />
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:underline -mt-2"
          >
            Create an OpenAI API key
          </a>
          <SettingControl
            setting={openAiApiUrl}
            render={({ value, onChange, onBlur, onKeyDown }) => (
              <Input
                id={openAiApiUrl.name}
                type="url"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => onBlur()}
                onKeyDown={onKeyDown}
              />
            )}
          />
          <SettingControl
            setting={aiChatModel}
            render={({ value, onChange, onBlur, onKeyDown }) => (
              <Input
                id={aiChatModel.name}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => onBlur()}
                onKeyDown={onKeyDown}
              />
            )}
          />
          <SettingControl
            setting={openAiModel}
            render={({ value, onChange, onBlur, onKeyDown }) => (
              <Input
                id={openAiModel.name}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => onBlur()}
                onKeyDown={onKeyDown}
              />
            )}
          />
          <SettingCombobox setting={aiCountry} options={countryOptions} />
          <Button
            type="button"
            variant="secondary"
            className="mr-auto"
            onClick={() => {
              if (
                !confirm(
                  "Are you sure you want to clear AI memory? It will forget all previous learnings like allergies and preferences.",
                )
              ) {
                return
              }
              clearMemory()
            }}
          >
            Reset memory
          </Button>
        </SettingSection>

        <SettingSection title="Meal Plan">
          <SettingSelect setting={mealPlanWeekStart} options={weekDayOptions} />
        </SettingSection>

        <SettingSection title="Sync">
          <SyncSettings />
        </SettingSection>
      </main>
    </div>
  )
}

function SettingSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    // On desktops the section's name sits in a column beside its controls
    <div className="md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:gap-x-8">
      <h2 className="font-display text-[22px] font-medium tracking-tight mb-2 md:mb-0 md:pt-4">
        {title}
      </h2>
      <div className="rounded-xl bg-card overflow-hidden p-4 md:p-6 md:max-w-2xl flex flex-col gap-4">
        {children}
      </div>
    </div>
  )
}

function SettingControl<S extends Schema.Codec<any, any>>({
  setting,
  render,
}: {
  setting: Setting<S>
  render: (options: {
    value: string
    onChange: (newValue: string) => void
    onBlur: (newValue?: string) => void
    onKeyDown: (e: React.KeyboardEvent) => void
  }) => React.ReactNode
}) {
  const decoded = useAtomSuspense(setting.atom).value
  const setDecoded = useAtomSet(setting.atom)
  const [value, setValue] = useState(() =>
    Schema.encodeSync(setting.schemaInput)(decoded),
  )

  const onBlur = (newValue?: string) => {
    if (newValue !== undefined) {
      setValue(newValue)
    }
    const parsed = Schema.decodeSync(setting.schemaInput)(newValue ?? value)
    setDecoded(parsed)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onBlur()
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onBlur()
      }}
    >
      <Label htmlFor={setting.name}>{setting.label}</Label>
      {render({ value, onChange: setValue, onBlur, onKeyDown })}
    </form>
  )
}

function SettingSelect<
  S extends Schema.Literals<ReadonlyArray<SchemaAST.LiteralValue>>,
>({
  setting,
  options,
}: {
  setting: Setting<S>
  options: { label: string; value: string }[]
}) {
  return (
    <SettingControl
      setting={setting}
      render={({ value, onBlur }) => (
        <Select value={value} onValueChange={onBlur}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent id={setting.name}>
            <SelectGroup>
              {options.map(({ label, value }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    />
  )
}

function SettingCombobox<S extends Schema.Codec<any, any>>({
  setting,
  options,
}: {
  setting: Setting<S>
  options: { label: string; value: string }[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <SettingControl
      setting={setting}
      render={({ value, onBlur }) => {
        const selected = options.find((opt) => opt.value === value)
        return (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between dark:bg-input/30"
              >
                {selected ? selected.label : `Select ${setting.label}...`}
                <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="p-0 min-w-[--radix-popper-anchor-width]"
              align="start"
            >
              <Command>
                <CommandInput placeholder="Search framework..." />
                <CommandList>
                  <CommandEmpty>None found.</CommandEmpty>
                  <CommandGroup>
                    {options.map((framework) => (
                      <CommandItem
                        key={framework.value}
                        value={framework.value}
                        onSelect={(currentValue: string) => {
                          onBlur(currentValue === value ? "" : currentValue)
                          setOpen(false)
                        }}
                      >
                        <CheckIcon
                          className={cn(
                            "mr-2 h-4 w-4",
                            value === framework.value
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        {framework.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )
      }}
    />
  )
}

const countryOptions = countries.all
  .filter(
    (country) =>
      country.emoji && country.status !== "deleted" && country.ioc !== "PRK",
  )
  .map((country) => ({
    label: `${country.emoji} ${country.name}`,
    value: country.name,
  }))
