import { Duration, identity, Option, Schema } from "effect"
import { Model } from "@effect/sql"
import * as DateTime from "effect/DateTime"

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
    quantity: Schema.transform(Schema.NullOr(Schema.Number), Schema.Number, {
      decode: (_) => (_ === null ? 1 : _),
      encode: identity,
    }).annotations({
      description: "The quantity of the ingredient, if applicable.",
    }),
    unit: Schema.NullOr(Unit).annotations({
      description: "The unit of measurement for the ingredient, if applicable.",
    }),
  },
  {
    description: "Represents an ingredient used in a recipe.",
  },
) {}

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

export const DurationFromMinutes = Schema.transform(
  Schema.Number,
  Schema.DurationFromSelf,
  {
    decode: Duration.minutes,
    encode: Duration.toMinutes,
  },
)

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
  id: Schema.String.annotations({
    description: "A unique identifier for the recipe.",
  }),
  cookingTime: Schema.NullOr(Schema.DurationFromMillis),
  prepTime: Schema.NullOr(Schema.DurationFromMillis),
  ingredients: Model.JsonFromString(Schema.Array(IngredientsComponent)),
  steps: Model.JsonFromString(Schema.Array(Step)),
  rating: Schema.NullOr(Schema.Number),
  createdAt: Model.DateTimeInsertFromNumber,
  updatedAt: Model.DateTimeUpdateFromNumber,
  deletedAt: Schema.NullOr(Schema.DateTimeUtcFromNumber),
}) {
  static array = Schema.Array(Recipe)

  get totalTime(): Option.Option<Duration.Duration> {
    return Option.gen(this, function* () {
      const prep = Option.fromNullable(this.prepTime).pipe(
        Option.getOrElse(() => Duration.zero),
      )
      const cook = yield* Option.fromNullable(this.cookingTime)
      return Duration.sum(prep, cook)
    })
  }
}
