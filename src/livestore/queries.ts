import { queryDb, sql } from "@livestore/livestore"
import { tables } from "./schema"
import { Recipe } from "@/domain/Recipe"
import { Store } from "./atoms"
import { Atom, Result } from "@effect-atom/atom-react"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import { GroceryItem } from "@/domain/GroceryItem"
import * as DateTime from "effect/DateTime"
import { MealPlanEntry } from "@/domain/MealPlanEntry"
import { mealPlanWeekStart } from "@/Settings"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { flow } from "effect"

export const searchState$ = queryDb(tables.searchState.get())
export const searchStateAtom = Store.makeQuery(searchState$)
export const searchSortByAtom = Atom.map(searchStateAtom, (r) =>
  r.pipe(
    Result.map((s) => s.sortBy),
    Result.getOrElse(() => "title" as const),
  ),
)

export const mealPlanWeekAtom = Atom.make(
  DateTime.unsafeNow().pipe(
    DateTime.setZone(DateTime.zoneMakeLocal()),
    DateTime.startOf("week"),
    DateTime.removeTime,
  ),
).pipe(Atom.keepAlive)

export const mealPlanWeekAdjustedAtom = Atom.make((get) => {
  const today = new Date().getDay()
  const selectedWeek = get(mealPlanWeekAtom)
  const weekStartsOn = get(mealPlanWeekStart.atom).pipe(
    Result.value,
    Option.flatten,
    Option.getOrElse(() => 0 as const),
  )
  return DateTime.add(selectedWeek, {
    days: today < weekStartsOn ? weekStartsOn - 7 : weekStartsOn,
  })
})

export const allRecipesAtom = Store.makeQuery(
  queryDb(
    (get) => {
      const { query, sortBy } = get(searchState$)
      const trimmedQuery = query.trim()
      const sort = sortBy === "createdAt" ? "createdAt DESC" : "title ASC"
      if (trimmedQuery === "") {
        return {
          query: sql`SELECT * FROM recipes WHERE deletedAt IS NULL ORDER BY ${sort}`,
          schema: Recipe.array,
        }
      }
      const searchTerm = `%${trimmedQuery}%`
      return {
        query: sql`
          SELECT *,
            IF(title LIKE ?, 20, 0) +
            IF(ingredients LIKE ?, 10, 0) AS weight
          FROM recipes
          WHERE (title LIKE ? OR ingredients LIKE ?) AND deletedAt IS NULL
          ORDER BY weight DESC, ${sort}`,
        schema: Recipe.array,
        bindValues: [searchTerm, searchTerm, searchTerm, searchTerm],
      }
    },
    { label: "allRecipes" },
  ),
)

export const recipeByIdAtom = Atom.family((id: string) => {
  const result = Store.makeQuery(
    queryDb(
      {
        query: sql`SELECT * FROM recipes WHERE id = ?`,
        bindValues: [id],
        schema: Recipe.array,
      },
      {
        map: Array.head,
      },
    ),
  )

  return Atom.make((get) => get.result(result).pipe(Effect.flatten))
})

export const recipeTitleAtom = Atom.family((id: string) =>
  Store.makeQueryUnsafe(
    queryDb(
      {
        query: sql`SELECT title FROM recipes WHERE id = ?`,
        bindValues: [id],
        schema: TitleStruct,
      },
      {
        map: ([{ title }]) => title,
      },
    ),
  ),
)

const TitleStruct = Schema.Array(
  Schema.Struct({
    title: Schema.String,
  }),
)

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

export const allGroceryItemsAtom = Store.makeQuery(
  queryDb(
    (get) => {
      const state = get(groceryListState$)
      return {
        query: sql`SELECT * FROM grocery_items WHERE ${state.currentList ? "list = ?" : "list IS NULL"} ORDER BY aisle, name ASC`,
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
      query: sql`SELECT * FROM grocery_items WHERE ${list ? "list = ?" : "list IS NULL"} ORDER BY name ASC`,
      schema: GroceryItem.array,
      bindValues: list ? [list] : [],
    },
    {
      deps: [list ?? "null"],
      label: `allGroceryItemsArray`,
    },
  )

export const allGroceryItemsCurrent$ = queryDb(
  (get) => {
    const state = get(groceryListState$)
    return {
      query: sql`SELECT * FROM grocery_items WHERE ${state.currentList ? "list = ?" : "list IS NULL"} ORDER BY name ASC`,
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
    query: sql`SELECT DISTINCT list FROM grocery_items WHERE list IS NOT NULL ORDER BY list ASC`,
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
      deps: [startDay.epochMillis],
    },
  )
}

export const mealPlanEntriesAtom = Store.makeQuery((get) =>
  mealPlanEntries$(get(mealPlanWeekAdjustedAtom)),
)

const mealPlanRecipes$ = (query: string) => {
  const trimmedQuery = query.trim()
  return queryDb(
    {
      query:
        trimmedQuery === ""
          ? sql`SELECT * FROM recipes WHERE deletedAt IS NULL ORDER BY title ASC, createdAt DESC`
          : sql`SELECT * FROM recipes WHERE title LIKE ? AND deletedAt IS NULL ORDER BY title ASC, createdAt DESC`,
      schema: Recipe.array,
      bindValues: trimmedQuery === "" ? [] : [`%${trimmedQuery}%`],
    },
    { label: "mealPlanRecipes", deps: [trimmedQuery] },
  )
}

export const mealPlanRecipesQueryAtom = Atom.make("")

export const mealPlanRecipesAtom = Store.makeQueryUnsafe((get) =>
  mealPlanRecipes$(get(mealPlanRecipesQueryAtom)),
)
