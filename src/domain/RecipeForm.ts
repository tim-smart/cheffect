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
import * as Array from "effect/Array"

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
          defaultValue: Array.makeBy(3, () => ({
            name: "",
            quantity: "",
            unit: "",
          })),
        },
      }),
    ),
    defaultValue: [
      {
        name: "",
        ingredients: Array.makeBy(3, () => ({
          name: "",
          quantity: "",
          unit: "",
        })),
      },
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
  sourceName: TextInputOrNull,
  sourceUrl: TextInputOrNull,
})

const decodeFromForm = (
  input: typeof RecipeFormSchema.schema.Type,
): ConstructorParameters<typeof Recipe>[0] => ({
  ...input,
  id: crypto.randomUUID(),
  ingredients: input.ingredients.map(
    (c) =>
      new IngredientsComponent({
        ...c,
        ingredients: c.ingredients.map((i) => new Ingredient(i)),
      }),
  ),
  ingredientScale: 1,
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
