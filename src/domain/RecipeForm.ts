import * as DateTime from "effect/DateTime"
import { FormBody } from "@inato-form/core"
import { TextArea, TextInput } from "@inato-form/fields"
import {
  DurationInput,
  NumberInputOrNull,
  RatingInput,
  SelectWithLiteralsOrNull,
  TextInputOrNull,
} from "@/lib/InatoForm"
import * as Schema from "effect/Schema"
import { Ingredient, IngredientsComponent, Recipe, Step, Unit } from "./Recipe"

export const RecipeFormSchema = FormBody.struct({
  title: TextInput.Required,
  imageUrl: TextInputOrNull,
  prepTime: DurationInput,
  cookingTime: DurationInput,
  servings: NumberInputOrNull,
  ingredients: {
    ...FormBody.array(
      FormBody.struct({
        name: TextInput.Required,
        ingredients: {
          ...FormBody.array(
            FormBody.struct({
              name: TextInput.Required,
              quantity: NumberInputOrNull,
              unit: SelectWithLiteralsOrNull(...Unit.literals),
            }),
          ),
          defaultValue: [{ name: "", quantity: "", unit: null }],
        },
      }),
    ),
    defaultValue: [
      { name: "", ingredients: [{ name: "", quantity: "", unit: null }] },
    ],
  },
  steps: {
    ...FormBody.array(
      FormBody.struct({
        text: TextArea.Required,
        tips: FormBody.array(TextInput.Required),
      }),
    ),
    defaultValue: [{ text: "", tips: [] }],
  },
  rating: RatingInput.Optional,
})

const decodeFromForm = (input: typeof RecipeFormSchema.schema.Type) => ({
  ...input,
  id: crypto.randomUUID(),
  ingredients: input.ingredients.map(
    (c) =>
      new IngredientsComponent({
        ...c,
        ingredients: c.ingredients.map((i) => new Ingredient(i)),
      }),
  ),
  steps: input.steps.map((s) => new Step(s)),
  deletedAt: null,
  createdAt: DateTime.unsafeNow(),
  updatedAt: DateTime.unsafeNow(),
})

export const RecipeCreate = Schema.asSchema(
  Schema.transform(
    RecipeFormSchema.schema,
    Schema.typeSchema(Recipe.jsonCreate),
    {
      decode: decodeFromForm,
      encode: (recipe) => recipe,
    },
  ),
)

export const RecipeInsert = Schema.asSchema(
  Schema.transform(
    Schema.typeSchema(RecipeFormSchema.schema),
    Schema.typeSchema(Recipe),
    {
      decode: (input) => Recipe.make(decodeFromForm(input)),
      encode: (recipe) => recipe,
    },
  ),
)
