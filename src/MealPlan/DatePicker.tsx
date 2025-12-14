import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import { useState } from "react"

export type MealPlanDatePickerTarget = Data.TaggedEnum<{
  Existing: {
    id: string
    initialValue: DateTime.Utc
  }
  New: { recipeId: string }
}>
export const MealPlanDatePickerTarget =
  Data.taggedEnum<MealPlanDatePickerTarget>()

export function MealPlanDatePicker({
  target,
  children,
}: {
  readonly target: MealPlanDatePickerTarget
  readonly children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const commit = useCommit()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        asChild
        onClick={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={
            target._tag === "Existing"
              ? DateTime.toDateUtc(target.initialValue)
              : undefined
          }
          onSelect={(date) => {
            setOpen(false)
            if (!date) return
            const day = DateTime.unsafeFromDate(date).pipe(
              DateTime.setZone(DateTime.zoneMakeLocal()),
              DateTime.removeTime,
            )
            MealPlanDatePickerTarget.$match(target, {
              Existing({ id }) {
                commit(events.mealPlanSetDay({ id, day }))
              },
              New({ recipeId }) {
                commit(
                  events.mealPlanAdd({
                    id: crypto.randomUUID(),
                    day,
                    recipeId,
                  }),
                )
              },
            })
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
