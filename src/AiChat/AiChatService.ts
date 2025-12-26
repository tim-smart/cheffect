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
import { mealPlanWeekStart } from "@/Settings"
import { modifiedRecipeByIdAtom, recipeSelectedStep } from "@/Recipes/atoms"
import { Menu } from "@/domain/Menu"

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
        registry.set(modifiedRecipeByIdAtom(recipeId), recipe)
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      GetGroceryList: Effect.fnUntraced(function* () {
        const items = store.query(allGroceryItems$)
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
        id,
        name,
        quantity,
        aisle,
      }) {
        const existing = store.query(groceryItemById$(id))
        if (Option.isNone(existing)) {
          return { _tag: "Transient", value: null }
        }
        store.commit(
          events.groceryItemUpdated({
            id,
            name: name ?? existing.value.name,
            quantity: quantity !== undefined ? quantity : existing.value.quantity,
            aisle: aisle !== undefined ? aisle : existing.value.aisle,
            recipeIds: existing.value.recipeIds,
            completed: existing.value.completed,
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
        const recipeIdsArray = Array.from(allRecipeIds)
        store.commit(
          events.groceryItemUpdated({
            id: targetId,
            name: mergedName ?? target.value.name,
            quantity: mergedQuantity ?? target.value.quantity,
            aisle: target.value.aisle,
            recipeIds: recipeIdsArray.length > 0 ? recipeIdsArray : null,
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
    })
  }),
)

class AiChatService extends Effect.Service<AiChatService>()(
  "cheffect/AiChat/AiChatService",
  {
    dependencies: [layerKvsLivestore, ToolkitLayer],
    scoped: Effect.gen(function* () {
      const model = yield* OpenAiLanguageModel.model("gpt-5.2")
      const registry = yield* Registry.AtomRegistry
      const store = (yield* KeyValueStore.KeyValueStore).forSchema(
        Prompt.Prompt,
      )

      const baseSystemPrompt = `You are a helpful AI assistant specialized in providing information about recipes, meal planning, and cooking tips. Your goal is to assist users in finding recipes, suggesting meal plans, and answering any cooking-related questions they may have.

You should be concise and informative in your responses, sacrificing some grammar for brevity when necessary.

You have access to some tools that can be used to look up information about the user's recipes, grocery lists, and meal plans. Use these tools whenever relevant information is needed to answer the user's questions accurately.

- Recipes can be linked to using \`[name](/recipes/$id)\`
- The grocery list can be linked to using \`[groceries](/groceries)\`
- The meal plan can be linked to using \`[meal plan](/plan)\`
- The menu list can be linked to using \`[menus](/menus)\``

      const currentSystemPrompt = Effect.gen(function* () {
        const location = router.state.location
        const currentTime = `The current date and time is: ${new Date().toLocaleString()}.`

        if (location.pathname === "/") {
          return `${baseSystemPrompt}

The user is currently browsing the a list of their recipes.

${currentTime}`
        } else if (location.pathname.startsWith("/recipes/")) {
          const id = location.pathname.split("/")[2]
          const recipe = yield* Atom.getResult(recipeByIdAtom(id))
          const selectedStep = registry.get(recipeSelectedStep)

          return `${baseSystemPrompt}

${currentTime}

The user is currently viewing the recipe titled "${recipe.title}".
They are currently focused on step ${selectedStep + 1} of the recipe (starts at 1).

Here are the details of the recipe:

${recipe.toXml()}

**Important:**

When suggesting modifications to the recipe, use the \`SuggestRecipeEdit\` tool to propose changes.
`
        } else if (location.pathname === "/groceries") {
          const items = yield* Atom.getResult(allGroceryItemsArrayAtom)
          return `${baseSystemPrompt}

${currentTime}

The user is currently viewing their grocery list. Here are the items on their grocery list:

${GroceryItem.toXml(items)}`
        } else if (location.pathname === "/plan") {
          const entries = yield* Atom.getResult(mealPlanEntriesAtom)
          return `${baseSystemPrompt}

${currentTime}

The user is currently viewing their meal plan for the week. Here are the entries in their meal plan:

${MealPlanEntry.toXml(entries)}`
        } else if (location.pathname === "/menus") {
          return `${baseSystemPrompt}

The user is currently browsing their list of menus.

${currentTime}`
        } else if (location.pathname.startsWith("/menus/")) {
          const id = location.pathname.split("/")[2]
          const menu = yield* Atom.getResult(menuByIdAtom(id))
          const menuEntries = (yield* Atom.get(menuEntriesAtom(id)))!

          return `${baseSystemPrompt}

${currentTime}

The user is currently viewing the menu titled "${menu.name}".

Here are the details of the menu and its entries:

${menu.toXml()}

${MenuEntry.toXml(menuEntries)}`
        }

        return baseSystemPrompt + "\n\n" + currentTime
      })

      const chat = yield* store.get("ai-history").pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => AiChat.empty,
            onSome: AiChat.fromPrompt,
          }),
        ),
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
        function* (message: string) {
          let history = (yield* Ref.get(chat.history)).pipe(
            Prompt.merge(message),
            Prompt.setSystem(yield* currentSystemPrompt),
          )
          registry.set(currentPromptAtom, history)
          let parts = Array.empty<AiResponse.AnyPart>()
          registry.set(currentPromptAtom, history)
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
                registry.set(currentPromptAtom, Prompt.merge(history, response))
                return Effect.void
              }),
              OpenAiLanguageModel.withConfigOverride({
                reasoning: { effort: "medium" },
              }),
            )
            history = registry.get(currentPromptAtom)
            const response = new LanguageModel.GenerateTextResponse<
              typeof toolkit.tools
            >(parts as any)
            parts = []
            const toolResult = response.toolResults[0]
            if (
              toolResult &&
              "_tag" in toolResult.result &&
              toolResult.result._tag === "Transient"
            ) {
              continue
            }
            break
          }
          yield* Ref.set(chat.history, history)
          yield* store.set("ai-history", history)
        },
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

export const sendAtom = runtime.fn<string>()(
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
