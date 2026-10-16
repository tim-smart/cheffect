import * as Effect from "effect/Effect"
import * as HashSet from "effect/HashSet"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Atom from "effect/reactivity/Atom"
import { GroceryItem, normalizeIngredientName } from "@/domain/GroceryItem"
import type { Recipe } from "@/domain/Recipe"
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
// and aisles are read once up front. Stays waiting for a few seconds after, so
// the button shows a check.
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
          yield* addGroceryItem(
            new GroceryItem({
              ...item,
              aisle: Option.getOrNull(learnedAisle(aisles, item.name)),
            }),
          )
        }
      }
    }
    yield* Effect.sleep("3 seconds")
  }),
)

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
