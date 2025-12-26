import { Menu } from "@/domain/Menu"
import { MenuEntry } from "@/domain/MenuEntry"
import { Recipe } from "@/domain/Recipe"
import { Store } from "@/livestore/atoms"
import { Atom } from "@effect-atom/atom-react"
import { queryDb, sql } from "@livestore/livestore"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

export const allMenus$ = queryDb({
  query: sql`select * from menus order by name asc`,
  schema: Menu.array,
})
export const allMenusAtom = Store.makeQuery(allMenus$)

export const menuByIdAtom = Atom.family((menuId: string) => {
  const result = Store.makeQuery(
    queryDb(
      {
        query: sql`select * from menus where id = ?`,
        schema: Menu.array,
        bindValues: [menuId],
      },
      {
        deps: [menuId],
        map: Array.head,
      },
    ),
  )
  return Atom.make((get) => get.result(result).pipe(Effect.flatten))
})

export const menuEntries$ = (menuId: string) =>
  queryDb(
    {
      query: sql`
          select
            me.*,
            json_object(
              ${Object.keys(Recipe.fields)
                .map((f) => `'${f}', r.${f}`)
                .join(", ")}
            ) as recipe
          from menu_entries me
          join recipes r on me.recipeId = r.id
          where me.menuId = ?
          order by me.day asc, r.title asc, me.createdAt desc`,
      schema: MenuEntry.array,
      bindValues: [menuId],
    },
    { deps: [menuId] },
  )

export const menuEntriesAtom = Atom.family((menuId: string) =>
  Store.makeQueryUnsafe(menuEntries$(menuId)),
)

export const menuRecipeCountAtom = (menuId: string) =>
  Store.makeQueryUnsafe(
    queryDb(
      {
        query: sql`
          select count(recipeId) as count
          from menu_entries
          where menuId = ?`,
        schema: CountSchema,
        bindValues: [menuId],
      },
      {
        map: (arr) => arr[0].count,
        deps: [menuId],
      },
    ),
  )

const CountSchema = Schema.Array(
  Schema.Struct({
    count: Schema.Number,
  }),
)
