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

export const searchState$ = queryDb(tables.searchState.get())
export const searchStateAtom = Store.makeQuery(searchState$)
export const searchSortByAtom = Atom.map(searchStateAtom, (r) =>
  r.pipe(
    Result.map((s) => s.sortBy),
    Result.getOrElse(() => "title" as const),
  ),
)

export const mealPlanWeekAtom = Atom.make(
  DateTime.unsafeNow().pipe(DateTime.startOf("week")),
)

export const allRecipesAtom = Store.makeQuery(
  queryDb(
    (get) => {
      const { query, sortBy } = get(searchState$)
      const trimmedQuery = query.trim()
      const sort = sortBy === "createdAt" ? "createdAt DESC" : "title ASC"
      if (trimmedQuery === "") {
        return {
          query: sql`SELECT * FROM recipes ORDER BY ${sort}`,
          schema: Recipe.array,
        }
      }
      return {
        query: sql`SELECT * FROM recipes WHERE title LIKE ? ORDER BY ${sort}`,
        schema: Recipe.array,
        bindValues: [`%${trimmedQuery}%`],
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

export const allGroceryItemsAtom = Store.makeQuery(
  queryDb(
    {
      query: sql`SELECT * FROM grocery_items ORDER BY aisle, name DESC`,
      schema: GroceryItem.array,
    },
    {
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

export const allGroceryItemsArrayAtom = Store.makeQuery(
  queryDb({
    query: sql`SELECT * FROM grocery_items ORDER BY name DESC`,
    schema: GroceryItem.array,
  }),
)

const mealPlanEntries$ = (startDay: DateTime.Utc) => {
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

export const mealPlanEntriesAtom = Store.runtime.atom(
  Effect.fnUntraced(function* (get) {
    const store = yield* Store
    const startDay = get(mealPlanWeekAtom)
    const query = mealPlanEntries$(startDay)
    const result = store.query(query)
    get.addFinalizer(
      store.subscribe(query, {
        onUpdate(value) {
          get.setSelf(Result.success(value))
        },
      }),
    )
    return result
  }),
)

const mealPlanRecipes$ = (query: string) => {
  const trimmedQuery = query.trim()
  return queryDb(
    {
      query:
        trimmedQuery === ""
          ? sql`SELECT * FROM recipes ORDER BY title ASC, createdAt DESC`
          : sql`SELECT * FROM recipes WHERE title LIKE ? ORDER BY title ASC, createdAt DESC`,
      schema: Recipe.array,
      bindValues: trimmedQuery === "" ? [] : [`%${trimmedQuery}%`],
    },
    { label: "mealPlanRecipes", deps: [trimmedQuery] },
  )
}

export const mealPlanRecipesQueryAtom = Atom.make("")

export const mealPlanRecipesAtom = Atom.make((get) => {
  const store = get(Store.storeUnsafe)!
  const searchQuery = get(mealPlanRecipesQueryAtom)
  const query = mealPlanRecipes$(searchQuery)
  const result = store.query(query)
  get.addFinalizer(
    store.subscribe(query, {
      onUpdate(value) {
        get.setSelf(value)
      },
    }),
  )
  return result
})
