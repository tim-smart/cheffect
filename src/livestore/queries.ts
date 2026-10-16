import { queryDb, sql } from "@livestore/livestore"
import { Store } from "./atoms"
import { LegacyGroceryItem } from "./schema"
import * as Atom from "effect/reactivity/Atom"
import * as Array from "effect/Array"
import { groceryCurrentListAtom } from "@/Groceries/currentList"
import * as Schema from "effect/Schema"
import { flow } from "effect"

export const PANTRY_GROCERY_LIST_NAME = "Pantry" as const

const GroceryAisleOrderRow = Schema.Array(
  Schema.Struct({
    aisle: Schema.String,
    sortOrder: Schema.Number,
  }),
)

const groceryAisleOrdersByList = Atom.family((list: string | null) =>
  Store.makeQuery(
    queryDb(
      {
        query: sql`
          SELECT aisle, sortOrder
          FROM grocery_aisle_orders
          WHERE ${list ? "list = ?" : "list IS NULL"}
          ORDER BY sortOrder ASC`,
        schema: GroceryAisleOrderRow,
        bindValues: list ? [list] : [],
      },
      {
        deps: [list ?? "null"],
        label: "groceryAisleOrders",
      },
    ),
  ),
)

export const groceryAisleOrdersAtom = Atom.make((get) =>
  get(groceryAisleOrdersByList(get(groceryCurrentListAtom))),
)

const allGroceryItemsByList = Atom.family((list: string | null) =>
  Store.makeQuery(
    queryDb(
      {
        query: sql`
          SELECT *
          FROM grocery_items
          WHERE ${list ? "list = ?" : "list IS NULL"}
          ORDER BY aisle, name COLLATE NOCASE ASC`,
        schema: LegacyGroceryItem.array,
        bindValues: list ? [list] : [],
      },
      {
        deps: [list ?? "null"],
        label: `allGroceryItems`,
        map: (items) => {
          const aisles = new Map<
            string,
            Array.NonEmptyArray<LegacyGroceryItem>
          >()
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
  ),
)

export const allGroceryItemsAtom = Atom.make((get) =>
  get(allGroceryItemsByList(get(groceryCurrentListAtom))),
)

export const allGroceryItems$ = (list: null | string) =>
  queryDb(
    {
      query: sql`
        SELECT *
        FROM grocery_items
        WHERE ${list ? "list = ?" : "list IS NULL"}
        ORDER BY name COLLATE NOCASE ASC`,
      schema: LegacyGroceryItem.array,
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
  schema: LegacyGroceryItem.array,
})

const allGroceryItemsArrayByList = Atom.family((list: string | null) =>
  Store.makeQuery(allGroceryItems$(list)),
)

export const allGroceryItemsArrayAtom = Atom.make((get) =>
  get(allGroceryItemsArrayByList(get(groceryCurrentListAtom))),
)

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
