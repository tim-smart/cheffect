import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import { writeEvent } from "@/EventLog"
import { GroceryRepo } from "@/Groceries/Repo"
import { addGroceryItems } from "@/Groceries/runtime"
import { GroceryItem, GroceryItemId } from "@/domain/GroceryItem"
import { generateUuidBytes } from "@/lib/Id"
import { layerCheffect } from "./harness/cheffect"

// The grocery page skips re-rendering a row whose item is the same value as
// before, so checking one item off re-renders that row and not the whole
// list. That needs the items stream to hand back the items a write didn't
// touch as they were.

const item = (name: string) =>
  new GroceryItem({
    id: GroceryItemId.make(generateUuidBytes()),
    list: null,
    name,
    quantity: null,
    aisle: null,
    recipeIds: null,
    completed: false,
    createdAt: DateTime.nowUnsafe(),
    updatedAt: DateTime.nowUnsafe(),
  })

test("checking an item off keeps every other item the same value", () =>
  Effect.gen(function* () {
    const milk = item("Milk")
    const eggs = item("Eggs")
    yield* addGroceryItems([milk, eggs])
    const repo = yield* GroceryRepo
    const snapshots = yield* Queue.unbounded<ReadonlyArray<GroceryItem>>()
    yield* repo.itemsStream.pipe(
      Stream.runForEach((items) => Queue.offer(snapshots, items)),
      Effect.forkScoped,
    )
    const byName = (items: ReadonlyArray<GroceryItem>, name: string) =>
      items.find((item) => item.name === name)!
    const before = yield* Queue.take(snapshots)

    yield* writeEvent({
      event: "GroceryItemToggled",
      payload: { id: milk.id, completed: true },
    })
    let after = yield* Queue.take(snapshots)
    while (!byName(after, "Milk").completed) {
      after = yield* Queue.take(snapshots)
    }

    assert.equal(byName(after, "Eggs"), byName(before, "Eggs"))
  }).pipe(
    Effect.scoped,
    Effect.provide(GroceryRepo.layer.pipe(Layer.provideMerge(layerCheffect))),
    Effect.runPromise,
  ))
