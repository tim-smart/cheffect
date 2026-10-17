import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as HashSet from "effect/HashSet"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Atom from "effect/reactivity/Atom"
import {
  type GroceryAisle,
  GroceryItem,
  type GroceryItemId,
  normalizeIngredientName,
} from "@/domain/GroceryItem"
import type { Recipe } from "@/domain/Recipe"
import { eventLogAtom, writeEvent } from "@/EventLog"
import { GroceryRepo, learnedAisle } from "./Repo"

// The repo shares the EventLog runtime's query builder and Reactivity, so
// handler writes reload its snapshots.
export const groceriesRuntime = Atom.runtime((get) =>
  GroceryRepo.layer.pipe(Layer.provideMerge(get(eventLogAtom.layer))),
).pipe(Atom.keepAlive)

// Writes
//
// Handlers never touch the aisle table on an item write, so the
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

// Batches
//
// For a writer changing many items at once: each kind of write is one event,
// and the aisles they teach are one more. The aisles follow the same rules as
// one item at a time, in order, so a name set by an earlier item counts as
// learned and a later item's write to a name wins.

interface ItemWrite {
  readonly item: GroceryItem
  readonly previousName?: string | undefined
}

const learnAisles = Effect.fnUntraced(function* (
  writes: ReadonlyArray<ItemWrite>,
) {
  const learned = yield* GroceryRepo.use((repo) => repo.aisles)
  const changes = new Map<string, GroceryAisle | null>()
  for (const { item, previousName } of writes) {
    if (item.aisle === null) continue
    const name = normalizeIngredientName(item.name)
    const known = changes.has(name)
      ? changes.get(name) !== null
      : learned.has(name)
    if (!known) changes.set(name, item.aisle)
    if (previousName === undefined) continue
    const previous = normalizeIngredientName(previousName)
    if (previous !== name) changes.set(previous, null)
  }
  const aisles = Array.from(changes, ([name, aisle]) => ({ name, aisle }))
  if (!Arr.isArrayNonEmpty(aisles)) return
  yield* writeEvent({ event: "IngredientAislesChanged", payload: { aisles } })
})

export const addGroceryItems = Effect.fnUntraced(function* (
  items: ReadonlyArray<GroceryItem>,
) {
  if (!Arr.isReadonlyArrayNonEmpty(items)) return
  yield* writeEvent({ event: "GroceryItemsAdded", payload: { items } })
  yield* learnAisles(items.map((item) => ({ item })))
})

// An item written twice keeps its last write, as it would one at a time.
export const updateGroceryItems = Effect.fnUntraced(function* (
  writes: ReadonlyArray<ItemWrite>,
) {
  const items = Array.from(
    new Map(writes.map(({ item }) => [item.idString, item])).values(),
  )
  if (!Arr.isArrayNonEmpty(items)) return
  yield* writeEvent({ event: "GroceryItemsUpdated", payload: { items } })
  yield* learnAisles(writes)
})

export const deleteGroceryItems = Effect.fnUntraced(function* (
  ids: ReadonlyArray<GroceryItemId>,
) {
  if (!Arr.isReadonlyArrayNonEmpty(ids)) return
  yield* writeEvent({ event: "GroceryItemsDeleted", payload: { ids } })
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

// Mutations
//
// Every call runs on its own fiber, so a second submit never interrupts the
// first, and the atoms stay alive, so leaving the page doesn't either. A
// runtime fn would also hold calls made while the runtime is still building
// and then run only the latest one, dropping the rest; awaiting the runtime
// inside each call keeps every one.

type GroceriesServices =
  typeof groceriesRuntime extends Atom.AtomRuntime<infer R, infer _E>
    ? R
    : never

const groceriesMutation = <Arg, E>(
  f: (arg: Arg) => Effect.Effect<void, E, GroceriesServices>,
) =>
  Atom.fn<Arg>()(
    (arg) =>
      Atom.getResult(groceriesRuntime).pipe(
        Effect.flatMap((context) =>
          f(arg).pipe(Effect.provideContext(context)),
        ),
      ),
    { concurrent: true },
  ).pipe(Atom.keepAlive)

// An item added without an aisle takes the one learned for its name.
export const groceryItemAddAtom = groceriesMutation(
  Effect.fnUntraced(function* (item: GroceryItem) {
    if (item.aisle === null) {
      const aisles = yield* GroceryRepo.use((repo) => repo.aisles)
      const aisle = learnedAisle(aisles, item.name)
      if (Option.isSome(aisle)) {
        item = new GroceryItem({ ...item, aisle: aisle.value })
      }
    }
    yield* addGroceryItem(item)
  }),
)

// A user's own edit, which always teaches the item's aisle.
export const groceryItemEditAtom = groceriesMutation(
  ({
    item,
    previousName,
  }: {
    readonly item: GroceryItem
    readonly previousName: string
  }) => updateGroceryItem(item, { previousName, userInitiated: true }),
)

// Adds the recipes' ingredients to the default list, skipping excluded ones
// and anything in the pantry, with the aisle learned for each name. The pantry
// and aisles are read once up front, and the items are written as one event.
// Stays waiting for a few seconds after, so the button shows a check.
export const addToGroceriesAtom = groceriesMutation(
  Effect.fnUntraced(function* ({
    recipes,
    excludeIngredients,
  }: {
    readonly recipes: Iterable<Recipe>
    readonly excludeIngredients?: HashSet.HashSet<string> | undefined
  }) {
    const repo = yield* GroceryRepo
    const pantryItemNames = yield* repo.pantryNames
    const aisles = yield* repo.aisles
    const items: Array<GroceryItem> = []
    for (const recipe of recipes) {
      for (const [gi, group] of recipe.ingredientsDisplay.entries()) {
        for (const [ii, ingredient] of group.ingredients.entries()) {
          if (
            excludeIngredients &&
            HashSet.has(excludeIngredients, ingredient.id(gi, ii))
          ) {
            continue
          }
          const item = GroceryItem.fromIngredient(null, ingredient, recipe)
          if (pantryItemNames.has(item.nameNormalized)) continue
          items.push(
            new GroceryItem({
              ...item,
              aisle: Option.getOrNull(learnedAisle(aisles, item.name)),
            }),
          )
        }
      }
    }
    yield* addGroceryItems(items)
    yield* Effect.sleep("3 seconds")
  }),
)
