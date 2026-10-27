import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import {
  Ingredient,
  IngredientsComponent,
  Recipe,
  RecipeId,
  Step,
  type Unit,
} from "@/domain/Recipe"
import { Rating } from "@/domain/Rating"
import { gunzipSync, strFromU8, unzipSync } from "fflate"

// Paprika exports
//
// A `.paprikarecipes` file is a zip with one `.paprikarecipe` entry per
// recipe, and each entry is a gzipped JSON object. A single `.paprikarecipe`
// is accepted too. Ingredients and directions are plain text, so they are
// parsed here without the model: one ingredient or step per line.
//
// Paprika's own photo is left out for now. It is inline JPEG data, too big to
// sync in every recipe row, so only a web `image_url` is kept, and the import
// reports the recipes that end up without a photo.

export class PaprikaImportError extends Schema.TaggedError<PaprikaImportError>()(
  "PaprikaImportError",
  { message: Schema.String },
) {}

const OptionalString = Schema.optional(Schema.NullOr(Schema.String))

const PaprikaRecipe = Schema.Struct({
  uid: Schema.String,
  name: Schema.String,
  ingredients: OptionalString,
  directions: OptionalString,
  servings: OptionalString,
  prep_time: OptionalString,
  cook_time: OptionalString,
  source: OptionalString,
  source_url: OptionalString,
  image_url: OptionalString,
  photo_data: OptionalString,
  rating: Schema.optional(Schema.NullOr(Schema.Finite)),
  created: OptionalString,
})
type PaprikaRecipe = typeof PaprikaRecipe.Type

const PaprikaRecipeJson = Schema.fromJsonString(PaprikaRecipe)

// Archive
//
// Read with fflate. `DecompressionStream` could inflate the entries, but it
// can't read the zip around them.

const fail = (message: string) => new PaprikaImportError({ message })

const isGzip = (bytes: Uint8Array) => bytes[0] === 0x1f && bytes[1] === 0x8b

const entries = (bytes: Uint8Array) =>
  Effect.try({
    try: () =>
      isGzip(bytes)
        ? [bytes]
        : Object.values(
            unzipSync(bytes, {
              filter: (file) => file.name.endsWith(".paprikarecipe"),
            }),
          ),
    catch: () => fail("Not a Paprika export"),
  })

const gunzip = (bytes: Uint8Array) =>
  Effect.try({
    try: () => strFromU8(gunzipSync(bytes)),
    catch: () => fail("A recipe in the file is damaged"),
  })

// Fields

const units: ReadonlyArray<readonly [Unit, ReadonlyArray<string>]> = [
  ["g", ["g", "gr", "gram", "grams"]],
  ["kg", ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"]],
  ["ml", ["ml", "millilitre", "millilitres", "milliliter", "milliliters"]],
  ["l", ["l", "litre", "litres", "liter", "liters"]],
  ["tsp", ["tsp", "tsps", "teaspoon", "teaspoons", "teaspon"]],
  ["tbsp", ["tbsp", "tbsps", "tbs", "tbl", "tablespoon", "tablespoons"]],
  ["cup", ["c", "cup", "cups"]],
  ["fl oz", ["fl oz", "fl. oz", "fluid ounce", "fluid ounces"]],
  ["oz", ["oz", "ounce", "ounces"]],
  ["lb", ["lb", "lbs", "pound", "pounds"]],
  ["inch", ["inch", "inches"]],
  ["cm", ["cm"]],
  ["mm", ["mm"]],
  ["pt", ["pt", "pint", "pints"]],
  ["qt", ["qt", "quart", "quarts"]],
]

const unitAliases = new Map(
  units.flatMap(([unit, aliases]) =>
    aliases.map((alias) => [alias, unit] as const),
  ),
)

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Longest first, so "fl oz" wins over "fl" and "tbsp" over "tbs".
const unitPattern = new RegExp(
  `^(${[...unitAliases.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})\\.?(?=\\s|$)\\s*`,
  "i",
)

const vulgarFractions: Record<string, number> = {
  "¼": 1 / 4,
  "½": 1 / 2,
  "¾": 3 / 4,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
}

const fractionChars = Object.keys(vulgarFractions).join("")

// A number as recipes write it: `2`, `0.5`, `1/2`, `1 1/2`, `1-1/2`, `½` or
// `1½`. Mixed numbers come first, so `1-1/2` isn't read as a range.
const numberSource = `(?:\\d+(?:\\s+|-)\\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?\\s*[${fractionChars}]?|[${fractionChars}])`

// A number, or a range of them, which keeps its lower end.
const quantityPattern = new RegExp(
  `^(${numberSource})(?:\\s*(?:-|–|to)\\s*${numberSource})?\\s*`,
)

const parseNumber = (s: string): number => {
  let total = 0
  for (const part of s.trim().split(/\s+|-/)) {
    const fraction = part.match(
      new RegExp(`^(\\d*\\.?\\d*)([${fractionChars}])$`),
    )
    if (fraction) {
      total += Number(fraction[1] || 0) + vulgarFractions[fraction[2]]
    } else if (part.includes("/")) {
      const [numerator, denominator] = part.split("/")
      total += Number(numerator) / Number(denominator)
    } else {
      total += Number(part)
    }
  }
  return total
}

// Paprika marks text bold with `**`.
const stripBold = (s: string) => s.replaceAll("**", "")

const parseIngredient = (line: string): Ingredient => {
  const text = stripBold(line).trim()
  const quantity = text.match(quantityPattern)
  if (!quantity)
    return new Ingredient({ name: text, quantity: null, unit: null })
  let rest = text.slice(quantity[0].length)
  const unit = rest.match(unitPattern)
  if (unit) rest = rest.slice(unit[0].length).replace(/^of\s+/i, "")
  if (rest === "")
    return new Ingredient({ name: text, quantity: null, unit: null })
  return new Ingredient({
    name: rest,
    quantity: parseNumber(quantity[1]),
    unit: unit ? unitAliases.get(unit[1].toLowerCase())! : null,
  })
}

// A group heading is a line in bold, or one ending in a colon. Either way a
// line that starts with a quantity is an ingredient.
const headingName = (line: string): string | null => {
  const text = stripBold(line).trim()
  if (quantityPattern.test(text)) return null
  if (/^\*\*.+\*\*:?$/.test(line) || text.endsWith(":")) {
    return text.replace(/:$/, "").trim()
  }
  return null
}

const parseIngredients = (text: string): Array<IngredientsComponent> => {
  const groups: Array<{ name: string; ingredients: Array<Ingredient> }> = [
    { name: "Ingredients", ingredients: [] },
  ]
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (line === "") continue
    const heading = headingName(line)
    if (heading !== null) {
      groups.push({ name: heading, ingredients: [] })
    } else {
      groups[groups.length - 1].ingredients.push(parseIngredient(line))
    }
  }
  return groups
    .filter((group) => group.ingredients.length > 0)
    .map((group) => new IngredientsComponent(group))
}

// Their numbering is dropped, since the app numbers steps itself.
const parseDirections = (text: string): Array<Step> =>
  text
    .split("\n")
    .map((line) =>
      stripBold(line)
        .trim()
        .replace(/^(?:step\s+\d+[.:)]?|\d+[.)])\s+/i, ""),
    )
    .filter((line) => line !== "")
    .map((text) => new Step({ text, tips: [] }))

// Times are free text: `20 m`, `0:55`, `1 hr 5 min`, `15 minutes`. A bare
// number is minutes.
const parseTime = (text: string): Duration.Duration | null => {
  const clock = text.trim().match(/^(\d+):(\d{2})$/)
  let minutes = 0
  if (clock) {
    minutes = Number(clock[1]) * 60 + Number(clock[2])
  } else if (/^\d+(?:\.\d+)?$/.test(text.trim())) {
    minutes = Number(text.trim())
  } else {
    for (const [, amount, unit] of text.matchAll(
      /(\d+(?:\.\d+)?)\s*(h|hrs?|hours?|m|mins?|minutes?)\b/gi,
    )) {
      minutes += Number(amount) * (unit.toLowerCase().startsWith("h") ? 60 : 1)
    }
  }
  return minutes > 0 ? Duration.minutes(minutes) : null
}

// The first number, so `Yield: 4 servings` and `4-6` both serve 4.
const parseServings = (text: string): number | null => {
  const match = text.match(/\d+(?:\.\d+)?/)
  const servings = match ? Number(match[0]) : 0
  return servings > 0 ? servings : null
}

const nonEmpty = (s: string | null | undefined): string | null => {
  const trimmed = s?.trim()
  return trimmed ? trimmed : null
}

const decodeRating = Schema.decodeUnknownOption(Rating)

// The same Paprika recipe always gets the same id, so importing an export
// twice doesn't add the recipes twice.
const recipeId = (uid: string) =>
  Effect.promise(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(`paprika:${uid}`)),
  ).pipe(
    Effect.map((digest) => {
      const bytes = new Uint8Array(digest.slice(0, 16))
      bytes[6] = (bytes[6] & 0x0f) | 0x80
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      return RecipeId.make(bytes)
    }),
  )

// Paprika writes local time without a zone. It is read as UTC, which only
// matters for ordering by date.
const createdAt = (created: string | null | undefined, now: DateTime.Utc) =>
  Option.fromNullishOr(nonEmpty(created)).pipe(
    Option.flatMap((s) => DateTime.make(`${s.replace(" ", "T")}Z`)),
    Option.map(DateTime.toUtc),
    Option.getOrElse(() => now),
  )

const toRecipe = Effect.fnUntraced(function* (paprika: PaprikaRecipe) {
  const now = yield* DateTime.now
  const imageUrl = nonEmpty(paprika.image_url)
  return new Recipe({
    id: yield* recipeId(paprika.uid),
    title: paprika.name.trim(),
    imageUrl: imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : null,
    prepTime: parseTime(paprika.prep_time ?? ""),
    cookingTime: parseTime(paprika.cook_time ?? ""),
    servings: parseServings(paprika.servings ?? ""),
    ingredients: parseIngredients(paprika.ingredients ?? ""),
    ingredientScale: 1,
    steps: parseDirections(paprika.directions ?? ""),
    rating: Option.getOrNull(decodeRating(paprika.rating)),
    sourceName: nonEmpty(paprika.source),
    sourceUrl: nonEmpty(paprika.source_url),
    createdAt: createdAt(paprika.created, now),
    updatedAt: now,
    deletedAt: null,
  })
})

export interface PaprikaImport {
  readonly recipes: ReadonlyArray<Recipe>
  // The ids of recipes that had only a Paprika photo, and so have none here.
  readonly photosLeftOut: ReadonlySet<string>
}

// The recipes in a Paprika export. The whole file is read before anything is
// returned, so a damaged file imports nothing.
export const recipesFromPaprika = Effect.fnUntraced(function* (
  bytes: Uint8Array,
): Effect.fn.Return<PaprikaImport, PaprikaImportError> {
  const recipes: Array<Recipe> = []
  const photosLeftOut = new Set<string>()
  for (const entry of yield* entries(bytes)) {
    const json = yield* gunzip(entry)
    const paprika = yield* Schema.decodeEffect(PaprikaRecipeJson)(json).pipe(
      Effect.mapError(() =>
        fail("A recipe in the file isn't a Paprika recipe"),
      ),
    )
    const recipe = yield* toRecipe(paprika)
    if (nonEmpty(paprika.photo_data) && recipe.imageUrl === null) {
      photosLeftOut.add(recipe.idString)
    }
    recipes.push(recipe)
  }
  return { recipes, photosLeftOut }
})
