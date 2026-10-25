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
import { groceryItemsAtom } from "@/Groceries/atoms"
import { GroceryRepo } from "@/Groceries/Repo"
import {
  addGroceryItems,
  type GroceryItemWrite,
  writeGroceryItems,
  groceriesRuntime,
} from "@/Groceries/runtime"
import { mealPlanEntriesAtom } from "@/MealPlan/atoms"
import { latestNoteByDay, MealPlanRepo } from "@/MealPlan/Repo"
import { mealPlanRuntime } from "@/MealPlan/runtime"
import { menuByIdAtom } from "@/Menus/atoms"
import { MenuRepo } from "@/Menus/Repo"
import { menusRuntime } from "@/Menus/runtime"
import { MenuEntry } from "@/domain/MenuEntry"
import { MenuDayNote } from "@/domain/MenuDayNote"
import {
  GroceryItem,
  GroceryItemId,
  unionRecipeIds,
} from "@/domain/GroceryItem"
import {
  MealPlanEntry,
  MealPlanEntryId,
  MealPlanEntryIdFromString,
} from "@/domain/MealPlanEntry"
import { MealPlanDayNote } from "@/domain/MealPlanDayNote"
import * as Prompt from "effect/ai/Prompt"
import * as LanguageModel from "effect/ai/LanguageModel"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { toolkit } from "@/domain/Toolkits"
import * as EventLog from "effect/eventlog/EventLog"
import type * as EventJournal from "effect/eventlog/EventJournal"
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
import { type EventPayload, writeEvent, writeEvents } from "@/EventLog"
import { Menu, MenuId } from "@/domain/Menu"
import {
  AiMemoryEntry,
  AiMemoryEntryId,
  AiMemoryEntryIdFromString,
} from "@/domain/AiMemoryEntry"
import { AiChatTurnId, PromptJson } from "@/domain/AiChatTurn"
import { AiChatTurnEvent, AiMemoryEntryEvent } from "./Events"
import { AiChatRepo } from "./Repo"
import { aiChatRuntime } from "./runtime"
import { Timer, TimerId } from "@/domain/Timer"
import { TimerEvent } from "@/Timers/Events"
import { RecipeEvent, recipeIngredientScale } from "@/Recipes/Events"
import * as Duration from "effect/Duration"
import {
  MealPlanEntryEvent,
  MealPlanDayNoteEvent,
  mealPlanDayNoteUpdate,
} from "@/MealPlan/Events"
import { GroceryItemEvent, groceryItemCompleted } from "@/Groceries/Events"
import {
  MenuEvent,
  MenuEntryEvent,
  MenuDayNoteEvent,
  menuDayNoteUpdate,
} from "@/Menus/Events"

const ToolkitLayer = toolkit.toLayer(
  Effect.gen(function* () {
    const registry = yield* AtomRegistry.AtomRegistry
    const recipes = yield* RecipeRepo
    const mealPlan = yield* MealPlanRepo
    const menus = yield* MenuRepo
    const extractJobs = yield* RecipeExtractJobRepo
    const groceries = yield* GroceryRepo
    const context = yield* Effect.context<
      | EventLog.EventLog
      | EventJournal.EventJournal
      | QueryBuilder
      | IndexedDb.IndexedDb
      | GroceryRepo
    >()
    const write = (payload: EventPayload) =>
      writeEvent(payload).pipe(Effect.provideContext(context), Effect.orDie)
    const writeItems = (writes: ReadonlyArray<GroceryItemWrite>) =>
      writeGroceryItems(writes).pipe(
        Effect.provideContext(context),
        Effect.orDie,
      )
    const addItems = (items: ReadonlyArray<GroceryItem>) =>
      addGroceryItems(items).pipe(Effect.provideContext(context), Effect.orDie)
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
        yield* write(RecipeEvent.set(newRecipe))
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
        yield* write(
          recipeIngredientScale(original.value.id, scale, yield* DateTime.now),
        )
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      GroceryListNames: Effect.fnUntraced(function* () {
        const names = yield* groceries.listNames.pipe(Effect.orDie)
        return { _tag: "Transient", value: names }
      }),
      GetGroceryList: Effect.fnUntraced(function* ({ list }) {
        const items = yield* groceries.list(list).pipe(Effect.orDie)
        return {
          _tag: "Transient",
          value: items,
        }
      }),
      AddGroceryItems: Effect.fnUntraced(function* ({ groceryItems }) {
        yield* addItems(
          groceryItems.map(
            (groceryItem) =>
              new GroceryItem({
                ...groceryItem,
                id: GroceryItemId.make(generateUuidBytes()),
                createdAt: DateTime.nowUnsafe(),
                updatedAt: DateTime.nowUnsafe(),
                completed: false,
              }),
          ),
        )
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      UpdateGroceryItem: Effect.fnUntraced(function* ({
        groceryItem,
        groceryItemId,
      }) {
        const existing = yield* groceries.byId(groceryItemId).pipe(Effect.orDie)
        if (Option.isNone(existing)) {
          return { _tag: "Transient", value: null }
        }
        const updated = new GroceryItem({
          ...existing.value,
          ...groceryItem,
          updatedAt: DateTime.nowUnsafe(),
        })
        yield* writeItems([
          { op: "change", previous: existing.value, item: updated },
        ])
        // A change leaves the check alone, so a changed one is its own write.
        if (updated.completed !== existing.value.completed) {
          yield* write(groceryItemCompleted(updated, updated.completed))
        }
        return { _tag: "Transient", value: null }
      }),
      MergeGroceryItems: Effect.fnUntraced(function* ({
        targetId,
        sourceIds,
        mergedName,
        mergedQuantity,
      }) {
        const target = yield* groceries.byId(targetId).pipe(Effect.orDie)
        if (Option.isNone(target)) {
          return { _tag: "Transient", value: null }
        }

        // The sources go, and the target takes their recipes, as one batch.
        // The target writes only what the merge changes.
        const sources: Array<GroceryItem> = []
        for (const sourceId of sourceIds) {
          const source = yield* groceries.byId(sourceId).pipe(Effect.orDie)
          if (Option.isSome(source)) sources.push(source.value)
        }
        yield* writeItems([
          ...sources.map(
            (source) => ({ op: "remove", id: source.id }) as const,
          ),
          {
            op: "change",
            previous: target.value,
            item: new GroceryItem({
              ...target.value,
              name: mergedName ?? target.value.name,
              quantity: mergedQuantity ?? target.value.quantity,
              recipeIds: unionRecipeIds(
                target.value.recipeIds,
                ...sources.map((source) => source.recipeIds),
              ),
              updatedAt: DateTime.nowUnsafe(),
            }),
          },
        ])
        return { _tag: "Transient", value: null }
      }),
      DeleteGroceryItem: Effect.fnUntraced(function* ({ id }) {
        const item = yield* groceries.byId(id).pipe(Effect.orDie)
        if (Option.isSome(item)) {
          yield* write(GroceryItemEvent.remove({ id: item.value.id }))
        }
        return { _tag: "Transient", value: null }
      }),
      GetMenus: Effect.fnUntraced(function* () {
        const all = yield* menus.all.pipe(Effect.orDie)
        return {
          _tag: "Transient",
          value: all,
        }
      }),
      GetMenuEntries: Effect.fnUntraced(function* ({ menuId }) {
        const menu = yield* menus.byId(menuId).pipe(Effect.orDie)
        return {
          _tag: "Transient",
          value: {
            entries: Option.match(menu, {
              onNone: () => [],
              onSome: (menu) => menu.entries,
            }),
            menuDayNotes: Option.match(menu, {
              onNone: () => [],
              onSome: (menu) => menu.notes,
            }),
          },
        }
      }),
      SetMenuDayNote: Effect.fnUntraced(function* ({ menuId, day, note }) {
        const menu = yield* menus.byId(menuId).pipe(Effect.orDie)
        if (Option.isNone(menu)) {
          return {
            _tag: "Transient",
            value: null,
          }
        }
        const existing = menu.value.notes.find((n) => n.day === day)

        const trimmed = note.trim()
        if (trimmed.length === 0) {
          if (existing) {
            yield* write(
              MenuDayNoteEvent.remove({
                id: existing.id,
                menuId: menu.value.menu.id,
              }),
            )
          }
          return {
            _tag: "Transient",
            value: null,
          }
        }

        if (existing) {
          if (existing.note !== trimmed) {
            yield* write(
              menuDayNoteUpdate(menu.value.menu.id, {
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

        yield* write(
          MenuDayNoteEvent.set(
            MenuDayNote.fromForm({
              menuId: menu.value.menu.id,
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
          id: MenuId.make(generateUuidBytes()),
          createdAt: DateTime.nowUnsafe(),
          updatedAt: DateTime.nowUnsafe(),
        })
        yield* write(MenuEvent.set(newMenu))
        return {
          _tag: "Transient",
          value: newMenu,
        }
      }),
      AddMenuEntries: Effect.fnUntraced(function* ({ menuId, menuEntries }) {
        const menu = yield* menus.byId(menuId).pipe(Effect.orDie)
        if (Option.isNone(menu)) {
          return {
            _tag: "Transient",
            value: null,
          }
        }
        for (const menuEntry of menuEntries) {
          const recipe = yield* recipes
            .byId(menuEntry.recipeId)
            .pipe(Effect.orDie)
          if (Option.isNone(recipe)) continue
          yield* write(
            MenuEntryEvent.set(
              MenuEntry.fromForm({
                menuId: menu.value.menu.id,
                recipeId: recipe.value.id,
                day: menuEntry.day,
              }),
            ),
          )
        }
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      RemoveMenuEntry: Effect.fnUntraced(function* ({ id }) {
        // A remove names the entry's menu, so it goes through the stored
        // entry; one this device doesn't have has nothing to remove.
        const entry = (yield* menus.entries.pipe(Effect.orDie)).find(
          (entry) => uuidString(entry.id) === id.toLowerCase(),
        )
        if (entry !== undefined) {
          yield* write(
            MenuEntryEvent.remove({
              id: entry.id,
              menuId: entry.menuId,
            }),
          )
        }
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
            yield* write(MealPlanDayNoteEvent.remove({ id: existing.id }))
          }
          return {
            _tag: "Transient",
            value: null,
          }
        }

        if (existing) {
          if (existing.note !== trimmed) {
            yield* write(
              mealPlanDayNoteUpdate({
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

        yield* write(
          MealPlanDayNoteEvent.set(
            MealPlanDayNote.fromForm({
              day: normalizedDay,
              note: trimmed,
            }),
          ),
        )
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
          yield* write(
            MealPlanEntryEvent.set({
              id: MealPlanEntryId.make(generateUuidBytes()),
              day: mealPlanEntry.day,
              recipeId: recipe.value.id,
            }),
          )
        }
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      RemoveMealPlanEntry: Effect.fnUntraced(function* ({ id }) {
        const entryId = Schema.decodeOption(MealPlanEntryIdFromString)(id)
        if (Option.isSome(entryId)) {
          yield* write(MealPlanEntryEvent.remove({ id: entryId.value }))
        }
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      ImportRecipeFromUrl: Effect.fnUntraced(function* ({ url }) {
        const job = yield* extractJobs
          .add(url)
          .pipe(Effect.provideContext(context), Effect.orDie)
        return {
          _tag: "Terminal",
          value: { jobId: uuidString(job.id) },
        }
      }),
      SaveLearning: Effect.fnUntraced(function* ({ content }) {
        yield* write(
          AiMemoryEntryEvent.set(
            new AiMemoryEntry({
              id: AiMemoryEntryId.make(generateUuidBytes()),
              content,
              createdAt: DateTime.nowUnsafe(),
            }),
          ),
        )
        return {
          _tag: "Transient",
          value: null,
        }
      }),
      RemoveLearning: Effect.fnUntraced(function* ({ id }) {
        const entryId = Schema.decodeOption(AiMemoryEntryIdFromString)(id)
        if (Option.isSome(entryId)) {
          yield* write(AiMemoryEntryEvent.remove({ id: entryId.value }))
        }
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
        yield* write(TimerEvent.set(timer))
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
      const repo = yield* AiChatRepo
      const context = yield* Effect.context<
        EventLog.EventLog | QueryBuilder | IndexedDb.IndexedDb
      >()
      const write = (payload: EventPayload) =>
        writeEvent(payload).pipe(Effect.provideContext(context), Effect.orDie)
      const writeMany = (payloads: ReadonlyArray<EventPayload>) =>
        writeEvents(payloads).pipe(Effect.provideContext(context), Effect.orDie)
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
        const memoryEntries = yield* repo.memoryEntries.pipe(Effect.orDie)
        const memoryPrompt =
          memoryEntries.length > 0
            ? `## Learning notes

The following are notes from previous interactions with the user. They must be considered when responding.

${memoryEntries
  .map(
    (entry) => `#### Learning ID: ${entry.idString}

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
          const items = yield* Atom.getResult(groceryItemsAtom)
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
          const found = yield* Atom.getResult(menuByIdAtom(id))
          if (Option.isSome(found)) {
            const { menu, entries } = found.value
            return `${baseSystemPrompt}${memoryPrompt}

${currentTimeAndCountry}

The user is currently viewing the menu titled "${menu.name}".

Here are the details of the menu and its entries:

${menu.toXml()}

${MenuEntry.toXml(entries)}`
          }
        }

        return baseSystemPrompt + memoryPrompt + "\n\n" + currentTimeAndCountry
      })

      // History is the `aiChatTurns` snapshot, so turns from other devices
      // and clears show up here too. While a reply streams, the snapshot only
      // replaces the history the next message builds on, not what's shown.
      const chat = yield* repo.history.pipe(
        Effect.flatMap(AiChat.fromPrompt),
        Effect.catch(() => AiChat.empty),
      )
      registry.set(currentPromptAtom, yield* Ref.get(chat.history))
      let sending = false

      yield* repo.historyStream.pipe(
        Stream.runForEach((history) =>
          Effect.gen(function* () {
            yield* Ref.set(chat.history, history)
            if (!sending) registry.set(currentPromptAtom, history)
          }),
        ),
        Effect.tapCause(Effect.logError),
        Effect.forkScoped,
      )

      const tools = yield* toolkit

      // The messages shown since the send began become one turn, finished or
      // interrupted. File parts are already stripped from what's shown.
      let previous = Prompt.empty
      let shown = Prompt.empty
      const show = (prompt: Prompt.Prompt) => {
        shown = prompt
        registry.set(currentPromptAtom, prompt)
      }

      const saveTurn = Effect.gen(function* () {
        // A send that failed before it started has no turn to save.
        if (!sending) return
        sending = false
        const messages = shown.content.slice(previous.content.length)
        if (messages.length === 0) return
        const now = yield* DateTime.now
        yield* write(
          AiChatTurnEvent.set({
            id: AiChatTurnId.make(generateUuidBytes()),
            prompt: Schema.encodeSync(PromptJson)(
              Prompt.fromMessages(messages),
            ),
            entryTime: now.epochMilliseconds,
          }),
        )
      })

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
          previous = yield* Ref.get(chat.history)
          shown = previous
          sending = true
          let history = previous.pipe(
            Prompt.concat([message]),
            Prompt.setSystem(yield* currentSystemPrompt),
          )
          let historyNoFiles = filterFileParts(history)
          show(historyNoFiles)
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
                show(Prompt.concat(historyNoFiles, response))
                return Effect.void
              }),
            )
            history = Prompt.concat(history, Prompt.fromResponseParts(parts))
            historyNoFiles = filterFileParts(history)
            show(historyNoFiles)
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
              show(historyNoFiles)
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
        Effect.ensuring(saveTurn),
        Effect.catchCause(Effect.logError),
      )

      // Removes the turns this device can see, so a turn from another device
      // that hasn't synced yet survives the clear.
      const clear = Effect.gen(function* () {
        const ids = yield* repo.turnIds.pipe(Effect.orDie)
        yield* Ref.set(chat.history, Prompt.empty)
        yield* writeMany(ids.map((id) => AiChatTurnEvent.remove({ id: id })))
      })

      return { send, clear } as const
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(ToolkitLayer),
  )
}

const runtime = Atom.runtime((get) =>
  AiChatService.layer.pipe(
    Layer.provide([
      get(openAiClientLayer),
      get(aiChatRuntime.layer),
      get(mealPlanRuntime.layer),
      get(menusRuntime.layer),
      get(groceriesRuntime.layer),
    ]),
  ),
).pipe(Atom.keepAlive)

export const currentPromptAtom = Atom.make<Prompt.Prompt>(Prompt.empty).pipe(
  Atom.keepAlive,
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
): boolean =>
  part.type === "text" ||
  part.type === "tool-call" ||
  part.type === "tool-result"

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
