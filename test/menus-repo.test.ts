import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as Reactivity from "effect/reactivity/Reactivity"
import { QueryBuilder, layerDatabase } from "@/IndexedDb"
import { MenusLayer } from "@/Menus"
import { MenuEvents } from "@/Menus/Events"
import { MenuRepo } from "@/Menus/Repo"
import { RecipesLayer } from "@/Recipes"
import { RecipeEvents } from "@/Recipes/Events"
import { RecipeRepo } from "@/Recipes/Repo"
import { MenuIdFromString } from "@/domain/Menu"
import { MenuEntryIdFromString } from "@/domain/MenuEntry"
import { MenuDayNoteIdFromString } from "@/domain/MenuDayNote"
import { uuidString } from "@/lib/Id"
import {
  Ingredient,
  IngredientsComponent,
  Recipe,
  RecipeIdFromString,
  Step,
} from "@/domain/Recipe"
import { testIdentity } from "./harness/eventlog"
import { layerFreshIndexedDb } from "./harness/indexeddb"

const schema = EventLog.schema(RecipeEvents, MenuEvents)

const layer = MenuRepo.layer.pipe(
  Layer.provideMerge(RecipeRepo.layer),
  Layer.provideMerge(
    EventLog.layer(schema, Layer.mergeAll(RecipesLayer, MenusLayer)).pipe(
      Layer.provide(EventJournal.layerIndexedDb({ database: "test_events" })),
      Layer.provide(Layer.effect(EventLog.Identity, testIdentity)),
    ),
  ),
  Layer.provideMerge(QueryBuilder.layer),
  Layer.provideMerge(layerDatabase),
  Layer.provideMerge(Reactivity.layer),
  Layer.provideMerge(layerFreshIndexedDb),
)

const recipeId = Schema.decodeSync(RecipeIdFromString)
const soup = recipeId("0193c7a0-1b2c-4def-8123-456789abcde1")
const menuIdString = "0193c7a0-1b2c-4def-8123-456789abcde2"
const menuId = Schema.decodeSync(MenuIdFromString)(menuIdString)
const entryId = Schema.decodeSync(MenuEntryIdFromString)
const noteId = Schema.decodeSync(MenuDayNoteIdFromString)

const recipe = (id: typeof soup, title: string) =>
  Recipe.insert.make({
    id,
    title,
    imageUrl: null,
    prepTime: Duration.minutes(10),
    cookingTime: Duration.minutes(30),
    servings: 4,
    ingredients: [
      new IngredientsComponent({
        name: title,
        ingredients: [
          new Ingredient({ name: "Salt", quantity: null, unit: null }),
        ],
      }),
    ],
    steps: [new Step({ text: "Cook.", tips: [] })],
    sourceName: null,
    rating: null,
    sourceUrl: null,
    createdAt: DateTime.makeUnsafe(1000),
    updatedAt: DateTime.makeUnsafe(1000),
    deletedAt: null,
  })

test("a shrink hides stored entries and notes past the inclusive last day until growth", async () => {
  await Effect.gen(function* () {
    const log = yield* EventLog.EventLog
    const repo = yield* MenuRepo
    const createdAt = DateTime.makeUnsafe(1000)
    yield* log.write({
      schema,
      event: "RecipeCreated",
      payload: recipe(soup, "Soup"),
    })
    yield* log.write({
      schema,
      event: "MenuAdd",
      payload: {
        id: menuId,
        name: "Week",
        days: 7,
        createdAt,
        updatedAt: createdAt,
      },
    })
    const rows = [
      {
        day: 5,
        entry: "0193c7a0-1b2c-4def-8123-0123456789a1",
        note: "0193c7a0-1b2c-4def-8123-0123456789b1",
      },
      {
        day: 6,
        entry: "0193c7a0-1b2c-4def-8123-0123456789a2",
        note: "0193c7a0-1b2c-4def-8123-0123456789b2",
      },
    ] as const
    for (const row of rows) {
      yield* log.write({
        schema,
        event: "MenuEntryAdd",
        payload: {
          id: entryId(row.entry),
          menuId,
          recipeId: soup,
          day: row.day,
          createdAt,
          updatedAt: createdAt,
        },
      })
      yield* log.write({
        schema,
        event: "MenuDayNoteAdd",
        payload: {
          id: noteId(row.note),
          menuId,
          day: row.day,
          note: `Day ${row.day}`,
          createdAt,
          updatedAt: createdAt,
        },
      })
    }

    const checkVisible = Effect.fnUntraced(function* (
      days: number,
      expected: ReadonlyArray<(typeof rows)[number]>,
    ) {
      yield* repo.menusStream.pipe(
        Stream.filter((menus) => menus.byId.get(menuIdString)?.days === days),
        Stream.runHead,
      )
      const detail = Option.getOrThrow(yield* repo.byId(menuIdString))
      assert.equal(detail.menu.days, days)
      assert.deepEqual(
        detail.entries.map((entry) => [entry.idString, entry.day]),
        expected.map((row) => [row.entry, row.day]),
      )
      assert.deepEqual(
        detail.notes.map((note) => [note.idString, note.day, note.note]),
        expected.map((row) => [row.note, row.day, `Day ${row.day}`]),
      )
      assert.equal(
        (yield* repo.recipeCounts).get(menuIdString),
        expected.length,
      )
    })
    yield* checkVisible(7, rows)

    // A shrink emits no removes for concurrent rows its writer never saw.
    yield* log.write({
      schema,
      event: "MenuUpdate",
      payload: {
        id: menuId,
        name: "Week",
        days: 5,
        updatedAt: DateTime.makeUnsafe(2000),
      },
    })
    yield* checkVisible(5, [rows[0]])
    assert.deepEqual(
      (yield* repo.entries).map((entry) => uuidString(entry.id)).sort(),
      rows.map((row) => row.entry).sort(),
    )
    assert.deepEqual(
      (yield* repo.notes).map((note) => uuidString(note.id)).sort(),
      rows.map((row) => row.note).sort(),
    )

    yield* log.write({
      schema,
      event: "MenuUpdate",
      payload: {
        id: menuId,
        name: "Week",
        days: 7,
        updatedAt: DateTime.makeUnsafe(3000),
      },
    })
    yield* checkVisible(7, rows)
  }).pipe(Effect.timeout("5 seconds"), Effect.provide(layer), Effect.runPromise)
})
