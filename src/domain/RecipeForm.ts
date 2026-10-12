import * as DateTime from "effect/DateTime"
import { FormBody } from "@/lib/Form"
import {
  DurationInput,
  NumberInputOrNull,
  RatingInput,
  SelectWithLiteralsOrNull,
  TextArea,
  TextInput,
  TextInputOrNull,
} from "@/lib/InatoForm"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
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
              unit: SelectWithLiteralsOrNull(Unit.literals),
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
  createdAt: DateTime.nowUnsafe(),
  updatedAt: DateTime.nowUnsafe(),
})

export const RecipeCreate = Schema.revealCodec(
  RecipeFormSchema.schema.pipe(
    Schema.decodeTo(
      Schema.toType(Recipe.jsonCreate),
      SchemaTransformation.transform<
        typeof Recipe.jsonCreate.Type,
        typeof RecipeFormSchema.schema.Type
      >({
        decode: decodeFromForm,
        encode: (recipe) => recipe,
      }),
    ),
  ),
)

export const RecipeInsert = Schema.revealCodec(
  Schema.toType(RecipeFormSchema.schema).pipe(
    Schema.decodeTo(
      Schema.toType(Recipe),
      SchemaTransformation.transform<Recipe, typeof RecipeFormSchema.schema.Type>(
        {
          decode: (input) => Recipe.make(decodeFromForm(input)),
          encode: (recipe) => recipe,
        },
      ),
    ),
  ),
)
