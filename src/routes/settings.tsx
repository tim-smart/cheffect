import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { mealPlanWeekStart, openAiApiKey, Setting } from "@/Settings"
import { useAtomSet, useAtomSuspense } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { Settings } from "lucide-react"
import { useState } from "react"

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
  return (
    <div className="bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-orange-600" />
              <h1 className="text-lg font-bold text-gray-900">Settings</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-2 py-3 flex flex-col gap-4">
        <SettingSection title="API Settings">
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
        </SettingSection>

        <SettingSection title="Meal Plan">
          <SettingSelect setting={mealPlanWeekStart} options={weekDayOptions} />
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
    <div>
      <h2 className="text-md font-semibold text-gray-900 mb-1">{title}</h2>
      <div className="rounded-lg bg-white border border-gray-200 overflow-hidden p-3 flex flex-col gap-2">
        {children}
      </div>
    </div>
  )
}

function SettingControl<S extends Schema.Schema.AnyNoContext>({
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
      className="flex flex-col gap-1"
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

function SettingSelect<S extends Schema.Literal<any>>({
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
