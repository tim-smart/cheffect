import * as DateTime from "effect/DateTime"
import { Field, FormBuilder } from "@lucas-barake/effect-form"
import {
  DurationOrNull,
  LiteralsOrNull,
  NumberOrNull,
  RatingOrNull,
  RequiredString,
  StringOrNull,
} from "@/lib/Form"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import {
  Ingredient,
  IngredientsComponent,
  Recipe,
  RecipeId,
  Step,
  Unit,
} from "./Recipe"
import { generateUuidBytes } from "@/lib/Id"

export const IngredientFormSchema = Schema.Struct({
  name: RequiredString,
  quantity: NumberOrNull,
  unit: LiteralsOrNull(Unit.literals),
})

export const IngredientsComponentFormSchema = Schema.Struct({
  name: RequiredString,
  ingredients: Schema.Array(IngredientFormSchema),
})

export const StepFormSchema = Schema.Struct({
  text: RequiredString,
  tips: Schema.Array(RequiredString),
})

export const RecipeFormBuilder = FormBuilder.empty
  .addField("title", RequiredString)
  .addField("imageUrl", StringOrNull)
  .addField("prepTime", DurationOrNull)
  .addField("cookingTime", DurationOrNull)
  .addField("servings", NumberOrNull)
  .addField(Field.makeArrayField("ingredients", IngredientsComponentFormSchema))
  .addField(Field.makeArrayField("steps", StepFormSchema))
  .addField("rating", RatingOrNull)
  .addField("sourceName", StringOrNull)
  .addField("sourceUrl", StringOrNull)

export const RecipeFormSchema = FormBuilder.buildSchema(RecipeFormBuilder)

export const emptyIngredient: typeof IngredientFormSchema.Encoded = {
  name: "",
  quantity: "",
  unit: "",
}

export const emptyIngredientsComponent: typeof IngredientsComponentFormSchema.Encoded =
  {
    name: "",
    ingredients: [emptyIngredient, emptyIngredient, emptyIngredient],
  }

export const emptyStep: typeof StepFormSchema.Encoded = { text: "", tips: [] }

export const emptyRecipeForm: typeof RecipeFormSchema.Encoded = {
  title: "",
  imageUrl: "",
  prepTime: "",
  cookingTime: "",
  servings: "",
  ingredients: [emptyIngredientsComponent],
  steps: [emptyStep],
  rating: "",
  sourceName: "",
  sourceUrl: "",
}

const decodeFromForm = (
  input: typeof RecipeFormSchema.Type,
): ConstructorParameters<typeof Recipe>[0] => ({
  ...input,
  id: RecipeId.make(generateUuidBytes()),
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
  RecipeFormSchema.pipe(
    Schema.decodeTo(
      Schema.toType(Recipe.jsonCreate),
      SchemaTransformation.transform<
        typeof Recipe.jsonCreate.Type,
        typeof RecipeFormSchema.Type
      >({
        decode: decodeFromForm,
        encode: (recipe) => recipe,
      }),
    ),
  ),
)

export const RecipeInsert = Schema.revealCodec(
  Schema.toType(RecipeFormSchema).pipe(
    Schema.decodeTo(
      Schema.toType(Recipe),
      SchemaTransformation.transform<Recipe, typeof RecipeFormSchema.Type>({
        decode: (input) => Recipe.make(decodeFromForm(input)),
        encode: (recipe) => recipe,
      }),
    ),
  ),
)
