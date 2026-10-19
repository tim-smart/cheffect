import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import { useState } from "react"
import { addMenuToMealPlanAtom } from "./atoms"
import { MealPlanEntryId } from "@/domain/MealPlanEntry"
import type { RecipeId } from "@/domain/Recipe"
import { useWrite } from "@/EventLog"
import { generateUuidBytes } from "@/lib/Id"
import { mealPlanWeekStart } from "@/Settings"
import * as Option from "effect/Option"
import { MealPlanEntryEvent, mealPlanEntryDay } from "@/MealPlan/Events"

export type MealPlanDatePickerTarget = Data.TaggedEnum<{
  Existing: {
    id: MealPlanEntryId
    initialValue: DateTime.Utc
  }
  New: { recipeId: RecipeId }
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
  const write = useWrite()
  const addMenu = useAtomSet(addMenuToMealPlanAtom)
  const weekStart = useAtomValue(mealPlanWeekStart.atom).pipe(
    AsyncResult.value,
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
            const day = DateTime.fromDateUnsafe(date).pipe(
              DateTime.setZone(DateTime.zoneMakeLocal()),
              DateTime.removeTime,
            )
            MealPlanDatePickerTarget.$match(target, {
              Existing({ id }) {
                write(mealPlanEntryDay(id, day))
              },
              New({ recipeId }) {
                write(
                  MealPlanEntryEvent.set({
                    id: MealPlanEntryId.make(generateUuidBytes()),
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
