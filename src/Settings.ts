import * as Data from "effect/Data"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import { Store, storeIdAtom, syncEnabledAtom } from "./livestore/atoms"
import {
  events,
  LegacyAiMemoryEntry,
  LegacyGroceryItem,
  LegacyMealPlanDayNote,
  LegacyMenu,
  LegacyRecipe,
} from "./livestore/schema"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { kvsRuntime } from "./atoms"
import * as Function from "effect/Function"
import { makeResultOptionAtom } from "./lib/atom"
import * as Effect from "effect/Effect"
import { Recipe, RecipeId, RecipeIdFromString } from "./domain/Recipe"
import { generateUuidBytes, uuidString } from "./lib/Id"
import { importRecipesAtom, liveRecipesAtom } from "./Recipes/runtime"
import {
  MealPlanDayNote,
  MealPlanDayNoteId,
  MealPlanDayNoteIdFromString,
} from "./domain/MealPlanDayNote"
import {
  MealPlanEntryId,
  MealPlanEntryIdFromString,
} from "./domain/MealPlanEntry"
import type { PlannedEntry } from "./MealPlan/Repo"
import { exportMealPlanAtom, importMealPlanAtom } from "./MealPlan/runtime"
import { Menu, MenuId, MenuIdFromString } from "./domain/Menu"
import { MenuDayNoteId, MenuDayNoteIdFromString } from "./domain/MenuDayNote"
import { MenuEntryId, MenuEntryIdFromString } from "./domain/MenuEntry"
import type { StoredMenuDayNote, StoredMenuEntry } from "./Menus/Repo"
import { exportMenusAtom, importMenusAtom } from "./Menus/runtime"
import {
  GroceryItem,
  GroceryItemId,
  GroceryItemIdFromString,
} from "./domain/GroceryItem"
import {
  exportGroceryItemsAtom,
  importGroceryItemsAtom,
} from "./Groceries/runtime"
import { eventLogAtom, writeEventAtom } from "./EventLog"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { SettingsRepo } from "./Settings/Repo"
import {
  AiMemoryEntry,
  AiMemoryEntryId,
  AiMemoryEntryIdFromString,
} from "./domain/AiMemoryEntry"
import { exportAiMemoryAtom, importAiMemoryAtom } from "./AiChat/runtime"

// Every setting's encoded value, kept live from the `settings` snapshot.
const settingsRuntime = Atom.runtime((get) =>
  SettingsRepo.layer.pipe(Layer.provideMerge(get(eventLogAtom.layer))),
).pipe(Atom.keepAlive)

const settingValuesAtom = settingsRuntime
  .atom(SettingsRepo.useSync((_) => _.stream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

// A setting's value is its encoded `Option` as a JSON string. A cleared
// setting, or one that no longer decodes, reads as `None` and falls back to
// the initial value.
const makeAtom = <S extends Schema.Codec<any, any>>(setting: Setting<S>) => {
  const schema: Schema.Codec<S["Type"], S["Encoded"]> = setting.schema
  const valueSchema = Schema.fromJsonString(
    Schema.toCodecJson(Schema.Option(schema)),
  )
  const decodeValue = Schema.decodeUnknownOption(valueSchema)
  const read = Atom.make((get) =>
    AsyncResult.map(get(settingValuesAtom), (values) =>
      Option.fromUndefinedOr(values.get(setting.name)).pipe(
        Option.flatMap(decodeValue),
        Option.flatten,
        setting.initialValue
          ? Option.orElse(() => Option.some(setting.initialValue!))
          : Function.identity,
      ),
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
      ctx.set(writeEventAtom, {
        event: "SettingsSet",
        payload: {
          id: setting.name,
          value: Schema.encodeSync(valueSchema)(newValue),
        },
      })
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

export const exportAllAtom = Atom.fn<void>()(
  Effect.fnUntraced(function* (_, get) {
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
    const groceryItems = yield* get.setResult(exportGroceryItemsAtom, undefined)
    for (const item of groceryItems) {
      out.push(
        events.groceryItemAdded(
          LegacyGroceryItem.insert.make({
            ...item,
            id: item.idString,
            recipeIds: item.recipeIds
              ? Array.map(item.recipeIds, uuidString)
              : null,
          }),
        ),
      )
    }

    // meal plan
    const mealPlan = yield* get.setResult(exportMealPlanAtom, undefined)
    for (const entry of mealPlan.entries) {
      out.push(
        events.mealPlanAdd({
          id: uuidString(entry.id),
          recipeId: uuidString(entry.recipeId),
          day: entry.day,
        }),
      )
    }

    // menus
    const menus = yield* get.setResult(exportMenusAtom, undefined)
    for (const menu of menus.menus) {
      out.push(
        events.menuAdd(LegacyMenu.insert.make({ ...menu, id: menu.idString })),
      )
    }

    // menu entries
    for (const entry of menus.entries) {
      out.push(
        events.menuEntryAdd({
          ...entry,
          id: uuidString(entry.id),
          menuId: uuidString(entry.menuId),
          recipeId: uuidString(entry.recipeId),
        }),
      )
    }

    // menu day notes
    for (const note of menus.notes) {
      out.push(
        events.menuDayNoteAdd({
          ...note,
          id: uuidString(note.id),
          menuId: uuidString(note.menuId),
        }),
      )
    }

    // meal plan day notes
    for (const note of mealPlan.notes) {
      out.push(
        events.mealPlanDayNoteAdd(
          LegacyMealPlanDayNote.insert.make({ ...note, id: note.idString }),
        ),
      )
    }

    // AI memory
    const aiMemoryEntries = yield* get.setResult(exportAiMemoryAtom, undefined)
    for (const entry of aiMemoryEntries) {
      out.push(
        events.aiMemoryEntryAdded(
          LegacyAiMemoryEntry.insert.make({ ...entry, id: entry.idString }),
        ),
      )
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

// Recipes, groceries, the meal plan, menus and AI memory in the file go to
// the EventLog, everything else to LiveStore until its module moves over.
const recipeFromLegacy = (legacy: typeof LegacyRecipe.insert.Type) =>
  new Recipe({
    ...legacy,
    id: Option.getOrElse(
      Schema.decodeOption(RecipeIdFromString)(legacy.id),
      () => RecipeId.make(generateUuidBytes()),
    ),
    ingredientScale: 1,
  })

// An entry whose recipe id isn't a UUID can never join with a recipe, so it
// is dropped.
const mealPlanEntryFromLegacy = (
  legacy: typeof events.mealPlanAdd.schema.Type,
): Option.Option<PlannedEntry> =>
  Option.map(
    Schema.decodeOption(RecipeIdFromString)(legacy.recipeId),
    (recipeId) => ({
      id: Option.getOrElse(
        Schema.decodeOption(MealPlanEntryIdFromString)(legacy.id),
        () => MealPlanEntryId.make(generateUuidBytes()),
      ),
      recipeId,
      day: legacy.day,
    }),
  )

const mealPlanDayNoteFromLegacy = (
  legacy: typeof LegacyMealPlanDayNote.insert.Type,
) =>
  new MealPlanDayNote({
    ...legacy,
    id: Option.getOrElse(
      Schema.decodeOption(MealPlanDayNoteIdFromString)(legacy.id),
      () => MealPlanDayNoteId.make(generateUuidBytes()),
    ),
  })

// A recipe id that isn't a UUID can never join with a recipe, so it is
// dropped from the item.
const groceryItemFromLegacy = (
  legacy: typeof LegacyGroceryItem.insert.Type,
) => {
  const recipeIds = (legacy.recipeIds ?? []).flatMap((id) =>
    Option.toArray(Schema.decodeOption(RecipeIdFromString)(id)),
  )
  return new GroceryItem({
    ...legacy,
    id: Option.getOrElse(
      Schema.decodeOption(GroceryItemIdFromString)(legacy.id),
      () => GroceryItemId.make(generateUuidBytes()),
    ),
    list: legacy.list ?? null,
    recipeIds: Array.isArrayNonEmpty(recipeIds) ? recipeIds : null,
  })
}

const aiMemoryEntryFromLegacy = (
  legacy: typeof LegacyAiMemoryEntry.insert.Type,
) =>
  new AiMemoryEntry({
    ...legacy,
    id: Option.getOrElse(
      Schema.decodeOption(AiMemoryEntryIdFromString)(legacy.id),
      () => AiMemoryEntryId.make(generateUuidBytes()),
    ),
  })

// A menu id that isn't a UUID gets a new one, the same for the menu and every
// entry and note that names it.
const makeMenuIdFromLegacy = () => {
  const ids = new Map<string, MenuId>()
  return (legacy: string): MenuId => {
    let id = ids.get(legacy)
    if (id === undefined) {
      id = Option.getOrElse(Schema.decodeOption(MenuIdFromString)(legacy), () =>
        MenuId.make(generateUuidBytes()),
      )
      ids.set(legacy, id)
    }
    return id
  }
}

// An entry whose recipe id isn't a UUID can never join with a recipe, so it
// is dropped.
const menuEntryFromLegacy = (
  legacy: typeof events.menuEntryAdd.schema.Type,
  menuId: (legacy: string) => MenuId,
): Option.Option<StoredMenuEntry> =>
  Option.map(
    Schema.decodeOption(RecipeIdFromString)(legacy.recipeId),
    (recipeId) => ({
      ...legacy,
      id: Option.getOrElse(
        Schema.decodeOption(MenuEntryIdFromString)(legacy.id),
        () => MenuEntryId.make(generateUuidBytes()),
      ),
      menuId: menuId(legacy.menuId),
      recipeId,
    }),
  )

const menuDayNoteFromLegacy = (
  legacy: typeof events.menuDayNoteAdd.schema.Type,
  menuId: (legacy: string) => MenuId,
): StoredMenuDayNote => ({
  ...legacy,
  id: Option.getOrElse(
    Schema.decodeOption(MenuDayNoteIdFromString)(legacy.id),
    () => MenuDayNoteId.make(generateUuidBytes()),
  ),
  menuId: menuId(legacy.menuId),
})

export const importAllAtom = Store.runtime.fn<File>()(
  Effect.fnUntraced(function* (file, get) {
    const text = yield* Effect.promise(() => file.text())
    const events = Schema.decodeSync(ExportEventsJson)(text)
    const store = yield* Store
    const recipes = Array.empty<Recipe>()
    const groceryItems = Array.empty<GroceryItem>()
    const mealPlanEntries = Array.empty<PlannedEntry>()
    const mealPlanNotes = Array.empty<MealPlanDayNote>()
    const menus = Array.empty<Menu>()
    const menuEntries = Array.empty<StoredMenuEntry>()
    const menuNotes = Array.empty<StoredMenuDayNote>()
    const aiMemoryEntries = Array.empty<AiMemoryEntry>()
    const menuId = makeMenuIdFromLegacy()
    for (const event of events) {
      if (event.name === "v1.RecipeCreated") {
        recipes.push(recipeFromLegacy(event.args))
        continue
      }
      if (event.name === "v1.GroceryItemAdded") {
        groceryItems.push(groceryItemFromLegacy(event.args))
        continue
      }
      if (event.name === "v1.MealPlanAdd") {
        const entry = mealPlanEntryFromLegacy(event.args)
        if (Option.isSome(entry)) mealPlanEntries.push(entry.value)
        continue
      }
      if (event.name === "v1.MealPlanDayNoteAdd") {
        mealPlanNotes.push(mealPlanDayNoteFromLegacy(event.args))
        continue
      }
      if (event.name === "v1.MenuAdd") {
        menus.push(new Menu({ ...event.args, id: menuId(event.args.id) }))
        continue
      }
      if (event.name === "v1.MenuEntryAdd") {
        const entry = menuEntryFromLegacy(event.args, menuId)
        if (Option.isSome(entry)) menuEntries.push(entry.value)
        continue
      }
      if (event.name === "v1.MenuDayNoteAdd") {
        menuNotes.push(menuDayNoteFromLegacy(event.args, menuId))
        continue
      }
      if (event.name === "v1.AIMemoryEntryAdded") {
        aiMemoryEntries.push(aiMemoryEntryFromLegacy(event.args))
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
    yield* get.setResult(importGroceryItemsAtom, groceryItems)
    yield* get.setResult(importMealPlanAtom, {
      entries: mealPlanEntries,
      notes: mealPlanNotes,
    })
    yield* get.setResult(importMenusAtom, {
      menus,
      entries: menuEntries,
      notes: menuNotes,
    })
    yield* get.setResult(importAiMemoryAtom, aiMemoryEntries)
  }),
)
