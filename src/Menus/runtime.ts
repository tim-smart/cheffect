import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/reactivity/Atom"
import type { Menu } from "@/domain/Menu"
import { writeEvent } from "@/EventLog"
import { uuidString } from "@/lib/Id"
import { recipesRuntime } from "@/Recipes/runtime"
import { MenuRepo, type StoredMenuDayNote, type StoredMenuEntry } from "./Repo"

// The repo shares the recipes runtime, so the join reads the same recipes
// snapshot and handler writes reload both. Kept apart from `atoms.ts` so
// Settings can export and import menus without an import cycle.
export const menusRuntime = Atom.runtime((get) =>
  MenuRepo.layer.pipe(Layer.provideMerge(get(recipesRuntime.layer))),
).pipe(Atom.keepAlive)

// Every menu, entry and day note, read when called.
export const exportMenusAtom = menusRuntime.fn<void>()(() =>
  MenuRepo.use((repo) =>
    Effect.all({ menus: repo.all, entries: repo.entries, notes: repo.notes }),
  ),
)

// Writes menus, entries and notes as new add entries. Ones that already exist
// are left alone, so importing the same file twice changes nothing. A note add
// would merge as the newest write, so existing notes are skipped here rather
// than reverted to the file's text.
export const importMenusAtom = menusRuntime.fn<{
  readonly menus: ReadonlyArray<Menu>
  readonly entries: ReadonlyArray<StoredMenuEntry>
  readonly notes: ReadonlyArray<StoredMenuDayNote>
}>()(
  Effect.fnUntraced(function* ({ menus, entries, notes }) {
    const repo = yield* MenuRepo
    const existingMenus = new Set(
      (yield* repo.all).map((menu) => menu.idString),
    )
    const existingEntries = new Set(
      (yield* repo.entries).map((entry) => uuidString(entry.id)),
    )
    const existingNotes = new Set(
      (yield* repo.notes).map((note) => uuidString(note.id)),
    )
    for (const menu of menus) {
      if (existingMenus.has(menu.idString)) continue
      yield* writeEvent({ event: "MenuAdd", payload: menu })
    }
    for (const entry of entries) {
      if (existingEntries.has(uuidString(entry.id))) continue
      yield* writeEvent({ event: "MenuEntryAdd", payload: entry })
    }
    for (const note of notes) {
      if (existingNotes.has(uuidString(note.id))) continue
      yield* writeEvent({ event: "MenuDayNoteAdd", payload: note })
    }
  }),
)
