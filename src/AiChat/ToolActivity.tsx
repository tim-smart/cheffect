import { useState } from "react"
import type * as Prompt from "effect/ai/Prompt"
import {
  BookOpen,
  BookPlus,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Download,
  Globe,
  ListPlus,
  LoaderCircle,
  NotebookPen,
  Pencil,
  Scale,
  Search,
  ShoppingCart,
  Timer,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { format, isValid, parseISO } from "date-fns"
import { cn } from "@/lib/utils"

// The sous-chef's tool calls read as a prep log: one short line per call
// saying what was done, in the words of the kitchen rather than the API. A
// line can be opened to see exactly what went in and what came back.

export interface ToolCall {
  readonly id: string
  readonly name: string
  /** Missing for provider-executed tools, which only report a result */
  readonly params: unknown
  readonly result: Prompt.ToolResultPart | undefined
}

export type ToolCallState = "running" | "done" | "failed" | "stopped"

export const toolCallState = (
  call: ToolCall,
  active: boolean,
): ToolCallState => {
  if (call.result) return call.result.isFailure ? "failed" : "done"
  return active ? "running" : "stopped"
}

export function ToolActivityList({
  calls,
  active,
}: {
  readonly calls: ReadonlyArray<ToolCall>
  /** Whether a reply is still streaming for these calls */
  readonly active: boolean
}) {
  return (
    <div className="flex flex-col text-muted-foreground text-sm">
      {calls.map((call) => (
        <ToolActivityRow key={call.id} call={call} active={active} />
      ))}
    </div>
  )
}

function ToolActivityRow({
  call,
  active,
}: {
  readonly call: ToolCall
  readonly active: boolean
}) {
  const [open, setOpen] = useState(false)
  const state = toolCallState(call, active)
  const description = describeToolCall(call, state)
  const Icon =
    state === "running"
      ? LoaderCircle
      : state === "failed"
        ? CircleAlert
        : description.icon
  const href = state === "done" ? description.href : undefined
  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-start gap-1 min-w-0">
        <button
          type="button"
          onClick={() => setOpen((open) => !open)}
          aria-expanded={open}
          className="group flex flex-1 items-start gap-1.5 min-w-0 text-left rounded-md -ml-1.5 pl-1.5 pr-1 py-0.5 hover:bg-muted dark:hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Icon
            className={cn(
              "size-3.5 shrink-0 mt-[0.2em]",
              state === "running" &&
                "text-primary animate-spin motion-reduce:animate-none",
              state === "failed" && "text-destructive",
            )}
            aria-hidden
          />
          <span
            className={cn(
              "min-w-0 flex-1 break-words",
              state === "running" && "text-foreground",
            )}
          >
            {description.label}
          </span>
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 mt-[0.2em] opacity-0 transition-[opacity,transform] motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100",
              open && "rotate-90 opacity-100",
            )}
            aria-hidden
          />
        </button>
        {href && (
          <a
            href={href}
            className="shrink-0 py-0.5 px-1.5 rounded-md font-medium text-primary hover:bg-primary-muted"
          >
            Open
          </a>
        )}
      </div>
      {open && <ToolCallDetails call={call} state={state} />}
    </div>
  )
}

function ToolCallDetails({
  call,
  state,
}: {
  readonly call: ToolCall
  readonly state: ToolCallState
}) {
  const hasParams =
    call.params !== undefined &&
    !(
      typeof call.params === "object" &&
      call.params !== null &&
      Object.keys(call.params).length === 0
    )
  return (
    <div className="ml-5 mt-1 mb-2 flex flex-col gap-2.5 rounded-lg bg-muted dark:bg-border/60 px-3 py-2.5 text-xs min-w-0">
      <span className="font-mono text-muted-foreground">{call.name}</span>
      {hasParams && <ToolCallDetail title="Input" value={call.params} />}
      {call.result ? (
        <ToolCallDetail
          title={call.result.isFailure ? "Error" : "Result"}
          value={call.result.result}
        />
      ) : (
        <p className="text-muted-foreground">
          {state === "running"
            ? "Waiting for the result…"
            : "Stopped before a result came back."}
        </p>
      )}
    </div>
  )
}

function ToolCallDetail({
  title,
  value,
}: {
  readonly title: string
  readonly value: unknown
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="font-medium text-foreground">{title}</span>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono leading-snug text-muted-foreground">
        {formatValue(value)}
      </pre>
    </div>
  )
}

const formatValue = (value: unknown): string => {
  if (value === undefined) return "—"
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

// -----------------------------------------------------------------------------
// Labels
// -----------------------------------------------------------------------------

interface Description {
  readonly icon: LucideIcon
  readonly label: string
  /** Where the thing the call touched lives in the app */
  readonly href?: string | undefined
}

/**
 * How a tool call is described in each state. `verb` holds the base, present
 * participle and past tense, so every state reads as a sentence: "Search
 * recipes" becomes "Searching recipes…", "Searched recipes", "Couldn't search
 * recipes" and "Stopped searching recipes".
 */
interface ToolWords {
  readonly icon: LucideIcon
  readonly verb: readonly [base: string, running: string, done: string]
  readonly object: string
  /** Appended once the call has finished, e.g. a count of what came back */
  readonly outcome?: string | undefined
  /** Replaces the whole label once the call has finished */
  readonly done?: string | undefined
  readonly href?: string | undefined
}

export const describeToolCall = (
  call: ToolCall,
  state: ToolCallState,
): Description => {
  const result = call.result?.isFailure ? undefined : call.result?.result
  if (call.name === "OpenAiWebSearch") {
    return {
      icon: Globe,
      label:
        state === "running"
          ? "Searching the web…"
          : webSearchLabel(result, state !== "done"),
    }
  }
  const words = toolWords(call.name, call.params, result)
  const [base, running, done] = words.verb
  const label = (() => {
    switch (state) {
      case "running":
        return `${running} ${words.object}…`
      case "done":
        return words.done ?? `${done} ${words.object}${words.outcome ?? ""}`
      case "failed":
        return `Couldn't ${base.toLowerCase()} ${words.object}`
      case "stopped":
        return `Stopped ${running.toLowerCase()} ${words.object}`
    }
  })()
  return { icon: words.icon, label, href: words.href }
}

const toolWords = (
  name: string,
  params: unknown,
  result: unknown,
): ToolWords => {
  const p = record(params)
  switch (name) {
    case "SearchRecipes": {
      const matches = arrayLength(result)
      return {
        icon: Search,
        verb: ["Search", "Searching", "Searched"],
        object: `recipes for ${quote(p.query)}`,
        outcome:
          matches === undefined ? "" : dot(count(matches, "match", "matches")),
      }
    }
    case "RecipeById": {
      const recipe = record(result)
      return {
        icon: BookOpen,
        verb: ["Read", "Reading", "Read"],
        object: "a recipe",
        done:
          result === null
            ? "Couldn't find that recipe"
            : typeof recipe.title === "string"
              ? `Read ${quote(recipe.title)}`
              : undefined,
        href: recipeHref(recipe.id ?? p.id),
      }
    }
    case "CreateRecipe": {
      const title = record(p.recipe).title
      return {
        icon: BookPlus,
        verb: ["Create", "Creating", "Created"],
        object: title === undefined ? "a recipe" : `recipe ${quote(title)}`,
        href: recipeHref(record(result).recipeId),
      }
    }
    case "SuggestRecipeEdit": {
      const title = record(p.recipe).title
      return {
        icon: Pencil,
        verb: ["Suggest", "Suggesting", "Suggested"],
        object: `edits to ${title === undefined ? "a recipe" : quote(title)}`,
        href: recipeHref(p.recipeId),
      }
    }
    case "ScaleRecipe": {
      return {
        icon: Scale,
        verb: ["Scale", "Scaling", "Scaled"],
        object: `a recipe${typeof p.scale === "number" ? ` ×${formatNumber(p.scale)}` : ""}`,
        href: recipeHref(p.recipeId),
      }
    }
    case "GroceryListNames": {
      const lists = arrayLength(result)
      return {
        icon: ShoppingCart,
        verb: ["Look up", "Looking up", "Looked up"],
        object: "grocery lists",
        done:
          lists === undefined
            ? undefined
            : `Found ${count(lists, "grocery list")}`,
        href: "/groceries",
      }
    }
    case "GetGroceryList": {
      const items = arrayLength(result)
      return {
        icon: ShoppingCart,
        verb: ["Read", "Reading", "Read"],
        object:
          typeof p.list === "string"
            ? `the ${quote(p.list)} grocery list`
            : "the grocery list",
        outcome: items === undefined ? "" : dot(count(items, "item")),
        href: groceryHref(typeof p.list === "string" ? p.list : null),
      }
    }
    case "AddGroceryItems": {
      const items = array(p.groceryItems)
      // Items name their own list; a link only makes sense when they agree
      const lists = new Set(
        items.map((item) => {
          const list = record(item).list
          return typeof list === "string" ? list : null
        }),
      )
      const list = lists.size === 1 ? [...lists][0] : undefined
      return {
        icon: ListPlus,
        verb: ["Add", "Adding", "Added"],
        object: `${count(items.length, "item")} to the ${
          typeof list === "string" ? `${quote(list)} list` : "grocery list"
        }`,
        href: list === undefined ? undefined : groceryHref(list),
      }
    }
    case "UpdateGroceryItem": {
      const item = record(p.groceryItem).name
      return {
        icon: ShoppingCart,
        verb: ["Update", "Updating", "Updated"],
        object: item === undefined ? "a grocery item" : quote(item),
      }
    }
    case "MergeGroceryItems": {
      const items = (arrayLength(p.sourceIds) ?? 0) + 1
      return {
        icon: ShoppingCart,
        verb: ["Merge", "Merging", "Merged"],
        object: `${count(items, "grocery item")}${
          typeof p.mergedName === "string" ? ` into ${quote(p.mergedName)}` : ""
        }`,
      }
    }
    case "DeleteGroceryItem": {
      return {
        icon: ShoppingCart,
        verb: ["Remove", "Removing", "Removed"],
        object: "a grocery item",
      }
    }
    case "GetMenus": {
      const menus = arrayLength(result)
      return {
        icon: BookOpen,
        verb: ["Read", "Reading", "Read"],
        object: "the menus",
        done: menus === undefined ? undefined : `Read ${count(menus, "menu")}`,
        href: "/menus",
      }
    }
    case "CreateMenu": {
      const menu = record(p.menu).name
      return {
        icon: BookPlus,
        verb: ["Create", "Creating", "Created"],
        object: menu === undefined ? "a menu" : `menu ${quote(menu)}`,
        href: menuHref(record(result).id),
      }
    }
    case "AddMenuEntries": {
      const recipes = arrayLength(p.menuEntries) ?? 0
      return {
        icon: ListPlus,
        verb: ["Add", "Adding", "Added"],
        object: `${count(recipes, "recipe")} to a menu`,
        href: menuHref(p.menuId),
      }
    }
    case "GetMenuEntries": {
      const recipes = arrayLength(record(result).entries)
      return {
        icon: BookOpen,
        verb: ["Read", "Reading", "Read"],
        object: "a menu",
        outcome: recipes === undefined ? "" : dot(count(recipes, "recipe")),
        href: menuHref(p.menuId),
      }
    }
    case "SetMenuDayNote": {
      const day = typeof p.day === "number" ? `day ${p.day}` : "a menu day"
      return {
        icon: NotebookPen,
        ...noteVerb(p.note),
        object: `the note for ${day}`,
        href: menuHref(p.menuId),
      }
    }
    case "RemoveMenuEntry": {
      return {
        icon: BookOpen,
        verb: ["Remove", "Removing", "Removed"],
        object: "a recipe from a menu",
      }
    }
    case "GetCurrentMealPlan": {
      const meals = arrayLength(record(result).entries)
      return {
        icon: CalendarDays,
        verb: ["Read", "Reading", "Read"],
        object: "this week's meal plan",
        outcome: meals === undefined ? "" : dot(count(meals, "meal")),
        href: "/plan",
      }
    }
    case "SetMealPlanDayNote": {
      return {
        icon: NotebookPen,
        ...noteVerb(p.note),
        object: `the note for ${formatDay(p.day)}`,
        href: "/plan",
      }
    }
    case "AddMealPlanEntries": {
      const meals = arrayLength(p.mealPlanEntries) ?? 0
      return {
        icon: CalendarDays,
        verb: ["Plan", "Planning", "Planned"],
        object: count(meals, "meal"),
        href: "/plan",
      }
    }
    case "RemoveMealPlanEntry": {
      return {
        icon: CalendarDays,
        verb: ["Remove", "Removing", "Removed"],
        object: "a planned meal",
        href: "/plan",
      }
    }
    case "ImportRecipeFromUrl": {
      const host = hostname(typeof p.url === "string" ? p.url : undefined)
      return {
        icon: Download,
        verb: ["Import", "Importing", "Started importing"],
        object: `a recipe from ${host ?? "a web page"}`,
      }
    }
    case "StartTimer": {
      const durationMs = record(result).durationMs
      return {
        icon: Timer,
        verb: ["Start", "Starting", "Started"],
        object: `a ${quote(p.label)} timer`,
        outcome:
          typeof durationMs === "number" ? dot(formatDuration(durationMs)) : "",
      }
    }
    case "SaveLearning": {
      return {
        icon: NotebookPen,
        verb: ["Take", "Taking", "Took"],
        object: "a note",
        done:
          typeof p.content === "string"
            ? `Noted ${quote(excerpt(p.content, 72))}`
            : undefined,
      }
    }
    case "RemoveLearning": {
      return {
        icon: NotebookPen,
        verb: ["Forget", "Forgetting", "Forgot"],
        object: "a note",
      }
    }
    default:
      return {
        icon: Wrench,
        verb: ["Run", "Running", "Ran"],
        object: name,
      }
  }
}

const noteVerb = (note: unknown): Pick<ToolWords, "verb"> =>
  typeof note === "string" && note.trim() === ""
    ? { verb: ["Remove", "Removing", "Removed"] }
    : { verb: ["Write", "Writing", "Wrote"] }

export const webSearchLabel = (result: unknown, isFailure: boolean): string => {
  if (isFailure) return "Web search failed"
  const action =
    typeof result === "object" && result !== null && "action" in result
      ? (result.action as {
          readonly type?: string
          readonly query?: string
          readonly queries?: ReadonlyArray<string>
          readonly url?: string | null
          readonly pattern?: string
        })
      : undefined
  switch (action?.type) {
    case "open_page": {
      const host = hostname(action.url)
      return host ? `Opened ${host}` : "Opened a web page"
    }
    case "find_in_page": {
      const host = hostname(action.url) ?? "a web page"
      return action.pattern
        ? `Searched ${host} for “${action.pattern}”`
        : `Searched ${host}`
    }
    default: {
      const query = action?.query ?? action?.queries?.[0]
      return query ? `Searched the web for “${query}”` : "Searched the web"
    }
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const arrayLength = (value: unknown): number | undefined =>
  Array.isArray(value) ? value.length : undefined

const array = (value: unknown): ReadonlyArray<unknown> =>
  Array.isArray(value) ? value : []

const quote = (value: unknown): string =>
  typeof value === "string" && value.trim() !== ""
    ? `“${value.trim()}”`
    : "something"

const count = (n: number, singular: string, plural = `${singular}s`) =>
  `${formatNumber(n)} ${n === 1 ? singular : plural}`

const dot = (text: string) => ` · ${text}`

const formatNumber = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "")

const excerpt = (text: string, max: number) => {
  const oneLine = text.replace(/\s+/g, " ").trim()
  return oneLine.length > max
    ? `${oneLine.slice(0, max - 1).trimEnd()}…`
    : oneLine
}

const formatDay = (value: unknown): string => {
  if (typeof value !== "string") return "a day"
  const date = parseISO(value)
  return isValid(date) ? format(date, "EEEE d MMMM") : value
}

const formatDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return count(seconds, "second")
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  const hours = Math.floor(minutes / 60)
  if (hours > 0) {
    const mins = minutes % 60
    return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`
  }
  return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`
}

const recipeHref = (id: unknown) =>
  typeof id === "string" && id !== "" ? `/recipes/${id}` : undefined

// The groceries page has one route for every list; the chat reads the list
// off the link and chooses it before navigating. An empty name is the
// default list.
const groceryHref = (list: string | null) =>
  `/groceries?list=${encodeURIComponent(list ?? "")}`

const menuHref = (id: unknown) =>
  typeof id === "string" && id !== "" ? `/menus/${id}` : undefined

export const hostname = (
  url: string | null | undefined,
): string | undefined => {
  if (!url) return undefined
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return undefined
  }
}
