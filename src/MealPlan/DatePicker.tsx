import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import { useState } from "react"
import { addMenuToMealPlanAtom } from "./atoms"
import { mealPlanWeekStart } from "@/Settings"
import * as Option from "effect/Option"

export type MealPlanDatePickerTarget = Data.TaggedEnum<{
  Existing: {
    id: string
    initialValue: DateTime.Utc
  }
  New: { recipeId: string }
  Menu: { id: string }
}>
export const MealPlanDatePickerTarget =
  Data.taggedEnum<MealPlanDatePickerTarget>()

export function MealPlanDatePicker({
  target,
  children,
  onSelect,
}: {
  readonly target: MealPlanDatePickerTarget
  readonly children: React.ReactNode
  readonly onSelect?: (date: DateTime.Utc) => void
}) {
  const [open, setOpen] = useState(false)
  const commit = useCommit()
  const addMenu = useAtomSet(addMenuToMealPlanAtom)
  const weekStart = useAtomValue(mealPlanWeekStart.atom).pipe(
    Result.value,
    Option.flatten,
    Option.getOrElse(() => 0 as const),
  )

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
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
          weekStartsOn={weekStart}
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
              Menu({ id }) {
                addMenu({
                  menuId: id,
                  startDate: day,
                })
              },
            })
            onSelect?.(day)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
