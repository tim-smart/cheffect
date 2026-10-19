import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import type { Menu } from "@/domain/Menu"
import { writeEvent } from "@/EventLog"
import { idEquals } from "@/lib/Id"
import { RecipeRepo } from "@/Recipes/Repo"
import { menuDetail, MenuRepo, recipeCounts } from "./Repo"
import { menusRuntime } from "./runtime"
import { MenuEntryEvent, MenuDayNoteEvent, menuUpdate } from "@/Menus/Events"

// Reads

const menusAtom = menusRuntime
  .atom(MenuRepo.useSync((_) => _.menusStream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

const entriesAtom = menusRuntime
  .atom(MenuRepo.useSync((_) => _.entriesStream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

const notesAtom = menusRuntime
  .atom(MenuRepo.useSync((_) => _.notesStream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

const recipesAtom = menusRuntime
  .atom(RecipeRepo.useSync((_) => _.stream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

// Every menu, by name.
export const allMenusAtom = Atom.make((get) =>
  AsyncResult.map(get(menusAtom), (menus) => menus.all),
)

// A menu with the entries and notes it shows, or none when it doesn't exist.
export const menuByIdAtom = Atom.family((id: string) =>
  Atom.make((get) =>
    AsyncResult.all({
      menus: get(menusAtom),
      entries: get(entriesAtom),
      notes: get(notesAtom),
      recipes: get(recipesAtom),
    }).pipe(AsyncResult.map((state) => menuDetail(state, id))),
  ),
)

// The number of recipes each menu shows, keyed by the menu's id string.
export const menuRecipeCountsAtom = Atom.make((get) =>
  AsyncResult.all({
    menus: get(menusAtom),
    entries: get(entriesAtom),
    recipes: get(recipesAtom),
  }).pipe(AsyncResult.map(recipeCounts)),
)

// Writes

// Lowering `days` removes the menu's entries and notes on the dropped days,
// then updates the menu. The handlers don't cascade a shrink: a remove for
// each row this device can see means an entry or note written concurrently on
// another device survives, past the last day where reads don't show it.
export const setMenuDaysAtom = menusRuntime.fn<{
  readonly menu: Menu
  readonly days: number
}>()(
  Effect.fnUntraced(function* ({ menu, days }) {
    if (!Number.isInteger(days) || days < 1 || days === menu.days) return
    if (days < menu.days) {
      const repo = yield* MenuRepo
      for (const entry of yield* repo.entries) {
        if (!idEquals(entry.menuId, menu.id) || entry.day <= days) continue
        yield* writeEvent(
          MenuEntryEvent.remove({
            id: entry.id,
            menuId: entry.menuId,
          }),
        )
      }
      for (const note of yield* repo.notes) {
        if (!idEquals(note.menuId, menu.id) || note.day <= days) continue
        yield* writeEvent(
          MenuDayNoteEvent.remove({
            id: note.id,
            menuId: note.menuId,
          }),
        )
      }
    }
    yield* writeEvent(
      menuUpdate({ ...menu, days, updatedAt: yield* DateTime.now }),
    )
  }),
)
