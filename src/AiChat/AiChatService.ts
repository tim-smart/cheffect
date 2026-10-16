import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as AiChat from "effect/ai/Chat"
import * as Stream from "effect/Stream"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Layer from "effect/Layer"
import { openAiClientLayer } from "@/services/AiHelpers"
import { pipe } from "effect"
import * as Array from "effect/Array"
import * as AiResponse from "effect/ai/Response"
import * as Ref from "effect/Ref"
import { router } from "@/Router"
import {
  allGroceryItems$,
  allGroceryItemsArrayAtom,
  groceryListNames$,
} from "@/livestore/queries"
import { mealPlanEntriesAtom } from "@/MealPlan/atoms"
import { latestNoteByDay, MealPlanRepo } from "@/MealPlan/Repo"
import { mealPlanRuntime } from "@/MealPlan/runtime"
import {
  allMenus$,
  menuByIdAtom,
  menuDayNotes$,
  menuEntries$,
  menuEntriesAtom,
} from "@/Menus/atoms"
import { MenuEntry } from "@/domain/MenuEntry"
import { MenuDayNote } from "@/domain/MenuDayNote"
import { GroceryItem } from "@/domain/GroceryItem"
import {
  MealPlanEntry,
  MealPlanEntryId,
  MealPlanEntryIdFromString,
} from "@/domain/MealPlanEntry"
import { MealPlanDayNote } from "@/domain/MealPlanDayNote"
import * as Prompt from "effect/ai/Prompt"
import * as LanguageModel from "effect/ai/LanguageModel"
import { layerKvsLivestore } from "@/lib/kvs"
import { Store } from "@/livestore/atoms"
import { events, tables } from "@/livestore/schema"
import { queryDb, sql } from "@livestore/livestore"
import * as Option from "effect/Option"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Schema from "effect/Schema"
import { toolkit } from "@/domain/Toolkits"
import * as EventLog from "effect/eventlog/EventLog"
import type * as IndexedDb from "@effect/platform-browser/IndexedDb"
import type { QueryBuilder } from "@/IndexedDb"
import * as DateTime from "effect/DateTime"
import { aiChatModel, aiCountry, mealPlanWeekStart } from "@/Settings"
import {
  modifiedRecipeByIdAtom,
  recipeByIdAtom,
  recipeSelectedStep,
} from "@/Recipes/atoms"
import { RecipeRepo } from "@/Recipes/Repo"
import { RecipeExtractJobRepo } from "@/RecipeExtractJobs/Repo"
import { generateUuidBytes, uuidString } from "@/lib/Id"
import { type EventPayload, writeEvent } from "@/EventLog"
import { Menu } from "@/domain/Menu"
import { AiMemoryEntry } from "@/domain/AiMemoryEntry"
import { Timer, TimerId } from "@/domain/Timer"
import * as Duration from "effect/Duration"

const ToolkitLayer = toolkit.toLayer(
  Effect.gen(function* () {
    const store = yield* Store
    const registry = yield* AtomRegistry.AtomRegistry
    const recipes = yield* RecipeRepo
    const mealPlan = yield* MealPlanRepo
    const extractJobs = yield* RecipeExtractJobRepo
    const context = yield* Effect.context<
      EventLog.EventLog | QueryBuilder | IndexedDb.IndexedDb
    >()
    const write = (payload: EventPayload) =>
      writeEvent(payload).pipe(Effect.provideContext(context), Effect.orDie)
    return toolkit.of({
      SearchRecipes: Effect.fnUntraced(function* ({ query }) {
        const found = yield* recipes
          .search({ query, sortBy: "title" })
          .pipe(Effect.orDie)
        return { _tag: "Transient", value: found } as const
      }),
      RecipeById: Effect.fnUntraced(function* ({ id }) {
        const recipe = yield* recipes.byId(id).pipe(Effect.orDie)
        return { _tag: "Transient", value: Option.getOrNull(recipe) } as const
      }),
      CreateRecipe: Effect.fnUntraced(function* ({ recipe }) {
        const newRecipe = recipe.asRecipe()
        yield* write({ event: "RecipeCreated", payload: newRecipe })
        return {
          _tag: "Transient",
          value: { recipeId: newRecipe.idString },
        }
      }),
      SuggestRecipeEdit: Effect.fnUntraced(function* ({ recipe, recipeId }) {
        const original = yield* recipes.byId(recipeId).pipe(Effect.orDie)
        if (Option.isNone(original)) {
          return {
            _tag: "Transient",
            value: null,
          }
        }
        registry.set(modifiedRecipeByIdAtom(recipeId), Option.some(recipe))
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      ScaleRecipe: Effect.fnUntraced(function* ({ scale, recipeId }) {
        const original = yield* recipes.byId(recipeId).pipe(Effect.orDie)
        if (Option.isNone(original)) {
          return {
            _tag: "Transient",
            value: null,
          }
        }
        // Only the scale, so a concurrent edit to the recipe isn't undone.
        yield* write({
          event: "RecipeSetIngredientScale",
          payload: {
            id: original.value.id,
            ingredientScale: scale,
            updatedAt: yield* DateTime.now,
          },
        })
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      GroceryListNames: Effect.fnUntraced(function* () {
        const names = store.query(groceryListNames$)
        return { _tag: "Transient", value: names }
      }),
      GetGroceryList: Effect.fnUntraced(function* ({ list }) {
        const items = store.query(allGroceryItems$(list))
        return {
          _tag: "Transient",
          value: items,
        }
      }),
      AddGroceryItems: Effect.fnUntraced(function* ({ groceryItems }) {
        groceryItems.map((groceryItem) => {
          const newItem = new GroceryItem({
            ...groceryItem,
            id: crypto.randomUUID(),
            createdAt: DateTime.nowUnsafe(),
            updatedAt: DateTime.nowUnsafe(),
            completed: false,
          })
          store.commit(events.groceryItemAdded(newItem))
          return newItem
        })
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      UpdateGroceryItem: Effect.fnUntraced(function* ({
        groceryItem,
        groceryItemId,
      }) {
        const existing = store.query(groceryItemById$(groceryItemId))
        if (Option.isNone(existing)) {
          return { _tag: "Transient", value: null }
        }
        store.commit(
          events.groceryItemUpdated({
            ...existing.value,
            ...groceryItem,
            updatedAt: DateTime.nowUnsafe(),
          }),
        )
        return { _tag: "Transient", value: null }
      }),
      MergeGroceryItems: Effect.fnUntraced(function* ({
        targetId,
        sourceIds,
        mergedName,
        mergedQuantity,
      }) {
        const target = store.query(groceryItemById$(targetId))
        if (Option.isNone(target)) {
          return { _tag: "Transient", value: null }
        }

        // Collect all recipeIds from merged items
        const allRecipeIds = new Set<string>()
        if (target.value.recipeIds) {
          target.value.recipeIds.forEach((id) => allRecipeIds.add(id))
        }

        // Delete source items and collect their recipeIds
        for (const sourceId of sourceIds) {
          const source = store.query(groceryItemById$(sourceId))
          if (Option.isSome(source)) {
            if (source.value.recipeIds) {
              source.value.recipeIds.forEach((id) => allRecipeIds.add(id))
            }
            store.commit(events.groceryItemDeleted({ id: sourceId }))
          }
        }

        // Update target with merged info
        const recipeIdsArray = globalThis.Array.from(allRecipeIds)
        store.commit(
          events.groceryItemUpdated({
            id: targetId,
            name: mergedName ?? target.value.name,
            quantity: mergedQuantity ?? target.value.quantity,
            aisle: target.value.aisle,
            recipeIds:
              recipeIdsArray.length > 0
                ? (recipeIdsArray as [string, ...string[]])
                : null,
            completed: target.value.completed,
            updatedAt: DateTime.nowUnsafe(),
          }),
        )
        return { _tag: "Transient", value: null }
      }),
      DeleteGroceryItem: Effect.fnUntraced(function* ({ id }) {
        store.commit(events.groceryItemDeleted({ id }))
        return { _tag: "Transient", value: null }
      }),
      GetMenus: Effect.fnUntraced(function* () {
        const menus = store.query(allMenus$)
        return {
          _tag: "Transient",
          value: menus,
        }
      }),
      GetMenuEntries: Effect.fnUntraced(function* ({ menuId }) {
        const entries = store.query(menuEntries$(menuId))
        const notes = store.query(menuDayNotes$(menuId))
        return {
          _tag: "Transient",
          value: {
            entries,
            menuDayNotes: notes,
          },
        }
      }),
      SetMenuDayNote: Effect.fnUntraced(function* ({ menuId, day, note }) {
        const notes = store.query(menuDayNotes$(menuId))
        let existing = notes.find((n) => n.day === day)

        const trimmed = note.trim()
        if (trimmed.length === 0) {
          if (existing) {
            store.commit(events.menuDayNoteRemove({ id: existing.id }))
          }
          return {
            _tag: "Transient",
            value: null,
          }
        }

        if (existing) {
          if (existing.note !== trimmed) {
            store.commit(
              events.menuDayNoteUpdate({
                ...existing,
                note: trimmed,
                updatedAt: DateTime.nowUnsafe(),
              }),
            )
          }
          return {
            _tag: "Transient",
            value: null,
          }
        }

        store.commit(
          events.menuDayNoteAdd(
            MenuDayNote.fromForm({
              menuId,
              day,
              note: trimmed,
            }),
          ),
        )
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      CreateMenu: Effect.fnUntraced(function* ({ menu }) {
        const newMenu = new Menu({
          ...menu,
          id: crypto.randomUUID(),
          createdAt: DateTime.nowUnsafe(),
          updatedAt: DateTime.nowUnsafe(),
        })
        store.commit(events.menuAdd(newMenu))
        return {
          _tag: "Transient",
          value: newMenu,
        }
      }),
      AddMenuEntries: Effect.fnUntraced(function* ({ menuId, menuEntries }) {
        for (const menuEntry of menuEntries) {
          const recipe = yield* recipes
            .byId(menuEntry.recipeId)
            .pipe(Effect.orDie)
          if (Option.isNone(recipe)) continue
          store.commit(
            events.menuEntryAdd({
              id: crypto.randomUUID(),
              menuId,
              recipeId: recipe.value.idString,
              day: menuEntry.day,
              createdAt: DateTime.nowUnsafe(),
              updatedAt: DateTime.nowUnsafe(),
            }),
          )
        }
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      RemoveMenuEntry: Effect.fnUntraced(function* ({ id }) {
        store.commit(events.menuEntryRemove({ id }))
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      GetCurrentMealPlan: Effect.fnUntraced(function* () {
        const today = new Date().getDay()
        const thisWeek = DateTime.nowUnsafe().pipe(
          DateTime.setZone(DateTime.zoneMakeLocal()),
          DateTime.startOf("week"),
          DateTime.removeTime,
        )
        const weekStartsOn = registry.get(mealPlanWeekStart.atom).pipe(
          AsyncResult.value,
          Option.flatten,
          Option.getOrElse(() => 0 as const),
        )
        const startDay = DateTime.add(thisWeek, {
          days: today < weekStartsOn ? weekStartsOn - 7 : weekStartsOn,
        })
        const { entries, notes } = yield* mealPlan
          .week(startDay)
          .pipe(Effect.orDie)
        return {
          _tag: "Transient",
          value: {
            entries,
            mealPlanDayNotes: globalThis.Array.from(
              latestNoteByDay(notes).values(),
            ),
          },
        }
      }),
      SetMealPlanDayNote: Effect.fnUntraced(function* ({ day, note }) {
        const normalizedDay = day.pipe(
          DateTime.setZone(DateTime.zoneMakeLocal()),
          DateTime.removeTime,
        )
        const existing = latestNoteByDay(
          yield* mealPlan.notes.pipe(Effect.orDie),
        ).get(DateTime.formatIsoDate(normalizedDay))

        const trimmed = note.trim()
        if (trimmed.length === 0) {
          if (existing) {
            yield* write({
              event: "MealPlanDayNoteRemove",
              payload: { id: existing.id },
            })
          }
          return {
            _tag: "Transient",
            value: null,
          }
        }

        if (existing) {
          if (existing.note !== trimmed) {
            yield* write({
              event: "MealPlanDayNoteUpdate",
              payload: {
                ...existing,
                note: trimmed,
                updatedAt: DateTime.nowUnsafe(),
              },
            })
          }
          return {
            _tag: "Transient",
            value: null,
          }
        }

        yield* write({
          event: "MealPlanDayNoteAdd",
          payload: MealPlanDayNote.fromForm({
            day: normalizedDay,
            note: trimmed,
          }),
        })
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      AddMealPlanEntries: Effect.fnUntraced(function* ({ mealPlanEntries }) {
        for (const mealPlanEntry of mealPlanEntries) {
          const recipe = yield* recipes
            .byId(mealPlanEntry.recipeId)
            .pipe(Effect.orDie)
          if (Option.isNone(recipe)) continue
          yield* write({
            event: "MealPlanAdd",
            payload: {
              id: MealPlanEntryId.make(generateUuidBytes()),
              day: mealPlanEntry.day,
              recipeId: recipe.value.id,
            },
          })
        }
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      RemoveMealPlanEntry: Effect.fnUntraced(function* ({ id }) {
        const entryId = Schema.decodeOption(MealPlanEntryIdFromString)(id)
        if (Option.isSome(entryId)) {
          yield* write({
            event: "MealPlanRemove",
            payload: { id: entryId.value },
          })
        }
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      ImportRecipeFromUrl: Effect.fnUntraced(function* ({ url }) {
        const job = yield* extractJobs.add(url).pipe(Effect.orDie)
        return {
          _tag: "Terminal",
          value: { jobId: uuidString(job.id) },
        }
      }),
      SaveLearning: Effect.fnUntraced(function* ({ content }) {
        const newEntry = new AiMemoryEntry({
          id: crypto.randomUUID(),
          content,
          createdAt: DateTime.nowUnsafe(),
        })
        store.commit(events.aiMemoryEntryAdded(newEntry))
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      RemoveLearning: Effect.fnUntraced(function* ({ id }) {
        store.commit(events.aiMemoryEntryRemove({ id }))
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      StartTimer: Effect.fnUntraced(function* ({ label, duration }) {
        const durationMs = Math.max(0, Duration.toMillis(duration))
        if (durationMs <= 0) {
          return {
            _tag: "Transient",
            value: null,
          }
        }
        const now = DateTime.nowUnsafe()
        const timer = new Timer({
          id: TimerId.make(generateUuidBytes()),
          label,
          duration,
          expiresAt: DateTime.addDuration(now, duration),
          pausedRemaining: null,
          createdAt: now,
          updatedAt: now,
        })
        yield* write({ event: "TimerAdded", payload: timer })
        return {
          _tag: "Transient",
          value: {
            timerId: timer.idString,
            label: timer.label,
            durationMs,
          },
        }
      }),
    })
  }),
)

class AiChatService extends Context.Service<AiChatService>()(
  "cheffect/AiChat/AiChatService",
  {
    make: Effect.gen(function* () {
      const client = yield* OpenAiClient.OpenAiClient
      const registry = yield* AtomRegistry.AtomRegistry
      const store = KeyValueStore.toSchemaStore(
        yield* KeyValueStore.KeyValueStore,
        Prompt.Prompt,
      )
      const livestore = yield* Store
      const baseSystemPrompt = `You are a professional chef working for Cheffect. Your goal is to assist users in working with recipes, creating meal plan menus, and answering any cooking-related questions they may have.

You should be concise and informative in your responses, sacrificing some grammar for brevity when necessary. Avoid asking follow-up questions and instead provide direct answers or suggestions. You are a short, sharp and direct chef. "Yes chef!" is a good motto to follow.

When a user asks to fix issues with a recipe, be bold with your solutions. Don't just make small tweaks - find the root cause of the problem and suggest comprehensive changes that will truly improve the recipe.

## Tools

You have access to some tools that can be used to look up information about the user's recipes, grocery lists, and meal plans.

- Prefer using tools to show information rather than providing it directly.
- Always try to create recipes with images.
- When creating plans, use the menus feature to create lists.
- Avoid adding grocery items directly unless directly asked to do so.
- Use \`SaveLearning\` to save absolutely any information discovered that could benefit future interactions. This includes preferences, restrictions, allergies, household details, skill level, equipment, and any other relevant context. Always consolidate related learnings - for example, if you learn the user is vegetarian and later learn they also avoid gluten, update the existing dietary note to include both rather than creating separate entries.
- Use \`GetCurrentMealPlan\` for getting planned recipes and meals. For example "What's for dinner?"
- When using \`CreateRecipe\` or \`SuggestRecipeEdit\`, \`prepTime\` and \`cookingTime\` must be numeric minutes only (for example \`45\`). Never use seconds, milliseconds, or text values like "45 minutes".

*Important:*

Avoid providing information that is already available in the app.

- If the user is viewing a recipe, do not repeat the recipe details in your response.
- If you scale the recipe, only confirm the new scale and don't list out all ingredients again.

## Links

- Recipes can be linked to using \`[name](/recipes/$id)\`
- The grocery list can be linked to using \`[groceries](/groceries)\`
- The meal plan can be linked to using \`[meal plan](/plan)\`
- The menu list can be linked to using \`[menus](/menus)\`
- Individual menus can be linked to using \`[name](/menus/$id)\`

If you are able, always provide links to relevant sections of the app instead of plain text.

`

      const currentSystemPrompt = Effect.gen(function* () {
        const memoryEntries = livestore.query(aiMemoryEntries$)
        const memoryPrompt =
          memoryEntries.length > 0
            ? `## Learning notes

The following are notes from previous interactions with the user. They must be considered when responding.

${memoryEntries
  .map(
    (entry) => `#### Learning ID: ${entry.id}

${entry.content}`,
  )
  .join("\n\n")}

## Current context`
            : `## Current context`

        const location = router.state.location
        let currentTimeAndCountry = `The users local time is: ${new Date().toLocaleString()}. **Ignore any other sources of date and time.**`
        const country = yield* Atom.getResult(aiCountry.atom)
        if (Option.isSome(country)) {
          currentTimeAndCountry += ` The user is located in ${country.value}. All ingredient units should be provided in the measurement system commonly used in that country.`
        }

        const viewedRecipe = location.pathname.startsWith("/recipes/")
          ? yield* Atom.getResult(
              recipeByIdAtom(location.pathname.split("/")[2]),
            )
          : Option.none()

        if (location.pathname === "/") {
          return `${baseSystemPrompt}${memoryPrompt}

The user is currently browsing the a list of their recipes.

${currentTimeAndCountry}`
        } else if (Option.isSome(viewedRecipe)) {
          const recipe = viewedRecipe.value
          const selectedStep = registry.get(recipeSelectedStep(recipe.idString))

          return `${baseSystemPrompt}${memoryPrompt}

${currentTimeAndCountry}

The user is currently viewing the recipe titled "${recipe.title}".
They are currently focused on step ${selectedStep + 1} of the recipe (starts at 1).

${
  recipe.ingredientScale !== 1
    ? `The user is viewing a scaled version of the recipe. The scale factor is: ${recipe.ingredientScale}

`
    : ""
}Here are the details of the recipe (original scale shown):

${recipe.toXml()}

**Important:**

When suggesting modifications to the recipe, use the \`SuggestRecipeEdit\` tool to propose changes. **Important:** You must include ALL fields from the original recipe in your edit, not just the fields you are changing. Copy all existing values and only modify the specific fields that need to change.

When converting ingredient units, **do not** change the following units:

- tsp
- tbsp
- cups
`
        } else if (location.pathname === "/groceries") {
          const items = yield* Atom.getResult(allGroceryItemsArrayAtom)
          return `${baseSystemPrompt}${memoryPrompt}

${currentTimeAndCountry}

The user is currently viewing their grocery list. Here are the items on their grocery list:

${GroceryItem.toXml(items)}`
        } else if (location.pathname === "/plan") {
          const entries = yield* Atom.getResult(mealPlanEntriesAtom)
          return `${baseSystemPrompt}${memoryPrompt}

${currentTimeAndCountry}

The user is currently viewing their meal plan for the week. Here are the entries in their meal plan:

${MealPlanEntry.toXml(entries)}`
        } else if (location.pathname === "/menus") {
          return `${baseSystemPrompt}${memoryPrompt}

The user is currently browsing their list of menus.

${currentTimeAndCountry}`
        } else if (location.pathname.startsWith("/menus/")) {
          const id = location.pathname.split("/")[2]
          const menu = yield* Atom.getResult(menuByIdAtom(id))
          const menuEntries = (yield* Atom.get(menuEntriesAtom(id)))!

          return `${baseSystemPrompt}${memoryPrompt}

${currentTimeAndCountry}

The user is currently viewing the menu titled "${menu.name}".

Here are the details of the menu and its entries:

${menu.toXml()}

${MenuEntry.toXml(menuEntries)}`
        }

        return baseSystemPrompt + memoryPrompt + "\n\n" + currentTimeAndCountry
      })

      const chat = yield* store.get("ai-history").pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => AiChat.empty,
            onSome: AiChat.fromPrompt,
          }),
        ),
        Effect.catch(() => AiChat.empty),
      )
      registry.set(currentPromptAtom, yield* Ref.get(chat.history))

      yield* AtomRegistry.toStream(registry, persistenceUpdatesAtom).pipe(
        Stream.runForEach(
          Effect.fnUntraced(function* (json) {
            if (!json) return
            const history = Option.isNone(json)
              ? Prompt.empty
              : yield* Schema.decodeEffect(PromptJson)(json.value)
            yield* Ref.set(chat.history, history)
            registry.set(currentPromptAtom, history)
          }),
        ),
        Effect.forkScoped,
      )

      const tools = yield* toolkit

      const send = Effect.fnUntraced(
        function* (options: {
          readonly text: string
          readonly files: FileList | null
        }) {
          const modelString = Option.getOrElse(
            yield* Atom.getResult(aiChatModel.atom),
            () => "gpt-6.1-sol",
          )
          const model = yield* OpenAiLanguageModel.make({
            model: modelString,
            config: { reasoning: { effort: "medium" } },
          }).pipe(Effect.provideService(OpenAiClient.OpenAiClient, client))
          const message = yield* makeMessage(options)
          let history = (yield* Ref.get(chat.history)).pipe(
            Prompt.concat([message]),
            Prompt.setSystem(yield* currentSystemPrompt),
          )
          let historyNoFiles = filterFileParts(history)
          registry.set(currentPromptAtom, historyNoFiles)
          let parts = Array.empty<AiResponse.AnyPart>()
          while (true) {
            yield* pipe(
              LanguageModel.streamText({
                prompt: history,
                toolkit: tools,
                toolChoice: "auto",
              }),
              Stream.provideService(LanguageModel.LanguageModel, model),
              Stream.mapArray((chunk) => {
                parts.push(...chunk)
                return [Prompt.fromResponseParts(parts)] as const
              }),
              Stream.runForEach((response) => {
                registry.set(
                  currentPromptAtom,
                  Prompt.concat(historyNoFiles, response),
                )
                return Effect.void
              }),
            )
            history = Prompt.concat(history, Prompt.fromResponseParts(parts))
            historyNoFiles = filterFileParts(history)
            registry.set(currentPromptAtom, historyNoFiles)
            const errorPart = parts.findLast((part) => part.type === "error")
            if (errorPart) {
              historyNoFiles = Prompt.concat(historyNoFiles, [
                Prompt.makeMessage("assistant", {
                  content: [
                    Prompt.textPart({
                      text: "I'm sorry, there was an error chef. Do you have enough OpenAI credit?",
                    }),
                  ],
                }),
              ])
              registry.set(currentPromptAtom, historyNoFiles)
              break
            }
            const response = new LanguageModel.GenerateTextResponse<
              typeof toolkit.tools
            >(parts as any)
            const hasTextParts = parts.some(
              (part) => part.type === "text" || part.type === "text-delta",
            )
            const hasTerminalResult = response.toolResults.some(
              (toolResult) =>
                "_tag" in toolResult.result &&
                toolResult.result._tag === "Terminal",
            )
            parts = []

            // Only continue if there are no text parts AND no terminal results
            if (!errorPart && !hasTextParts && !hasTerminalResult) {
              continue
            }
            break
          }
        },
        Effect.ensuring(
          Effect.gen(function* () {
            const toPersist = registry.get(currentPromptAtom)
            yield* Ref.set(chat.history, toPersist)
            yield* Effect.orDie(store.set("ai-history", toPersist))
          }),
        ),
        Effect.catchCause(Effect.logError),
      )

      const clear = Ref.set(chat.history, Prompt.empty).pipe(
        Effect.andThen(store.remove("ai-history")),
      )

      return { send, clear } as const
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([layerKvsLivestore, ToolkitLayer]),
  )
}

// Same JSON codec KeyValueStore.toSchemaStore uses for "ai-history"
const PromptJson = Schema.fromJsonString(Schema.toCodecJson(Prompt.Prompt))

const runtime = Atom.runtime((get) =>
  AiChatService.layer.pipe(
    Layer.provide([
      get(openAiClientLayer),
      get(Store.layer),
      get(mealPlanRuntime.layer),
    ]),
  ),
).pipe(Atom.keepAlive)

export const currentPromptAtom = Atom.make<Prompt.Prompt>(Prompt.empty).pipe(
  Atom.keepAlive,
)

const persistenceUpdatesAtom = Store.makeQueryUnsafe(
  queryDb(tables.keyValues.select("value").where({ key: "ai-history" }), {
    map: Array.head,
  }),
)

export const sendAtom = runtime.fn<{
  readonly text: string
  readonly files: FileList | null
}>()(
  Effect.fnUntraced(function* (message) {
    const ai = yield* AiChatService
    return yield* ai.send(message)
  }),
)

export const clearAtom = runtime.fn<void>()(
  Effect.fnUntraced(function* (_, get) {
    const ai = yield* AiChatService
    yield* ai.clear
    get.set(currentPromptAtom, Prompt.empty)
  }),
)

const groceryItemById$ = (id: string) =>
  queryDb(
    {
      query: sql`SELECT * FROM grocery_items WHERE id = ?`,
      schema: GroceryItem.array,
      bindValues: [id],
    },
    {
      label: "AiChatService.groceryItemById",
      deps: [id],
      map: Array.head,
    },
  )

const aiMemoryEntries$ = queryDb({
  query: sql`SELECT * FROM ai_memory_entries ORDER BY createdAt DESC`,
  schema: AiMemoryEntry.array,
})

export const isVisualMessage = (
  message: Prompt.Message,
): message is
  Prompt.UserMessage | Prompt.AssistantMessage | Prompt.ToolMessage => {
  if (message.role === "system") return false
  return message.content.some(isVisualPart)
}

export const isVisualPart = (
  part:
    | Prompt.UserMessagePart
    | Prompt.AssistantMessagePart
    | Prompt.ToolMessagePart,
): boolean => part.type === "text" || part.type === "tool-result"

const makeMessage = Effect.fnUntraced(function* (options: {
  readonly text: string
  readonly files: FileList | null
}) {
  const content: Array<Prompt.UserMessagePart> = []
  if (options.files) {
    for (let i = 0; i < options.files.length; i++) {
      const file = options.files[i]
      const data = new Uint8Array(
        yield* Effect.promise(() => file.arrayBuffer()),
      )
      content.push(
        Prompt.filePart({
          mediaType: file.type,
          fileName: file.name,
          data,
        }),
      )
    }
  }
  content.push(Prompt.textPart({ text: options.text }))
  return Prompt.makeMessage("user", {
    content,
  })
})

const filterFileParts = (prompt: Prompt.Prompt): Prompt.Prompt => {
  const content = Array.empty<Prompt.Message>()
  for (const message of prompt.content) {
    if (message.role === "system") {
      continue
    } else if (message.role === "tool") {
      content.push(message)
      continue
    }

    let textPart: Prompt.TextPart | null = null
    let hasFiles = false
    const fileNames: string[] = []
    const parts = Array.empty<Prompt.AssistantMessagePart>()
    for (let i = 0; i < message.content.length; i++) {
      const part = message.content[i]
      if (!textPart && part.type === "text") {
        textPart = part
        continue
      } else if (part.type === "file") {
        hasFiles = true
        if ("fileName" in part && part.fileName) {
          fileNames.push(part.fileName)
        }
        continue
      }
      parts.push(part)
    }
    const attachmentLabel =
      fileNames.length > 0
        ? fileNames.map((n) => `[📎 ${n}]`).join(" ")
        : "[file attachment]"
    const updated = hasFiles
      ? Prompt.makeMessage(message.role, {
          content:
            message.role === "user"
              ? [
                  Prompt.textPart({
                    text: textPart
                      ? `${textPart.text}\n\n${attachmentLabel}`
                      : attachmentLabel,
                  }),
                  ...parts,
                ]
              : textPart
                ? [textPart, ...parts]
                : parts,
        })
      : message
    content.push(updated)
  }
  return Prompt.make(content)
}
