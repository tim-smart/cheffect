import * as Cheerio from "cheerio"
import * as Predicate from "effect/Predicate"

// The parts of a page a recipe import needs, pulled out before the model sees
// anything. Sites publish a schema.org Recipe as JSON-LD far more often than
// not, and it is a fraction of the size of the page around it.

export interface RecipeJsonLd {
  readonly name: string | null
  readonly description: string | null
  readonly recipeYield: string | null
  readonly prepTime: string | null
  readonly cookTime: string | null
  readonly ingredients: ReadonlyArray<string>
  readonly instructions: ReadonlyArray<string>
  readonly image: string | null
  readonly siteName: string | null
}

export interface PageText {
  readonly title: string | null
  readonly image: string | null
  readonly text: string
}

// Roughly 6k tokens, enough for the recipe part of any page seen so far.
export const pageTextLimit = 24_000

type JsonObject = { readonly [key: string]: unknown }

const isJsonObject = (u: unknown): u is JsonObject =>
  Predicate.isObject(u) && !Array.isArray(u)

const toArray = (u: unknown): ReadonlyArray<unknown> =>
  Array.isArray(u) ? u : u === undefined || u === null ? [] : [u]

// Decodes entities and drops any markup, which some sites leave in strings.
const cleanText = (s: string): string =>
  Cheerio.load(s, null, false).text().replace(/\s+/g, " ").trim()

const stringOrNull = (u: unknown): string | null => {
  if (Predicate.isString(u)) {
    const s = cleanText(u)
    return s === "" ? null : s
  }
  if (Predicate.isNumber(u)) return String(u)
  return null
}

const hasType = (node: JsonObject, type: string): boolean =>
  toArray(node["@type"]).some(
    (t) => Predicate.isString(t) && t.replace(/^.*[/:]/, "") === type,
  )

const absoluteUrl = (url: string, base: string): string | null => {
  try {
    return new URL(url, base).toString()
  } catch {
    return null
  }
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// Every object that claims to be a Recipe, wherever it sits in the block:
// top level, in an array, under `@graph` or nested inside another object.
const collectRecipes = (node: unknown, out: Array<JsonObject>): void => {
  if (Array.isArray(node)) {
    for (const item of node) collectRecipes(item, out)
    return
  }
  if (!isJsonObject(node)) return
  if (hasType(node, "Recipe")) {
    out.push(node)
    return
  }
  for (const value of Object.values(node)) collectRecipes(value, out)
}

const sameUrl = (a: string, b: string): boolean => {
  const strip = (s: string) => s.replace(/#.*$/, "").replace(/\/+$/, "")
  return strip(a) === strip(b)
}

const refersToPage = (recipe: JsonObject, pageUrl: string): boolean =>
  [recipe["@id"], recipe["mainEntityOfPage"], recipe["url"]].some((ref) => {
    const id = isJsonObject(ref) ? ref["@id"] : ref
    if (!Predicate.isString(id)) return false
    const url = absoluteUrl(id, pageUrl)
    return url !== null && sameUrl(url, pageUrl)
  })

const firstImage = (u: unknown, base: string): string | null => {
  for (const item of toArray(u)) {
    const url = isJsonObject(item) ? (item["url"] ?? item["contentUrl"]) : item
    if (Predicate.isString(url) && url.trim() !== "") {
      const absolute = absoluteUrl(url.trim(), base)
      if (absolute !== null) return absolute
    }
  }
  return null
}

const joinYield = (u: unknown): string | null => {
  const parts = toArray(u).flatMap((item) => {
    const s = stringOrNull(item)
    return s === null ? [] : [s]
  })
  // Sites often repeat the yield as a number and as text: ["36", "36 cookies"]
  // keeps only the text.
  const kept = parts.filter(
    (part, i) =>
      parts.indexOf(part) === i &&
      !parts.some((other) => other !== part && other.includes(part)),
  )
  return kept.length === 0 ? null : kept.join(", ")
}

const textLines = (u: unknown): ReadonlyArray<string> =>
  toArray(u).flatMap((item) => {
    const s = stringOrNull(item)
    return s === null ? [] : [s]
  })

// Instructions come as one string, an array of strings, `HowToStep`s, or
// `HowToSection`s of steps. Section names are kept as a heading line ending in
// a colon, followed by the section's steps.
const instructionLines = (u: unknown): ReadonlyArray<string> =>
  toArray(u).flatMap((item): ReadonlyArray<string> => {
    if (Predicate.isString(item)) {
      // A single string usually holds every step, one per line.
      return textLines(item.split(/\n+/))
    }
    if (!isJsonObject(item)) return []
    if (hasType(item, "HowToSection") || "itemListElement" in item) {
      const steps = instructionLines(item["itemListElement"])
      const name = stringOrNull(item["name"])
      return name === null || steps.length === 0
        ? steps
        : [`${name}:`, ...steps]
    }
    const text = stringOrNull(item["text"]) ?? stringOrNull(item["name"])
    return text === null ? [] : [text]
  })

const metaContent = (
  $: Cheerio.CheerioAPI,
  property: string,
): string | null => {
  const content = $(
    `meta[property="${property}"], meta[name="${property}"]`,
  ).attr("content")
  return content === undefined ? null : stringOrNull(content)
}

// The Recipe JSON-LD on a page, reduced to the fields an import uses, or null
// when the page has none. A block that fails to parse is skipped rather than
// ending the search. With several recipes, the one that names the page as its
// `@id` or `mainEntityOfPage` wins, else the first.
export const findRecipeJsonLd = (
  html: string,
  pageUrl: string,
): RecipeJsonLd | null => {
  const $ = Cheerio.load(html)
  const recipes: Array<JsonObject> = []
  $('script[type="application/ld+json"]').each((_, el) => {
    collectRecipes(parseJson($(el).text()), recipes)
  })
  if (recipes.length === 0) return null
  const recipe = recipes.find((r) => refersToPage(r, pageUrl)) ?? recipes[0]

  const publisher = toArray(recipe["publisher"]).find(isJsonObject)
  return {
    name: stringOrNull(recipe["name"]),
    description: stringOrNull(recipe["description"]),
    recipeYield: joinYield(recipe["recipeYield"]),
    prepTime: stringOrNull(recipe["prepTime"]),
    cookTime: stringOrNull(recipe["cookTime"]),
    ingredients: textLines(recipe["recipeIngredient"] ?? recipe["ingredients"]),
    instructions: instructionLines(recipe["recipeInstructions"]),
    image: firstImage(recipe["image"], pageUrl),
    siteName:
      metaContent($, "og:site_name") ??
      (publisher === undefined ? null : stringOrNull(publisher["name"])),
  }
}

const removedFromText = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "form",
  "nav",
  "header",
  "footer",
  "aside",
  "[aria-hidden='true']",
].join(", ")

const blockElements = [
  "address",
  "article",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
].join(", ")

// The visible text of a page, one block per line, capped at `pageTextLimit`
// characters. The title and `og:image` are returned beside it, because both
// live in the head.
export const pageText = (html: string, pageUrl: string): PageText => {
  const $ = Cheerio.load(html)
  const title = metaContent($, "og:title") ?? stringOrNull($("title").text())
  const ogImage = metaContent($, "og:image")
  const image = ogImage === null ? null : absoluteUrl(ogImage, pageUrl)

  $(removedFromText).remove()
  $("br").replaceWith("\n")
  $(blockElements).each((_, el) => {
    $(el).prepend("\n").append("\n")
  })
  const text = $("body")
    .text()
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n")

  return { title, image, text: text.slice(0, pageTextLimit) }
}
