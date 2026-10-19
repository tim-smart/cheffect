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
import {
  type EventPayload,
  eventLogAtom,
  writeEvent,
  writeEvents,
} from "@/EventLog"
import {
  GroceryItemEvent,
  groceryItemUpdate,
  IngredientAisleEvent,
} from "./Events"
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
// aisle also removes the previous name's aisle. These are separate events,
// which is fine for a learned hint.

interface ItemWriteOptions {
  readonly previousName?: string | undefined
  readonly userInitiated?: boolean | undefined
}

// What an item write teaches: the aisle to set for its name, and the
// previous name whose aisle goes.
interface AisleLesson {
  readonly name: string
  readonly aisle: GroceryAisle | null
}

const aisleLessons = (
  item: GroceryItem,
  options: ItemWriteOptions,
  hasAisle: (name: string) => boolean,
): Array<AisleLesson> => {
  if (item.aisle === null) return []
  const lessons: Array<AisleLesson> = []
  const name = normalizeIngredientName(item.name)
  if (options.userInitiated || !hasAisle(name)) {
    lessons.push({ name, aisle: item.aisle })
  }
  if (options.previousName === undefined) return lessons
  const previousName = normalizeIngredientName(options.previousName)
  if (previousName !== name) {
    lessons.push({ name: previousName, aisle: null })
  }
  return lessons
}

const aisleEvent = ({ name, aisle }: AisleLesson): EventPayload =>
  aisle === null
    ? IngredientAisleEvent.remove({ name })
    : IngredientAisleEvent.set({ name, aisle })

const learnAisle = Effect.fnUntraced(function* (
  item: GroceryItem,
  options: ItemWriteOptions,
) {
  if (item.aisle === null) return
  const aisles = yield* GroceryRepo.use((repo) => repo.aisles)
  const hasAisle = (name: string) => Option.isSome(learnedAisle(aisles, name))
  for (const lesson of aisleLessons(item, options, hasAisle)) {
    yield* writeEvent(aisleEvent(lesson))
  }
})

export const addGroceryItem = Effect.fnUntraced(function* (item: GroceryItem) {
  yield* writeEvent(GroceryItemEvent.set(item))
  yield* learnAisle(item, {})
})

export const updateGroceryItem = Effect.fnUntraced(function* (
  item: GroceryItem,
  options: ItemWriteOptions = {},
) {
  yield* writeEvent(groceryItemUpdate(item))
  yield* learnAisle(item, options)
})

// Batches
//
// A writer changing many items at once writes the same events as it would one
// item at a time, in the same order, with one `writeEvents`. The aisles are
// read once, so the batch keeps track of the names its own aisle events set
// or removed.

export type GroceryItemWrite =
  | { readonly op: "add"; readonly item: GroceryItem }
  | {
      readonly op: "update"
      readonly item: GroceryItem
      readonly previousName?: string | undefined
    }
  | { readonly op: "remove"; readonly id: GroceryItemId }

export const writeGroceryItems = Effect.fnUntraced(function* (
  writes: ReadonlyArray<GroceryItemWrite>,
) {
  if (writes.length === 0) return
  const aisles = yield* GroceryRepo.use((repo) => repo.aisles)
  const taught = new Map<string, boolean>()
  const hasAisle = (name: string) =>
    taught.get(name) ?? Option.isSome(learnedAisle(aisles, name))
  const events: Array<EventPayload> = []
  for (const write of writes) {
    if (write.op === "remove") {
      events.push(GroceryItemEvent.remove({ id: write.id }))
      continue
    }
    events.push(
      write.op === "add"
        ? GroceryItemEvent.set(write.item)
        : groceryItemUpdate(write.item),
    )
    const options =
      write.op === "update" ? { previousName: write.previousName } : {}
    for (const lesson of aisleLessons(write.item, options, hasAisle)) {
      taught.set(lesson.name, lesson.aisle !== null)
      events.push(aisleEvent(lesson))
    }
  }
  yield* writeEvents(events)
})

export const addGroceryItems = (items: ReadonlyArray<GroceryItem>) =>
  writeGroceryItems(items.map((item) => ({ op: "add", item }) as const))

export const updateGroceryItems = (
  writes: ReadonlyArray<{
    readonly item: GroceryItem
    readonly previousName?: string | undefined
  }>,
) =>
  writeGroceryItems(
    writes.map(
      ({ item, previousName }) =>
        ({ op: "update", item, previousName }) as const,
    ),
  )

export const deleteGroceryItems = (ids: ReadonlyArray<GroceryItemId>) =>
  writeGroceryItems(ids.map((id) => ({ op: "remove", id }) as const))

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
// and aisles are read once up front, and the items are written as one batch.
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
