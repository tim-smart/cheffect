import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Atom from "effect/reactivity/Atom"
import { type GroceryItem, normalizeIngredientName } from "@/domain/GroceryItem"
import { eventLogAtom, writeEvent } from "@/EventLog"
import { GroceryRepo, learnedAisle } from "./Repo"

// The repo shares the EventLog runtime's query builder and Reactivity, so
// handler writes reload its snapshots. Kept apart from `atoms.ts` so Settings
// can export and import groceries without an import cycle.
export const groceriesRuntime = Atom.runtime((get) =>
  GroceryRepo.layer.pipe(Layer.provideMerge(get(eventLogAtom.layer))),
).pipe(Atom.keepAlive)

// Writes
//
// Handlers never touch the aisle table on an item write (TIM-248), so the
// writer teaches it. An item with an aisle sets that aisle for its name when
// the name has none yet, or always on a user's own edit. A rename with an
// aisle also removes the previous name's aisle. These are separate writes,
// which is fine for a learned hint.

const learnAisle = Effect.fnUntraced(function* (
  item: GroceryItem,
  options: {
    readonly previousName?: string | undefined
    readonly userInitiated?: boolean | undefined
  },
) {
  if (item.aisle === null) return
  const aisles = yield* GroceryRepo.use((repo) => repo.aisles)
  const name = normalizeIngredientName(item.name)
  if (options.userInitiated || Option.isNone(learnedAisle(aisles, name))) {
    yield* writeEvent({
      event: "IngredientAisleSet",
      payload: { name, aisle: item.aisle },
    })
  }
  if (options.previousName === undefined) return
  const previousName = normalizeIngredientName(options.previousName)
  if (previousName === name) return
  yield* writeEvent({
    event: "IngredientAisleRemoved",
    payload: { name: previousName },
  })
})

export const addGroceryItem = Effect.fnUntraced(function* (item: GroceryItem) {
  yield* writeEvent({ event: "GroceryItemAdded", payload: item })
  yield* learnAisle(item, {})
})

export const updateGroceryItem = Effect.fnUntraced(function* (
  item: GroceryItem,
  options: {
    readonly previousName?: string | undefined
    readonly userInitiated?: boolean | undefined
  } = {},
) {
  yield* writeEvent({ event: "GroceryItemUpdated", payload: item })
  yield* learnAisle(item, options)
})

// Every item on every list, read when called.
export const exportGroceryItemsAtom = groceriesRuntime.fn<void>()(() =>
  GroceryRepo.use((repo) => repo.items),
)

// Writes items as new adds. Ones that already exist are left alone, so
// importing the same file twice changes nothing.
export const importGroceryItemsAtom = groceriesRuntime.fn<
  ReadonlyArray<GroceryItem>
>()(
  Effect.fnUntraced(function* (items) {
    const existing = new Set(
      (yield* GroceryRepo.use((repo) => repo.items)).map(
        (item) => item.idString,
      ),
    )
    for (const item of items) {
      if (existing.has(item.idString)) continue
      yield* addGroceryItem(item)
    }
  }),
)
