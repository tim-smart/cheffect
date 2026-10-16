import * as Data from "effect/Data"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import { Store, storeIdAtom, syncEnabledAtom } from "./livestore/atoms"
import { events, LegacyRecipe, tables } from "./livestore/schema"
import { queryDb, sql } from "@livestore/livestore"
import { flow } from "effect"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { kvsRuntime } from "./atoms"
import * as DateTime from "effect/DateTime"
import * as Function from "effect/Function"
import { makeResultOptionAtom } from "./lib/atom"
import * as Effect from "effect/Effect"
import { exportGroceryItems$ } from "./livestore/queries"
import { Recipe, RecipeId, RecipeIdFromString } from "./domain/Recipe"
import { generateUuidBytes } from "./lib/Id"
import { importRecipesAtom, liveRecipesAtom } from "./Recipes/runtime"

const makeAtom = <S extends Schema.Codec<any, any>>(setting: Setting<S>) => {
  const schema: Schema.Codec<S["Type"], S["Encoded"]> = setting.schema
  const optionSchema = Schema.Option(schema)
  const read = Store.makeQuery(
    queryDb(
      {
        query: sql`SELECT value FROM settings WHERE id = ? AND value IS NOT NULL`,
        bindValues: [setting.name],
        schema: Schema.Array(
          Schema.Struct({
            value: Schema.OptionFromNullOr(Schema.fromJsonString(schema)),
          }),
        ),
      },
      {
        map: flow(
          Array.head,
          Option.flatMap((row) => row.value),
          setting.initialValue
            ? Option.orElse(() => Option.some(setting.initialValue!))
            : Function.identity,
        ),
      },
    ),
  )

  const cacheAtom =
    setting.cached &&
    Atom.kvs({
      runtime: kvsRuntime,
      key: `setting:${setting.name}`,
      schema: Schema.Option(schema),
      defaultValue: Option.none,
    })

  return Atom.writable(
    (get) => {
      const result = get(read)
      const isSuccess = AsyncResult.isSuccess(result)
      if (isSuccess || !cacheAtom) {
        if (cacheAtom && isSuccess) {
          get.set(cacheAtom, result.value)
        }
        return result
      }
      const cached = get(cacheAtom)
      if (Option.isSome(cached)) {
        return AsyncResult.success(cached)
      }
      return result
    },
    (ctx, newValue: Option.Option<S["Type"]>) => {
      const value = Schema.encodeSync(optionSchema)(newValue)
      ctx.set(
        Store.commit,
        events.settingsSet({
          id: setting.name,
          value,
          updatedAt: DateTime.nowUnsafe(),
        }),
      )
      if (cacheAtom) {
        ctx.set(cacheAtom, newValue)
      }
    },
  )
}

export class Setting<S extends Schema.Codec<any, any>> extends Data.Class<{
  name: string
  label: string
  schema: S
  schemaInput: Schema.Codec<Option.Option<S["Type"]>, string>
  initialValue?: S["Type"] | undefined
  cached?: boolean | undefined
  atomOverride?: Atom.Writable<
    AsyncResult.AsyncResult<Option.Option<S["Type"]>>,
    Option.Option<S["Type"]>
  >
}> {
  readonly atom = this.atomOverride ?? makeAtom(this)
}

const OptionFromString = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Option(Schema.String),
    SchemaTransformation.transform({
      decode: (s) => (s === "" ? Option.none() : Option.some(s)),
      encode: Option.match({
        onNone: () => "",
        onSome: (s) => s,
      }),
    }),
  ),
)

const AsSome = <S extends Schema.Codec<any, any>>(
  schema: S,
  orElse: () => S["Type"],
) =>
  schema.pipe(
    Schema.decodeTo(
      Schema.Option(Schema.toType(schema)),
      SchemaTransformation.transform({
        decode: (a: S["Type"]) => Option.some(a),
        encode: Option.getOrElse(orElse),
      }),
    ),
  )

export const openAiApiKey = new Setting({
  name: "openAiApiKey",
  label: "OpenAI API Key",
  schema: Schema.RedactedFromValue(Schema.String),
  schemaInput: OptionFromString.pipe(
    Schema.decodeTo(Schema.Option(Schema.RedactedFromValue(Schema.String))),
  ),
})

export const aiChatModel = new Setting({
  name: "aiChatModel",
  label: "AI chat model",
  schema: Schema.NonEmptyString,
  schemaInput: OptionFromString,
  initialValue: "gpt-6.1-sol",
})

export const openAiModel = new Setting({
  name: "openAiModel",
  label: "OpenAI Model",
  schema: Schema.NonEmptyString,
  schemaInput: OptionFromString,
  initialValue: "gpt-5.4",
})

export const aiCountry = new Setting({
  name: "aiCountry",
  label: "Country",
  schema: Schema.NonEmptyString,
  schemaInput: OptionFromString,
})

const WeekDays = Schema.Literals([0, 1, 2, 3, 4, 5, 6])

export const mealPlanWeekStart = new Setting({
  name: "mealPlanWeekStart",
  label: "Week Start",
  schema: WeekDays,
  schemaInput: AsSome(
    Schema.NumberFromString.pipe(Schema.decodeTo(WeekDays)),
    () => 0 as const,
  ),
  cached: true,
})

export const livestoreStoreId = new Setting({
  name: "livestoreStoreId",
  label: "LiveStore Store ID",
  schema: Schema.NonEmptyString,
  schemaInput: OptionFromString,
  atomOverride: makeResultOptionAtom(storeIdAtom),
})

export const livestoreSyncEnabled = new Setting({
  name: "livestoreSyncEnabled",
  label: "Enable Sync",
  schema: Schema.Boolean,
  schemaInput: AsSome(
    Schema.String.pipe(
      Schema.decodeTo(
        Schema.Boolean,
        SchemaTransformation.transform({
          decode: (s) => s === "true",
          encode: (b) => (b ? "true" : "false"),
        }),
      ),
    ),
    Function.constFalse,
  ),
  atomOverride: makeResultOptionAtom(syncEnabledAtom),
})

export const clearAiMemoryAtom = Atom.fn<void>()(
  Effect.fnUntraced(function* (_, get) {
    const store = get(Store.storeUnsafe)!
    store.commit(events.aiMemoryClear())
  }),
)

const ExportEvents = Schema.Array(
  Schema.Union([
    Schema.Struct({
      name: Schema.Literal(events.recipeCreated.name),
      args: events.recipeCreated.schema,
    }),
    Schema.Struct({
      name: Schema.Literal(events.groceryItemAdded.name),
      args: events.groceryItemAdded.schema,
    }),
    Schema.Struct({
      name: Schema.Literal(events.mealPlanAdd.name),
      args: events.mealPlanAdd.schema,
    }),
    Schema.Struct({
      name: Schema.Literal(events.menuAdd.name),
      args: events.menuAdd.schema,
    }),
    Schema.Struct({
      name: Schema.Literal(events.menuEntryAdd.name),
      args: events.menuEntryAdd.schema,
    }),
    Schema.Struct({
      name: Schema.Literal(events.menuDayNoteAdd.name),
      args: events.menuDayNoteAdd.schema,
    }),
    Schema.Struct({
      name: Schema.Literal(events.mealPlanDayNoteAdd.name),
      args: events.mealPlanDayNoteAdd.schema,
    }),
    Schema.Struct({
      name: Schema.Literal(events.aiMemoryEntryAdded.name),
      args: events.aiMemoryEntryAdded.schema,
    }),
  ]),
)
const ExportEventsJson = Schema.fromJsonString(ExportEvents)

export const exportAllAtom = Store.runtime.fn<void>()(
  Effect.fnUntraced(function* (_, get) {
    const store = yield* Store
    const out = Array.empty<(typeof ExportEvents.Type)[number]>()

    // recipes
    const allRecipes = yield* get.setResult(liveRecipesAtom, undefined)
    for (const recipe of allRecipes) {
      out.push(
        events.recipeCreated(
          LegacyRecipe.insert.make({ ...recipe, id: recipe.idString }),
        ),
      )
    }

    // groceries
    const allGroceryItems = store.query(exportGroceryItems$)
    for (const item of allGroceryItems) {
      out.push(events.groceryItemAdded(item))
    }

    // meal plan
    const mealPlanEntries = store.query(tables.mealPlan)
    for (const entry of mealPlanEntries) {
      out.push(events.mealPlanAdd(entry))
    }

    // menus
    const allMenus = store.query(tables.menus)
    for (const menu of allMenus) {
      out.push(events.menuAdd(menu))
    }

    // menu entries
    const allMenuEntries = store.query(tables.menuEntries)
    for (const entry of allMenuEntries) {
      out.push(events.menuEntryAdd(entry))
    }

    // menu day notes
    const allMenuDayNotes = store.query(tables.menuDayNotes)
    for (const note of allMenuDayNotes) {
      out.push(events.menuDayNoteAdd(note))
    }

    // meal plan day notes
    const allMealPlanDayNotes = store.query(tables.mealPlanDayNotes)
    for (const note of allMealPlanDayNotes) {
      out.push(events.mealPlanDayNoteAdd(note))
    }

    // AI memory
    const aiMemoryEntries = store.query(tables.aiMemoryEntries)
    for (const entry of aiMemoryEntries) {
      out.push(events.aiMemoryEntryAdded(entry))
    }

    const json = Schema.encodeSync(ExportEventsJson)(out)
    const file = new File([json], `cheffect-${new Date().toISOString()}.txt`, {
      type: "text/plain",
    })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] })
    }
  }),
)

// Recipes in the file go to the EventLog, everything else to LiveStore until
// its module moves over.
const recipeFromLegacy = (legacy: typeof LegacyRecipe.insert.Type) =>
  new Recipe({
    ...legacy,
    id: Option.getOrElse(
      Schema.decodeOption(RecipeIdFromString)(legacy.id),
      () => RecipeId.make(generateUuidBytes()),
    ),
    ingredientScale: 1,
  })

export const importAllAtom = Store.runtime.fn<File>()(
  Effect.fnUntraced(function* (file, get) {
    const text = yield* Effect.promise(() => file.text())
    const events = Schema.decodeSync(ExportEventsJson)(text)
    const store = yield* Store
    const recipes = Array.empty<Recipe>()
    for (const event of events) {
      if (event.name === "v1.RecipeCreated") {
        recipes.push(recipeFromLegacy(event.args))
        continue
      }
      // @effect-diagnostics-next-line tryCatchInEffectGen:off
      try {
        store.commit(event)
      } catch (e) {
        console.error("Failed to import event", event, e)
      }
    }
    yield* get.setResult(importRecipesAtom, recipes)
  }),
)
