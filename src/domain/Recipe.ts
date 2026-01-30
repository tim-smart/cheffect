import { Duration, Option } from "effect"
import { Model } from "@effect/sql"
import * as DateTime from "effect/DateTime"
import { Rating } from "./Rating"
import * as Schema from "effect/Schema"
import { DurationFromMinutes } from "./Duration"
import * as Predicate from "effect/Predicate"
import { UnknownToXml } from "./Xml"
import * as Struct from "effect/Struct"

export const Unit = Schema.Literal(
  "g",
  "kg",
  "ml",
  "l",
  "tsp",
  "tbsp",
  "cup",
  "oz",
  "lb",
  "inch",
  "cm",
  "mm",
  "fl oz",
  "pt",
  "qt",
).annotations({
  description: "A unit of measurement for ingredients.",
})
export type Unit = typeof Unit.Type

export const unitNeedsSpace: ReadonlySet<Unit> = new Set([
  "tsp",
  "tbsp",
  "cup",
  "inch",
  "fl oz",
])

const unitParentConversions: Partial<
  Record<Unit, { parent: Unit; factor: number }>
> = {
  g: { parent: "kg", factor: 1000 },
  ml: { parent: "l", factor: 1000 },
  tsp: { parent: "tbsp", factor: 3 },
  tbsp: { parent: "cup", factor: 16 },
  oz: { parent: "lb", factor: 16 },
  "fl oz": { parent: "pt", factor: 16 },
  pt: { parent: "qt", factor: 2 },
  mm: { parent: "cm", factor: 10 },
}

export const normalizeScaledQuantity = (
  quantity: number,
  unit: Unit | null,
) => {
  if (unit === null) {
    return { quantity, unit }
  }

  let currentQuantity = quantity
  let currentUnit: Unit = unit

  while (true) {
    const conversion = unitParentConversions[currentUnit]
    if (!conversion) {
      return { quantity: currentQuantity, unit: currentUnit }
    }
    if (currentQuantity < conversion.factor) {
      return { quantity: currentQuantity, unit: currentUnit }
    }
    currentQuantity = currentQuantity / conversion.factor
    currentUnit = conversion.parent
  }
}

export class Ingredient extends Schema.Class<Ingredient>("Ingredient")(
  {
    name: Schema.String.annotations({
      description: "The name of the ingredient.",
    }),
    quantity: Schema.NullOr(Schema.Number).annotations({
      description: "The quantity of the ingredient, if applicable.",
    }),
    unit: Schema.NullOr(Unit).annotations({
      description: "The unit of measurement for the ingredient, if applicable.",
    }),
  },
  {
    description: "Represents an ingredient used in a recipe.",
  },
) {
  get quantityWithUnit(): string | null {
    if (this.quantity === null) return null
    if (this.unit === null) return `${this.quantity}`
    return `${this.quantity} ${this.unit}`
  }

  id(groupIndex: number, ingredientIndex: number): string {
    return `${groupIndex}-${ingredientIndex}`
  }
}

export class IngredientsComponent extends Schema.Class<IngredientsComponent>(
  "IngredientsComponent",
)(
  {
    name: Schema.String.annotations({
      description: "The name of the component, e.g., 'Marinade' or 'Cake'.",
    }),
    ingredients: Schema.Array(Ingredient).annotations({
      description: "A list of ingredients that belong to this component.",
    }),
  },
  {
    description: "Represents a component of a recipe with its ingredients.",
  },
) {
  static array = Schema.Array(IngredientsComponent)
  static arrayJson = Schema.parseJson(this.array)
}

export class Step extends Schema.Class<Step>("Step")(
  {
    text: Schema.String.annotations({
      description: "The text of the step in the recipe.",
    }),
    tips: Schema.Array(Schema.String).annotations({
      description: "Optional tips or notes for the step.",
    }),
  },
  {
    description: "Represents a step in a recipe.",
  },
) {}

export class ExtractedRecipe extends Schema.Class<ExtractedRecipe>(
  "ExtractedRecipe",
)(
  {
    title: Schema.String.annotations({
      description: "A short title for the recipe. Exclude website names.",
    }),
    imageUrl: Schema.NullOr(Schema.String).annotations({
      description:
        "An image URL for the recipe, preferrably from the og:image meta tag. Set to null if not available.",
    }),
    prepTime: Schema.NullOr(DurationFromMinutes).annotations({
      description: "The time it takes to prepare the recipe in minutes.",
    }),
    cookingTime: Schema.NullOr(DurationFromMinutes).annotations({
      description:
        "The time it takes to cook the recipe in minutes. This is different from prep time.",
    }),
    servings: Schema.NullOr(Schema.Number).annotations({
      description:
        "The number of persons the recipe serves. If unsure, set to null.",
    }),
    ingredients: Schema.Array(IngredientsComponent).annotations({
      description: "A list of ingredients required for the recipe.",
    }),
    steps: Schema.Array(Step).annotations({
      description: "A list of steps to follow in the recipe.",
    }),
    sourceName: Schema.NullOr(Schema.String).annotations({
      description:
        "The name of the source where the recipe was extracted from, e.g., 'AllRecipes'. Set to null if not available.",
    }),
  },
  {
    description: "Represents a recipe with its details.",
  },
) {
  asRecipe(url?: string): Recipe {
    return new Recipe({
      ...this,
      id: crypto.randomUUID(),
      rating: null,
      ingredientScale: 1,
      sourceUrl: url ?? null,
      createdAt: DateTime.unsafeNow(),
      updatedAt: DateTime.unsafeNow(),
      deletedAt: null,
    })
  }
}

const DurationFromMinutesOrNull = Schema.NullOr(
  DurationFromMinutes,
).annotations({
  description: "A duration represented in minutes. Can be null if not set.",
})

const DurationField = Model.Field({
  select: Schema.NullOr(Schema.DurationFromMillis),
  insert: Schema.NullOr(Schema.DurationFromMillis),
  update: Schema.NullOr(Schema.DurationFromMillis),
  json: DurationFromMinutesOrNull,
  jsonCreate: DurationFromMinutesOrNull,
  jsonUpdate: DurationFromMinutesOrNull,
})

export class Recipe extends Model.Class<Recipe>("Recipe")({
  ...ExtractedRecipe.fields,
  id: Model.GeneratedByApp(
    Schema.String.annotations({
      description: "A unique identifier for the recipe.",
    }),
  ),
  cookingTime: DurationField,
  prepTime: DurationField,
  ingredients: Model.JsonFromString(IngredientsComponent.array),
  ingredientScale: Model.Field({
    select: Schema.Number,
    update: Schema.Number,
  }),
  steps: Model.JsonFromString(Schema.Array(Step)),
  rating: Schema.NullOr(Rating),
  sourceUrl: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromNumber.pipe(
    Model.FieldOnly("insert", "select", "json"),
  ),
  updatedAt: Schema.DateTimeUtcFromNumber.pipe(
    Model.FieldOnly("insert", "update", "select", "json"),
  ),
  deletedAt: Model.GeneratedByApp(Schema.NullOr(Schema.DateTimeUtcFromNumber)),
}) {
  static array = Schema.Array(Recipe)
  static arrayJson = Schema.Array(Recipe.json)
  static xml = UnknownToXml.pipe(
    Schema.compose(
      Schema.Struct({
        recipe: Recipe.json,
      }),
    ),
  )

  get hasNoDetails(): boolean {
    if (this.prepTime !== null) return false
    if (this.cookingTime !== null) return false
    if (this.servings !== null) return false
    if (this.rating !== null) return false
    if (this.sourceUrl !== null) return false
    return true
  }

  get totalTime(): Option.Option<Duration.Duration> {
    const prep = Option.fromNullable(this.prepTime).pipe(
      Option.getOrElse(() => Duration.zero),
    )
    const cook = Option.fromNullable(this.cookingTime).pipe(
      Option.getOrElse(() => Duration.zero),
    )
    return filterZero(Duration.sum(prep, cook))
  }

  get servingsDisplay(): number | null {
    return this.servings && this.servings * this.ingredientScale
  }

  get ingredientsDisplay(): ReadonlyArray<IngredientsComponent> {
    const scale = this.ingredientScale
    const ingredients = this.ingredients
    if (scale === 1) {
      return ingredients
    }
    return ingredients.map((component) => {
      const scaledIngredients = component.ingredients.map((ingredient) => {
        if (ingredient.quantity === null) {
          return ingredient
        }
        const normalized = normalizeScaledQuantity(
          ingredient.quantity * scale,
          ingredient.unit,
        )
        return new Ingredient({
          ...ingredient,
          quantity: normalized.quantity,
          unit: normalized.unit,
        })
      })
      return new IngredientsComponent({
        ...component,
        ingredients: scaledIngredients,
      })
    })
  }

  toXml(): string {
    return Schema.encodeSync(Recipe.xml)({ recipe: this })
  }
}

export const RecipeEdit = Schema.Struct(
  Struct.omit(
    Recipe.fields,
    "sourceUrl",
    "rating",
    "ingredientScale",
    "createdAt",
    "updatedAt",
    "deletedAt",
  ),
)

const filterZero = Option.liftPredicate(Predicate.not(Duration.isZero))

export const SortBy = [
  {
    label: "Latest",
    value: "createdAt",
  },
  {
    label: "Rating",
    value: "rating",
  },
  {
    label: "Title",
    value: "title",
  },
] as const
export const SortByValue = Schema.Literal(...SortBy.map((s) => s.value))
export type SortBy = (typeof SortBy)[number]["value"]
