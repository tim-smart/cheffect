import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { EventLogClient, eventLogAtom, writeEvent } from "@/EventLog"
import { beautifyGroceriesAtom } from "@/Groceries/atoms"
import { groceryCurrentListAtom } from "@/Groceries/currentList"
import { GroceryRepo } from "@/Groceries/Repo"
import { addGroceryItems, groceriesRuntime } from "@/Groceries/runtime"
import {
  GroceryItem,
  GroceryItemId,
  PANTRY_GROCERY_LIST_NAME,
} from "@/domain/GroceryItem"
import { RecipeId } from "@/domain/Recipe"
import { generateUuidBytes } from "@/lib/Id"
import { SettingEvent } from "@/Settings/Events"
import { layerCheffect } from "./harness/cheffect"

const item = (name: string, fields: Partial<GroceryItem> = {}) =>
  new GroceryItem({
    id: GroceryItemId.make(generateUuidBytes()),
    list: null,
    name,
    quantity: null,
    aisle: null,
    recipeIds: null,
    completed: false,
    createdAt: DateTime.makeUnsafe(1000),
    updatedAt: DateTime.makeUnsafe(1000),
    ...fields,
  })

test("AI beautify keeps recipe items whose renamed or merged names are in the pantry", async (t) => {
  const recipe = RecipeId.make(generateUuidBytes())
  const garlic = item("Garlic, minced", { quantity: "2", recipeIds: [recipe] })
  const cloves = item("Garlic cloves", { quantity: "1", recipeIds: [recipe] })
  const salt = item("Salt", { quantity: "1 tsp", recipeIds: [recipe] })
  const pantry = [
    item("Garlic", { list: PANTRY_GROCERY_LIST_NAME }),
    item("Salt", { list: PANTRY_GROCERY_LIST_NAME }),
  ]
  // Only the external API is substituted; beautify and its writes run as in
  // the app, including the deterministic pass and AI change handling.
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      id: "resp_beautify",
      model: "test",
      created_at: 1,
      output: [
        {
          id: "msg_beautify",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              annotations: [],
              text: JSON.stringify({
                updates: [
                  { id: salt.idString, name: "salt", quantity: "1 tsp" },
                ],
                merges: [
                  {
                    targetId: garlic.idString,
                    sourceIds: [cloves.idString],
                    name: "Garlic",
                    quantity: "3",
                  },
                ],
                aisles: [],
              }),
            },
          ],
        },
      ],
    }),
  )
  const registry = AtomRegistry.make({
    initialValues: [
      [
        eventLogAtom.layer,
        EventLogClient.layer.pipe(Layer.provideMerge(layerCheffect)),
      ],
      [groceryCurrentListAtom, null],
    ],
  })
  registry.mount(eventLogAtom)
  registry.mount(groceryCurrentListAtom)
  try {
    await Effect.gen(function* () {
      const context = yield* Atom.getResult(groceriesRuntime)
      yield* Effect.gen(function* () {
        const repo = yield* GroceryRepo
        yield* writeEvent(
          SettingEvent.set({
            id: "openAiApiKey",
            value: JSON.stringify({ _tag: "Some", value: "test-api-key" }),
          }),
        )
        yield* addGroceryItems(pantry)
        const previousPantry = yield* repo.list(PANTRY_GROCERY_LIST_NAME)
        yield* addGroceryItems([garlic, cloves, salt])
        registry.set(beautifyGroceriesAtom, undefined)
        yield* Atom.getResult(beautifyGroceriesAtom, { suspendOnWaiting: true })

        assert.deepEqual(
          (yield* repo.list(null)).map((item) => ({
            id: item.idString,
            name: item.name,
            quantity: item.quantity,
            recipeIds: item.recipeIds,
          })),
          [
            {
              id: garlic.idString,
              name: "Garlic",
              quantity: "3",
              recipeIds: [recipe],
            },
            {
              id: salt.idString,
              name: "salt",
              quantity: "1 tsp",
              recipeIds: [recipe],
            },
          ],
        )
        assert.deepEqual(
          yield* repo.list(PANTRY_GROCERY_LIST_NAME),
          previousPantry,
        )
      }).pipe(Effect.provideContext(context))
    }).pipe(
      Effect.timeout("10 seconds"),
      Effect.provideService(AtomRegistry.AtomRegistry, registry),
      Effect.runPromise,
    )
  } finally {
    registry.dispose()
  }
})
