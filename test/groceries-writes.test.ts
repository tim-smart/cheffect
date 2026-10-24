import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as HashSet from "effect/HashSet"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Reactivity from "effect/reactivity/Reactivity"
import { EventLogClient, eventLogAtom, journalDatabaseName } from "@/EventLog"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { GroceriesLayer } from "@/Groceries"
import {
  GroceryEvents,
  GroceryItemEvent,
  IngredientAliasEvent,
} from "@/Groceries/Events"
import {
  addToGroceriesAtom,
  groceriesRuntime,
  groceryItemAddAtom,
  groceryItemEditAtom,
} from "@/Groceries/runtime"
import {
  defaultGrocerySelection,
  groceryCandidates,
  selectedGroceryItems,
} from "@/Groceries/candidates"
import { GroceryItem, GroceryItemId } from "@/domain/GroceryItem"
import {
  ExtractedRecipe,
  Ingredient,
  IngredientsComponent,
} from "@/domain/Recipe"
import { generateUuidBytes } from "@/lib/Id"
import { testIdentity } from "./harness/eventlog"
import { layerFreshIndexedDb } from "./harness/indexeddb"

// Every grocery submission is written: one made while an earlier one is still
// writing, one made while the groceries runtime is still building, and one
// whose component unmounts straight after. Both mutation atoms share one
// wrapper, so each case runs through one of them. The atoms live next to the
// runtime, away from the AI imports that can't load in node.

// The app's EventLog runtime on fake-indexeddb, with the Groceries handlers.
const layer = EventLogClient.layer.pipe(
  Layer.provideMerge(
    EventLog.layer(EventLog.schema(GroceryEvents), GroceriesLayer).pipe(
      Layer.provide(
        EventJournal.layerIndexedDb({ database: journalDatabaseName }),
      ),
    ),
  ),
  Layer.provideMerge(Layer.effect(EventLog.Identity, testIdentity)),
  Layer.provideMerge(QueryBuilder.layer),
  Layer.provideMerge(layerDatabase),
  Layer.provideMerge(Reactivity.layer),
  Layer.provideMerge(layerFreshIndexedDb),
)

// Indexing the group by tag types the payload as any of its rows.
const decodeItem = Schema.decodeUnknownSync(
  GroceryEvents.events[GroceryItemEvent.tag].payloadSchemaBinary,
) as (bytes: unknown) => typeof GroceryItemEvent.payload.Type

type Mutation<Arg> = Atom.AtomResultFn<Arg, void, unknown>

// Each submit is evaluated before the next, as separate UI events are.
const submit = <Arg>(
  registry: AtomRegistry.AtomRegistry,
  atom: Mutation<Arg>,
  arg: Arg,
) => {
  registry.set(atom, arg)
  registry.get(atom)
}

// The journal once `atom` has settled, or once its batch lands after it
// unmounts.
const settledJournal = <Arg>(options: {
  // Built up front, as on the groceries page, or still building.
  readonly runtime: "built" | "cold"
  readonly atom: Mutation<Arg>
  readonly submit: (registry: AtomRegistry.AtomRegistry) => void
  readonly unmountAfterSubmit?: boolean
}) => {
  const registry = AtomRegistry.make({
    initialValues: [[eventLogAtom.layer, layer]],
  })
  const unmounts = [registry.mount(eventLogAtom)]
  if (options.runtime === "built")
    unmounts.push(registry.mount(groceriesRuntime))
  const unmountAtom = registry.mount(options.atom)
  return Effect.gen(function* () {
    const context = yield* Atom.getResult(eventLogAtom)
    if (options.runtime === "built") yield* Atom.getResult(groceriesRuntime)
    options.submit(registry)
    const entries = EventLog.EventLog.use((log) => log.entries).pipe(
      Effect.provideContext(context),
    )
    if (options.unmountAfterSubmit) {
      // Nothing reads the atom again, so the registry can dispose it. Its
      // items are written as one batch; poll the journal for it rather than
      // waiting on the atom, which would mount it again.
      unmountAtom()
      return yield* entries.pipe(
        Effect.repeat({
          until: (journal) =>
            journal.some((entry) => entry.event === GroceryItemEvent.tag),
          schedule: Schedule.spaced("10 millis"),
        }),
      )
    }
    unmounts.push(unmountAtom)
    yield* Atom.getResult(options.atom, { suspendOnWaiting: true })
    return yield* entries
  }).pipe(
    // A recipe batch stays waiting for 3 seconds after its writes.
    Effect.timeout("10 seconds"),
    Effect.provideService(AtomRegistry.AtomRegistry, registry),
    Effect.ensuring(
      Effect.sync(() => {
        for (const unmount of unmounts) unmount()
        registry.dispose()
      }),
    ),
    Effect.runPromise,
  )
}

// The names of the items added to the journal.
const addedNames = <Arg>(options: Parameters<typeof settledJournal<Arg>>[0]) =>
  settledJournal(options).then((entries) =>
    entries
      .filter((entry) => entry.event === GroceryItemEvent.tag)
      .map((entry) => decodeItem(entry.payload))
      .flatMap((payload) => (payload._tag === "set" ? [payload.row.name] : []))
      .sort(),
  )

const item = (name: string) =>
  new GroceryItem({
    id: GroceryItemId.make(generateUuidBytes()),
    list: null,
    name,
    quantity: null,
    aisle: "Produce",
    recipeIds: null,
    completed: false,
    createdAt: DateTime.makeUnsafe(1000),
    updatedAt: DateTime.makeUnsafe(1000),
  })

const recipe = (title: string, ingredients: ReadonlyArray<string>) =>
  new ExtractedRecipe({
    title,
    imageUrl: null,
    prepTime: null,
    cookingTime: null,
    servings: null,
    ingredients: [
      new IngredientsComponent({
        name: "Ingredients",
        ingredients: ingredients.map(
          (name) => new Ingredient({ name, quantity: null, unit: null }),
        ),
      }),
    ],
    steps: [],
    sourceName: null,
  }).asRecipe()

const soup = recipe("Carrot soup", ["Carrots", "Onion", "Stock"])

test("adding a grocery item while the previous add is still writing keeps both", async () => {
  const added = await addedNames({
    runtime: "built",
    atom: groceryItemAddAtom,
    submit: (registry) => {
      submit(registry, groceryItemAddAtom, item("Carrots"))
      submit(registry, groceryItemAddAtom, item("Milk"))
    },
  })
  assert.deepEqual(added, ["Carrots", "Milk"])
})

test("grocery items added while the runtime is still building are all kept", async () => {
  const added = await addedNames({
    runtime: "cold",
    atom: groceryItemAddAtom,
    submit: (registry) => {
      submit(registry, groceryItemAddAtom, item("Carrots"))
      submit(registry, groceryItemAddAtom, item("Milk"))
    },
  })
  assert.deepEqual(added, ["Carrots", "Milk"])
})

test("the ingredients picked from a recipe keep being added after its button unmounts", async () => {
  const groups = groceryCandidates([soup], {
    inPantry: (name) => name === "Stock",
    ticked: () => HashSet.empty(),
  })
  const picked = selectedGroceryItems(
    groups,
    defaultGrocerySelection(groups),
    null,
  )
  const added = await addedNames({
    runtime: "built",
    atom: addToGroceriesAtom,
    submit: (registry) => {
      submit(registry, addToGroceriesAtom, picked)
    },
    unmountAfterSubmit: true,
  })
  assert.deepEqual(added, ["Carrots", "Onion"])
})

const decodeAlias = Schema.decodeUnknownSync(
  GroceryEvents.events[IngredientAliasEvent.tag].payloadSchemaBinary,
) as (bytes: unknown) => typeof IngredientAliasEvent.payload.Type

test("a user's rename pins the new name, and teaches no alias from the old one", async () => {
  const milk = item("Milk")
  const entries = await settledJournal({
    runtime: "built",
    atom: groceryItemEditAtom,
    submit: (registry) => {
      submit(registry, groceryItemEditAtom, {
        item: new GroceryItem({ ...milk, name: "Oat milk" }),
        previousName: milk.name,
      })
      // A change of case alone pins nothing.
      submit(registry, groceryItemEditAtom, {
        item: new GroceryItem({ ...milk, name: "oat milk" }),
        previousName: "Oat milk",
      })
    },
  })
  assert.deepEqual(
    entries
      .filter((entry) => entry.event === IngredientAliasEvent.tag)
      .map((entry) => decodeAlias(entry.payload)),
    [
      {
        _tag: "set",
        row: { name: "Oat milk", source: "user", canonical: null },
      },
    ],
  )
})
