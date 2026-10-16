import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import { Menu } from "@/domain/Menu"
import { MenuDayNote } from "@/domain/MenuDayNote"
import { MenuEntry } from "@/domain/MenuEntry"
import { uuidString } from "@/lib/Id"
import { stripLww } from "@/lib/Lww"
import { makeSnapshot } from "@/lib/Snapshot"
import { compareText } from "@/lib/text"
import { RecipeRepo, type Recipes } from "@/Recipes/Repo"
import type { MenuDayNoteRow, MenuEntryRow, MenuRow } from "./Table"

// Reads
//
// Every read is a pure function over the table snapshots, and every read of a
// menu's entries and notes goes through the menu. Two kinds of stored row
// never show: one whose menu is gone (added concurrently with its remove),
// and one past the menu's last day (written concurrently with a shrink that
// didn't see it). Entries are joined with the recipes snapshot: an entry
// whose recipe is missing is hidden, and one whose recipe is soft-deleted
// still shows.

export type StoredMenuEntry = Omit<MenuEntryRow, "_lww">
export type StoredMenuDayNote = Omit<MenuDayNoteRow, "_lww">

export interface Menus {
  // By name.
  readonly all: ReadonlyArray<Menu>
  readonly byId: ReadonlyMap<string, Menu>
}

export interface MenuDetail {
  readonly menu: Menu
  // By day, then recipe title, then newest first.
  readonly entries: ReadonlyArray<MenuEntry>
  // By day, then most recently updated first.
  readonly notes: ReadonlyArray<MenuDayNote>
}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const decodeMenus = (rows: ReadonlyArray<MenuRow>): Menus => {
  const all = rows
    .map((row) => new Menu(stripLww(row)))
    .sort(
      (a, b) =>
        compareText(a.name, b.name) || compareIds(a.idString, b.idString),
    )
  return {
    all,
    byId: new Map(all.map((menu) => [menu.idString, menu])),
  }
}

const decodeEntries = (
  rows: ReadonlyArray<MenuEntryRow>,
): ReadonlyArray<StoredMenuEntry> => rows.map(stripLww)

const decodeNotes = (
  rows: ReadonlyArray<MenuDayNoteRow>,
): ReadonlyArray<StoredMenuDayNote> => rows.map(stripLww)

export const findMenu = (menus: Menus, id: string): Option.Option<Menu> =>
  Option.fromUndefinedOr(menus.byId.get(id.toLowerCase()))

// Whether a stored entry or note shows on its menu: the menu exists and the
// row is on one of its days. Days are numbered from 1.
const shownOn = (
  menus: Menus,
  row: { readonly menuId: Uint8Array; readonly day: number },
): Option.Option<Menu> => {
  const menu = menus.byId.get(uuidString(row.menuId))
  return menu !== undefined && row.day >= 1 && row.day <= menu.days
    ? Option.some(menu)
    : Option.none()
}

export const menuDetail = (
  state: {
    readonly menus: Menus
    readonly entries: ReadonlyArray<StoredMenuEntry>
    readonly notes: ReadonlyArray<StoredMenuDayNote>
    readonly recipes: Recipes
  },
  id: string,
): Option.Option<MenuDetail> =>
  Option.map(findMenu(state.menus, id), (menu) => {
    const menuId = menu.idString
    const entries: Array<MenuEntry> = []
    for (const entry of state.entries) {
      if (uuidString(entry.menuId) !== menuId) continue
      if (Option.isNone(shownOn(state.menus, entry))) continue
      const recipe = state.recipes.byId.get(uuidString(entry.recipeId))
      if (recipe === undefined) continue
      entries.push(
        new MenuEntry({
          id: entry.id,
          recipe,
          day: entry.day,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        }),
      )
    }
    const notes: Array<MenuDayNote> = []
    for (const note of state.notes) {
      if (uuidString(note.menuId) !== menuId) continue
      if (Option.isNone(shownOn(state.menus, note))) continue
      notes.push(
        new MenuDayNote({
          id: note.id,
          day: note.day,
          note: note.note,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        }),
      )
    }
    return {
      menu,
      entries: entries.sort(
        (a, b) =>
          a.day - b.day ||
          compareText(a.recipe.title, b.recipe.title) ||
          b.createdAt.epochMilliseconds - a.createdAt.epochMilliseconds ||
          compareIds(a.idString, b.idString),
      ),
      notes: notes.sort(
        (a, b) =>
          a.day - b.day ||
          b.updatedAt.epochMilliseconds - a.updatedAt.epochMilliseconds ||
          compareIds(a.idString, b.idString),
      ),
    }
  })

// The number of recipes each menu shows, keyed by the menu's id string. Counts
// the same entries `menuDetail` shows.
export const recipeCounts = (state: {
  readonly menus: Menus
  readonly entries: ReadonlyArray<StoredMenuEntry>
  readonly recipes: Recipes
}): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>()
  for (const entry of state.entries) {
    const menu = shownOn(state.menus, entry)
    if (Option.isNone(menu)) continue
    if (!state.recipes.byId.has(uuidString(entry.recipeId))) continue
    const key = menu.value.idString
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export class MenuRepo extends Context.Service<MenuRepo>()(
  "cheffect/Menus/Repo/MenuRepo",
  {
    make: Effect.gen(function* () {
      const recipes = yield* RecipeRepo
      const menus = yield* makeSnapshot("menus")
      const entries = yield* makeSnapshot("menuEntries")
      const notes = yield* makeSnapshot("menuDayNotes")

      const currentMenus = menus.current.pipe(Effect.map(decodeMenus))
      const currentEntries = entries.current.pipe(Effect.map(decodeEntries))
      const currentNotes = notes.current.pipe(Effect.map(decodeNotes))
      const current = Effect.all({
        menus: currentMenus,
        entries: currentEntries,
        notes: currentNotes,
        recipes: recipes.current,
      })

      return {
        menusStream: menus.stream.pipe(Stream.map(decodeMenus)),
        entriesStream: entries.stream.pipe(Stream.map(decodeEntries)),
        notesStream: notes.stream.pipe(Stream.map(decodeNotes)),
        all: currentMenus.pipe(Effect.map((menus) => menus.all)),
        byId: (id: string) =>
          current.pipe(Effect.map((state) => menuDetail(state, id))),
        recipeCounts: current.pipe(Effect.map(recipeCounts)),
        // Every stored entry and note, unjoined and unfiltered: for export,
        // import and the shrink writer.
        entries: currentEntries,
        notes: currentNotes,
      } as const
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
