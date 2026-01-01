import * as Effect from "effect/Effect"
import * as AiChat from "@effect/ai/Chat"
import * as Stream from "effect/Stream"
import { OpenAiLanguageModel } from "@effect/ai-openai"
import { Atom, Registry, Result } from "@effect-atom/atom-react"
import * as Layer from "effect/Layer"
import { openAiClientLayer } from "@/services/AiHelpers"
import { pipe } from "effect"
import * as Array from "effect/Array"
import * as AiResponse from "@effect/ai/Response"
import * as Ref from "effect/Ref"
import * as Chunk from "effect/Chunk"
import { router } from "@/Router"
import {
  allGroceryItems$,
  allGroceryItemsArrayAtom,
  groceryListNames$,
  mealPlanEntries$,
  mealPlanEntriesAtom,
  recipeByIdAtom,
} from "@/livestore/queries"
import {
  allMenus$,
  menuByIdAtom,
  menuEntries$,
  menuEntriesAtom,
} from "@/Menus/atoms"
import { MenuEntry } from "@/domain/MenuEntry"
import { GroceryItem } from "@/domain/GroceryItem"
import { MealPlanEntry } from "@/domain/MealPlanEntry"
import * as Prompt from "@effect/ai/Prompt"
import * as LanguageModel from "@effect/ai/LanguageModel"
import { layerKvsLivestore } from "@/lib/kvs"
import { Store } from "@/livestore/atoms"
import { events, tables } from "@/livestore/schema"
import { queryDb, sql } from "@livestore/livestore"
import * as Option from "effect/Option"
import * as KeyValueStore from "@effect/platform/KeyValueStore"
import * as Schema from "effect/Schema"
import { toolkit } from "@/domain/Toolkits"
import { Recipe } from "@/domain/Recipe"
import * as DateTime from "effect/DateTime"
import { aiCountry, mealPlanWeekStart } from "@/Settings"
import { modifiedRecipeByIdAtom, recipeSelectedStep } from "@/Recipes/atoms"
import { Menu } from "@/domain/Menu"
import { AiMemoryEntry } from "@/domain/AiMemoryEntry"

const ToolkitLayer = toolkit.toLayer(
  Effect.gen(function* () {
    const store = yield* Store
    const registry = yield* Registry.AtomRegistry
    return toolkit.of({
      SearchRecipes: Effect.fnUntraced(function* ({ query }) {
        const recipes = store.query(searchRecipes$(query))
        return { _tag: "Transient", value: recipes } as const
      }),
      RecipeById: Effect.fnUntraced(function* ({ id }) {
        const recipe = store.query(recipeById$(id))
        return { _tag: "Transient", value: Option.getOrNull(recipe) } as const
      }),
      CreateRecipe: Effect.fnUntraced(function* ({ recipe }) {
        const newRecipe = recipe.asRecipe()
        store.commit(events.recipeCreated(newRecipe))
        return {
          _tag: "Transient",
          value: { recipeId: newRecipe.id },
        }
      }),
      SuggestRecipeEdit: Effect.fnUntraced(function* ({ recipe, recipeId }) {
        const original = store.query(recipeById$(recipeId))
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
        const original = store.query(recipeById$(recipeId))
        if (Option.isNone(original)) {
          return {
            _tag: "Transient",
            value: null,
          }
        }
        const recipe = new Recipe({
          ...original.value,
          ingredientScale: scale,
        })
        store.commit(events.recipeUpdated(recipe))
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
            createdAt: DateTime.unsafeNow(),
            updatedAt: DateTime.unsafeNow(),
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
            updatedAt: DateTime.unsafeNow(),
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
            updatedAt: DateTime.unsafeNow(),
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
        return {
          _tag: "Transient",
          value: entries,
        }
      }),
      CreateMenu: Effect.fnUntraced(function* ({ menu }) {
        const newMenu = new Menu({
          ...menu,
          id: crypto.randomUUID(),
          createdAt: DateTime.unsafeNow(),
          updatedAt: DateTime.unsafeNow(),
        })
        store.commit(events.menuAdd(newMenu))
        return {
          _tag: "Transient",
          value: newMenu,
        }
      }),
      AddMenuEntries: Effect.fnUntraced(function* ({ menuId, menuEntries }) {
        menuEntries.flatMap((menuEntry) => {
          const recipe = store.query(recipeById$(menuEntry.recipeId))
          if (Option.isNone(recipe)) return []
          const id = crypto.randomUUID()
          store.commit(
            events.menuEntryAdd({
              id,
              menuId,
              recipeId: recipe.value.id,
              day: menuEntry.day,
              createdAt: DateTime.unsafeNow(),
              updatedAt: DateTime.unsafeNow(),
            }),
          )
          return id
        })
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
        const thisWeek = DateTime.unsafeNow().pipe(
          DateTime.setZone(DateTime.zoneMakeLocal()),
          DateTime.startOf("week"),
          DateTime.removeTime,
        )
        const weekStartsOn = registry.get(mealPlanWeekStart.atom).pipe(
          Result.value,
          Option.flatten,
          Option.getOrElse(() => 0 as const),
        )
        const startDay = DateTime.add(thisWeek, {
          days: today < weekStartsOn ? weekStartsOn - 7 : weekStartsOn,
        })
        const entries = store.query(mealPlanEntries$(startDay))
        return {
          _tag: "Transient",
          value: entries,
        }
      }),
      AddMealPlanEntries: Effect.fnUntraced(function* ({ mealPlanEntries }) {
        mealPlanEntries.map((mealPlanEntry) => {
          const id = crypto.randomUUID()
          store.commit(
            events.mealPlanAdd({
              id,
              day: mealPlanEntry.day,
              recipeId: mealPlanEntry.recipeId,
            }),
          )
          return id
        })
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      RemoveMealPlanEntry: Effect.fnUntraced(function* ({ id }) {
        store.commit(events.mealPlanRemove({ id }))
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      ImportRecipeFromUrl: Effect.fnUntraced(function* ({ url }) {
        const jobId = crypto.randomUUID()
        store.commit(
          events.recipeExtractJobAdded({
            id: jobId,
            url,
          }),
        )
        return {
          _tag: "Terminal",
          value: { jobId },
        }
      }),
      SaveLearning: Effect.fnUntraced(function* ({ content }) {
        const newEntry = new AiMemoryEntry({
          id: crypto.randomUUID(),
          content,
          createdAt: DateTime.unsafeNow(),
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
    })
  }),
)

class AiChatService extends Effect.Service<AiChatService>()(
  "cheffect/AiChat/AiChatService",
  {
    dependencies: [layerKvsLivestore, ToolkitLayer],
    scoped: Effect.gen(function* () {
      const model = yield* OpenAiLanguageModel.model("gpt-5.2-chat-latest", {
        reasoning: { effort: "medium" },
      })
      const registry = yield* Registry.AtomRegistry
      const store = (yield* KeyValueStore.KeyValueStore).forSchema(
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
        let currentTimeAndCountry = `The users local time is: ${new Date().toLocaleString()}.`
        const country = yield* Atom.getResult(aiCountry.atom)
        if (Option.isSome(country)) {
          currentTimeAndCountry += ` The user is located in ${country.value}. All ingredient units should be provided in the measurement system commonly used in that country.`
        }

        if (location.pathname === "/") {
          return `${baseSystemPrompt}${memoryPrompt}

The user is currently browsing the a list of their recipes.

${currentTimeAndCountry}`
        } else if (location.pathname.startsWith("/recipes/")) {
          const id = location.pathname.split("/")[2]
          const recipe = yield* Atom.getResult(recipeByIdAtom(id))
          const selectedStep = registry.get(recipeSelectedStep)

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
        Effect.orElse(() => AiChat.empty),
      )
      registry.set(currentPromptAtom, yield* Ref.get(chat.history))

      yield* Registry.toStream(registry, persistenceUpdatesAtom).pipe(
        Stream.runForEach(
          Effect.fnUntraced(function* (json) {
            if (!json) return
            const history = Option.isNone(json)
              ? Prompt.empty
              : yield* Schema.decode(Prompt.FromJson)(json.value)
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
          const message = yield* makeMessage(options)
          let history = (yield* Ref.get(chat.history)).pipe(
            Prompt.merge([message]),
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
              Stream.mapChunks((chunk) => {
                parts.push(...chunk)
                return Chunk.of(Prompt.fromResponseParts(parts))
              }),
              Stream.runForEach((response) => {
                registry.set(
                  currentPromptAtom,
                  Prompt.merge(historyNoFiles, response),
                )
                return Effect.void
              }),
            )
            history = Prompt.merge(history, Prompt.fromResponseParts(parts))
            historyNoFiles = filterFileParts(history)
            registry.set(currentPromptAtom, historyNoFiles)
            const errorPart = parts.findLast((part) => part.type === "error")
            if (errorPart) {
              historyNoFiles = Prompt.merge(historyNoFiles, [
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
        Effect.provide(model),
        Effect.catchAllCause(Effect.logError),
      )

      const clear = Ref.set(chat.history, Prompt.empty).pipe(
        Effect.zipRight(store.remove("ai-history")),
      )

      return { send, clear } as const
    }),
  },
) {}

const runtime = Atom.runtime((get) =>
  AiChatService.Default.pipe(
    Layer.provide([get(openAiClientLayer), get(Store.layer)]),
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

const searchRecipes$ = (query: string) =>
  queryDb(
    {
      query: sql`SELECT * FROM recipes WHERE deletedAt IS NULL AND title LIKE ? ORDER BY title ASC`,
      schema: Recipe.array,
      bindValues: [`%${query}%`],
    },
    {
      deps: [query],
      label: "AiChatService.searchRecipes",
    },
  )

const recipeById$ = (id: string) =>
  queryDb(
    {
      query: sql`SELECT * FROM recipes WHERE id = ?`,
      schema: Recipe.array,
      bindValues: [id],
    },
    {
      label: "AiChatService.recipeById",
      deps: [id],
      map: Array.head,
    },
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
): message is Prompt.UserMessage | Prompt.UserMessage | Prompt.ToolMessage => {
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
    const parts = Array.empty<Prompt.AssistantMessagePart>()
    for (let i = 0; i < message.content.length; i++) {
      const part = message.content[i]
      if (!textPart && part.type === "text") {
        textPart = part
        continue
      } else if (part.type === "file") {
        hasFiles = true
        continue
      }
      parts.push(part)
    }
    const updated = hasFiles
      ? Prompt.makeMessage(message.role, {
          content:
            message.role === "user"
              ? [
                  Prompt.textPart({
                    text: textPart
                      ? `${textPart.text}\n\n[file attachment]`
                      : "[file attachment]",
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
