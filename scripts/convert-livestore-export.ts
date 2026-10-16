// Converts an old LiveStore "Export all data" file into the new export
// format, for "Import all data":
//
//   node --import tsx scripts/convert-livestore-export.ts <in> <out>
//
// The old payloads are a frozen copy of what LiveStore exported, so this keeps
// working once `src/livestore/` is gone. The new side comes from `src/`, so the
// output can't drift from what the app reads. Ids and timestamps are kept, and
// every grocery item with an aisle also teaches it through
// `IngredientAisleSet`, the way old imports learned aisles. The first item that
// doesn't decode stops the conversion and nothing is written.

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import * as Console from "effect/Console"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"
import { Argument, Command } from "effect/cli"
import { ExportEvent, ExportFileJson } from "@/ExportFile"

// Old export payloads, as Effect 3 encoded them: string ids, epoch millis,
// `completed` as a bit, and recipe ingredients and steps as JSON strings.

const Millis = Schema.Finite
const Id = Schema.String

const OldIngredient = Schema.Struct({
  name: Schema.String,
  quantity: Schema.NullOr(Schema.Finite),
  unit: Schema.NullOr(Schema.String),
})

const OldRecipe = Schema.Struct({
  id: Id,
  title: Schema.String,
  imageUrl: Schema.NullOr(Schema.String),
  prepTime: Schema.NullOr(Millis),
  cookingTime: Schema.NullOr(Millis),
  servings: Schema.NullOr(Schema.Finite),
  ingredients: Schema.fromJsonString(
    Schema.Array(
      Schema.Struct({
        name: Schema.String,
        ingredients: Schema.Array(OldIngredient),
      }),
    ),
  ),
  steps: Schema.fromJsonString(
    Schema.Array(
      Schema.Struct({ text: Schema.String, tips: Schema.Array(Schema.String) }),
    ),
  ),
  sourceName: Schema.NullOr(Schema.String),
  sourceUrl: Schema.NullOr(Schema.String),
  rating: Schema.NullOr(Schema.Finite),
  createdAt: Millis,
  updatedAt: Millis,
  deletedAt: Schema.NullOr(Millis),
})

const OldGroceryItem = Schema.Struct({
  id: Id,
  list: Schema.optionalKey(Schema.NullOr(Schema.String)),
  name: Schema.String,
  quantity: Schema.NullOr(Schema.String),
  aisle: Schema.NullOr(Schema.String),
  recipeIds: Schema.NullOr(Schema.NonEmptyArray(Id)),
  completed: Schema.Literals([0, 1]),
  createdAt: Millis,
  updatedAt: Millis,
})

const OldMealPlanEntry = Schema.Struct({
  id: Id,
  recipeId: Id,
  day: Schema.String,
})

const OldMealPlanDayNote = Schema.Struct({
  id: Id,
  day: Schema.String,
  note: Schema.String,
  createdAt: Millis,
  updatedAt: Millis,
})

const OldMenu = Schema.Struct({
  id: Id,
  name: Schema.String,
  days: Schema.Finite,
  createdAt: Millis,
  updatedAt: Millis,
})

const OldMenuEntry = Schema.Struct({
  id: Id,
  menuId: Id,
  recipeId: Id,
  day: Schema.Finite,
  createdAt: Millis,
  updatedAt: Millis,
})

const OldMenuDayNote = Schema.Struct({
  id: Id,
  menuId: Id,
  day: Schema.Finite,
  note: Schema.String,
  createdAt: Millis,
  updatedAt: Millis,
})

const OldAiMemoryEntry = Schema.Struct({
  id: Id,
  content: Schema.String,
  createdAt: Millis,
})

const oldEvent = <const Name extends string, S extends Schema.Top>(
  name: Name,
  args: S,
) => Schema.Struct({ name: Schema.Literal(name), args })

const OldExportEvent = Schema.Union([
  oldEvent("v1.RecipeCreated", OldRecipe),
  oldEvent("v1.GroceryItemAdded", OldGroceryItem),
  oldEvent("v1.MealPlanAdd", OldMealPlanEntry),
  oldEvent("v1.MealPlanDayNoteAdd", OldMealPlanDayNote),
  oldEvent("v1.MenuAdd", OldMenu),
  oldEvent("v1.MenuEntryAdd", OldMenuEntry),
  oldEvent("v1.MenuDayNoteAdd", OldMenuDayNote),
  oldEvent("v1.AIMemoryEntryAdded", OldAiMemoryEntry),
])
type OldExportEvent = typeof OldExportEvent.Type

const OldExport = Schema.fromJsonString(Schema.Array(Schema.Unknown))

// The new events for one old item, in their encoded form. Decoding them with
// the app's own schema is what parses the ids as UUIDs.
const convertEvent = (old: OldExportEvent): ReadonlyArray<unknown> => {
  switch (old.name) {
    case "v1.RecipeCreated":
      return [{ tag: "RecipeCreated", payload: old.args }]
    case "v1.GroceryItemAdded": {
      const { completed, list, ...item } = old.args
      const added = {
        tag: "GroceryItemAdded",
        payload: { ...item, list: list ?? null, completed: completed === 1 },
      }
      if (item.aisle === null) return [added]
      return [
        added,
        {
          tag: "IngredientAisleSet",
          payload: { name: item.name, aisle: item.aisle },
        },
      ]
    }
    case "v1.MealPlanAdd":
      return [{ tag: "MealPlanAdd", payload: old.args }]
    case "v1.MealPlanDayNoteAdd":
      return [{ tag: "MealPlanDayNoteAdd", payload: old.args }]
    case "v1.MenuAdd":
      return [{ tag: "MenuAdd", payload: old.args }]
    case "v1.MenuEntryAdd":
      return [{ tag: "MenuEntryAdd", payload: old.args }]
    case "v1.MenuDayNoteAdd":
      return [{ tag: "MenuDayNoteAdd", payload: old.args }]
    case "v1.AIMemoryEntryAdded":
      return [{ tag: "AIMemoryEntryAdded", payload: old.args }]
  }
}

class ConvertError extends Data.TaggedError("ConvertError")<{
  readonly message: string
}> {}

const strict = { onExcessProperty: "error" } as const
const decodeOld = Schema.decodeUnknownEffect(OldExportEvent, strict)
const decodeNew = Schema.decodeUnknownEffect(ExportEvent, strict)

const convertItem = (item: unknown, index: number) =>
  decodeOld(item).pipe(
    Effect.flatMap((old) =>
      Effect.forEach(convertEvent(old), (event) => decodeNew(event)),
    ),
    Effect.mapError(
      (error) =>
        new ConvertError({ message: `item ${index}: ${error.message}` }),
    ),
  )

const convert = Command.make(
  "convert-livestore-export",
  {
    input: Argument.String("in"),
    output: Argument.String("out"),
  },
  Effect.fnUntraced(function* ({ input, output }) {
    const fs = yield* FileSystem.FileSystem
    const items = yield* fs.readFileString(input).pipe(
      Effect.flatMap(Schema.decodeEffect(OldExport)),
      Effect.mapError(
        (error) => new ConvertError({ message: `${input}: ${error.message}` }),
      ),
    )
    const events = (yield* Effect.forEach(items, convertItem)).flat()
    const json = yield* Schema.encodeEffect(ExportFileJson)({
      format: "cheffect-export",
      version: 1,
      events,
    })
    yield* fs.writeFileString(output, json)
    yield* Console.log(`Wrote ${events.length} events to ${output}`)
  }),
).pipe(
  Command.withDescription(
    "Convert an old LiveStore export into the cheffect-export format",
  ),
)

convert.pipe(
  Command.run({ version: "1.0.0" }),
  Effect.catchTag("ConvertError", (error) =>
    Console.error(error.message).pipe(
      Effect.andThen(
        Effect.sync(() => {
          process.exitCode = 1
        }),
      ),
    ),
  ),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
