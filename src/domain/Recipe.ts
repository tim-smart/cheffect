import { Duration, Option } from "effect"
import { Model } from "@effect/sql"
import * as DateTime from "effect/DateTime"
import { Rating } from "./Rating"
import * as Schema from "effect/Schema"
import { DurationFromMinutes } from "./Duration"
import * as Predicate from "effect/Predicate"

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
) {}

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
  },
  {
    description: "Represents a recipe with its details.",
  },
) {
  get asRecipe(): Recipe {
    return new Recipe({
      ...this,
      rating: null,
      id: crypto.randomUUID(),
      createdAt: DateTime.unsafeNow(),
      updatedAt: DateTime.unsafeNow(),
      deletedAt: null,
    })
  }
}

export class Recipe extends Model.Class<Recipe>("Recipe")({
  ...ExtractedRecipe.fields,
  id: Model.GeneratedByApp(
    Schema.String.annotations({
      description: "A unique identifier for the recipe.",
    }),
  ),
  cookingTime: Schema.NullOr(Schema.DurationFromMillis),
  prepTime: Schema.NullOr(Schema.DurationFromMillis),
  ingredients: Model.JsonFromString(Schema.Array(IngredientsComponent)),
  steps: Model.JsonFromString(Schema.Array(Step)),
  rating: Schema.NullOr(Rating),
  createdAt: Model.DateTimeInsertFromNumber,
  updatedAt: Model.DateTimeUpdateFromNumber,
  deletedAt: Model.GeneratedByApp(Schema.NullOr(Schema.DateTimeUtcFromNumber)),
}) {
  static array = Schema.Array(Recipe)

  get totalTime(): Option.Option<Duration.Duration> {
    const prep = Option.fromNullable(this.prepTime).pipe(
      Option.getOrElse(() => Duration.zero),
    )
    const cook = Option.fromNullable(this.cookingTime).pipe(
      Option.getOrElse(() => Duration.zero),
    )
    return filterZero(Duration.sum(prep, cook))
  }
}

const filterZero = Option.liftPredicate(Predicate.not(Duration.isZero))
