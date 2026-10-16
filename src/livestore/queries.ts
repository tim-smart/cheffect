import { queryDb, sql } from "@livestore/livestore"
import { tables } from "./schema"
import { Recipe } from "@/domain/Recipe"
import { Store } from "./atoms"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Array from "effect/Array"
import { GroceryItem } from "@/domain/GroceryItem"
import * as DateTime from "effect/DateTime"
import { MealPlanDayNote } from "@/domain/MealPlanDayNote"
import { MealPlanEntry } from "@/domain/MealPlanEntry"
import { mealPlanWeekStart } from "@/Settings"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { flow } from "effect"

export const PANTRY_GROCERY_LIST_NAME = "Pantry" as const

export const mealPlanWeekAtom = Atom.make(
  DateTime.nowUnsafe().pipe(
    DateTime.setZone(DateTime.zoneMakeLocal()),
    DateTime.startOf("week"),
    DateTime.removeTime,
  ),
).pipe(Atom.keepAlive)

export const mealPlanWeekAdjustedAtom = Atom.make((get) => {
  const today = new Date().getDay()
  const selectedWeek = get(mealPlanWeekAtom)
  const weekStartsOn = get(mealPlanWeekStart.atom).pipe(
    AsyncResult.value,
    Option.flatten,
    Option.getOrElse(() => 0 as const),
  )
  return DateTime.add(selectedWeek, {
    days: today < weekStartsOn ? weekStartsOn - 7 : weekStartsOn,
  })
})

export const groceryListState$ = queryDb(tables.groceryListState.get())
export const groceryListStateAtom = Atom.writable(
  Store.makeQuery(groceryListState$).read,
  (
    ctx,
    newValue: {
      currentList: null | string
    },
  ) => {
    ctx.get(Store.storeUnsafe!)?.commit(tables.groceryListState.set(newValue))
  },
)

const GroceryAisleOrderRow = Schema.Array(
  Schema.Struct({
    aisle: Schema.String,
    sortOrder: Schema.Number,
  }),
)

export const groceryAisleOrders$ = queryDb(
  (get) => {
    const state = get(groceryListState$)
    return {
      query: sql`
        SELECT aisle, sortOrder
        FROM grocery_aisle_orders
        WHERE ${state.currentList ? "list = ?" : "list IS NULL"}
        ORDER BY sortOrder ASC`,
      schema: GroceryAisleOrderRow,
      bindValues: state.currentList ? [state.currentList] : [],
    }
  },
  {
    label: "groceryAisleOrders",
  },
)

export const groceryAisleOrdersAtom = Store.makeQuery(groceryAisleOrders$)

export const allGroceryItemsAtom = Store.makeQuery(
  queryDb(
    (get) => {
      const state = get(groceryListState$)
      return {
        query: sql`
          SELECT *
          FROM grocery_items
          WHERE ${state.currentList ? "list = ?" : "list IS NULL"}
          ORDER BY aisle, name COLLATE NOCASE ASC`,
        schema: GroceryItem.array,
        bindValues: state.currentList ? [state.currentList] : [],
      }
    },
    {
      label: `allGroceryItems`,
      map: (items) => {
        const aisles = new Map<string, Array.NonEmptyArray<GroceryItem>>()
        for (const item of items) {
          const aisle = item.aisle ?? "Other"
          const existing = aisles.get(aisle)
          if (existing) {
            existing.push(item)
          } else {
            aisles.set(aisle, [item])
          }
        }
        if (aisles.has("Other")) {
          const other = aisles.get("Other")!
          aisles.delete("Other")
          aisles.set("Other", other)
        }
        return aisles
      },
    },
  ),
)

export const allGroceryItems$ = (list: null | string) =>
  queryDb(
    {
      query: sql`
        SELECT *
        FROM grocery_items
        WHERE ${list ? "list = ?" : "list IS NULL"}
        ORDER BY name COLLATE NOCASE ASC`,
      schema: GroceryItem.array,
      bindValues: list ? [list] : [],
    },
    {
      deps: [list ?? "null"],
      label: `allGroceryItemsArray`,
    },
  )

export const exportGroceryItems$ = queryDb({
  query: sql`
    SELECT *
    FROM grocery_items`,
  schema: GroceryItem.array,
})

export const allGroceryItemsCurrent$ = queryDb(
  (get) => {
    const state = get(groceryListState$)
    return {
      query: sql`
        SELECT *
        FROM grocery_items
        WHERE ${state.currentList ? "list = ?" : "list IS NULL"}
        ORDER BY name COLLATE NOCASE ASC`,
      schema: GroceryItem.array,
      bindValues: state.currentList ? [state.currentList] : [],
    }
  },
  {
    label: `allGroceryItemsArrayCurrent`,
  },
)
export const allGroceryItemsArrayAtom = Store.makeQuery(allGroceryItemsCurrent$)

export const groceryListNames$ = queryDb(
  {
    query: sql`
      SELECT list
      FROM (
        SELECT DISTINCT list
        FROM grocery_items
        WHERE list IS NOT NULL
        UNION
        SELECT ? AS list
      )
      ORDER BY list COLLATE NOCASE ASC`,
    bindValues: [PANTRY_GROCERY_LIST_NAME],
    schema: Schema.Array(Schema.Struct({ list: Schema.String })),
  },
  {
    label: "groceryListNames",
    map: flow(
      Array.map((r) => r.list),
      Array.prepend(null),
    ),
  },
)
export const groceryListNamesAtom = Store.makeQuery(groceryListNames$)

export const pantryGroceryItemNames$ = queryDb(
  {
    query: sql`
      SELECT DISTINCT lower(trim(name)) AS name
      FROM grocery_items
      WHERE list = ? AND completed = FALSE`,
    bindValues: [PANTRY_GROCERY_LIST_NAME],
    schema: Schema.Array(
      Schema.Struct({
        name: Schema.String,
      }),
    ),
  },
  {
    label: "pantryGroceryItemNames",
    map: Array.map((row) => row.name),
  },
)

export const mealPlanEntries$ = (startDay: DateTime.Utc) => {
  const weekDays = Array.of(DateTime.formatIsoDate(startDay))
  for (let i = 1; i < 7; i++) {
    weekDays.push(
      DateTime.add(startDay, { days: i }).pipe(DateTime.formatIsoDate),
    )
  }
  return queryDb(
    {
      query: sql`
        select
          json_object(
            ${Object.keys(Recipe.fields)
              .map((f) => `'${f}', r.${f}`)
              .join(", ")}
          ) as recipe,
          m.day as day,
          m.id as id
        from meal_plan m
        join recipes r on m.recipeId = r.id
        where m.day IN ('${weekDays.join("','")}')
        order by m.day ASC, r.title ASC
      `,
      schema: MealPlanEntry.array,
    },
    {
      deps: [startDay.epochMilliseconds],
    },
  )
}

export const mealPlanDayNotes$ = (startDay: DateTime.Utc) => {
  const weekDays = Array.of(DateTime.formatIsoDate(startDay))
  for (let i = 1; i < 7; i++) {
    weekDays.push(
      DateTime.add(startDay, { days: i }).pipe(DateTime.formatIsoDate),
    )
  }
  return queryDb(
    {
      query: sql`
        select *
        from meal_plan_day_notes
        where day IN ('${weekDays.join("','")}')
        order by day asc, updatedAt desc
      `,
      schema: MealPlanDayNote.array,
    },
    {
      deps: [startDay.epochMilliseconds],
    },
  )
}

export const mealPlanDayNotesForDay$ = (day: DateTime.Utc) => {
  const weekDay = DateTime.formatIsoDate(day)
  return queryDb(
    {
      query: sql`
        select *
        from meal_plan_day_notes
        where day = ?
      `,
      schema: MealPlanDayNote.array,
      bindValues: [weekDay],
    },
    {
      deps: [day.epochMilliseconds],
    },
  )
}

export const mealPlanEntriesAtom = Store.makeQuery((get) =>
  mealPlanEntries$(get(mealPlanWeekAdjustedAtom)),
)

export const mealPlanDayNotesAtom = Store.makeQuery((get) =>
  mealPlanDayNotes$(get(mealPlanWeekAdjustedAtom)),
)
