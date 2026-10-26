import {
  emptyIngredient,
  emptyIngredientsComponent,
  emptyRecipeForm,
  emptyStep,
  IngredientFormSchema,
  RecipeFormBuilder,
  RecipeFormSchema,
} from "@/domain/RecipeForm"
import {
  Form,
  itemField,
  itemValueField,
  makeForm,
  NumberInput,
  RatingInput,
  Select,
  TextArea,
  TextInput,
} from "@/lib/Form"
import { Button } from "@/components/ui/button"
import { Plus, Trash, X } from "lucide-react"
import { Unit } from "@/domain/Recipe"
import { Skeleton } from "@/components/ui/skeleton"
import type { FormReact } from "@lucas-barake/effect-form-react"

/**
 * The form element id, for the edit screen's save button.
 */
export const recipeFormId = "recipe-form"

export function RecipeForm({
  initialValue,
  variant = "add",
  onSubmit,
}: {
  initialValue?: typeof RecipeFormSchema.Encoded
  variant?: "add" | "edit"
  onSubmit: (decoded: typeof RecipeFormSchema.Type) => void | Promise<void>
}) {
  return (
    <Form
      form={recipeForm}
      id={recipeFormId}
      defaultValues={initialValue ?? emptyRecipeForm}
      onSubmit={onSubmit}
    >
      {/* On desktops the form keeps to a reading width at the page's left
          edge, under the page title */}
      <div className="md:page-wide">
        <div className="flex flex-col gap-4 p-2 pt-8 max-w-lg mx-auto md:mx-0 md:max-w-2xl md:px-0 md:pt-6">
          <FormCard>
            <div className="flex flex-col gap-2">
              <recipeForm.title label="Recipe name" />
              <recipeForm.imageUrl label="Image" />
              <div className="flex gap-2">
                <recipeForm.prepTime label="Prep time (min)" />
                <recipeForm.cookingTime label="Cooking time (min)" />
              </div>
              <div className="flex gap-2">
                <recipeForm.servings label="Servings" />
                <recipeForm.rating label="Rating" />
              </div>
            </div>
          </FormCard>
          <FormCard>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <recipeForm.sourceName label="Source" />
                <recipeForm.sourceUrl label="Source URL" />
              </div>
            </div>
          </FormCard>
          <recipeForm.ingredients>
            {({ items, append }) => (
              <div className="flex flex-col gap-2">
                {items.map((_, index) => (
                  <recipeForm.ingredients.Item key={index} index={index}>
                    {({ remove }) => (
                      <ComponentCard
                        remove={items.length > 1 ? remove : undefined}
                      />
                    )}
                  </recipeForm.ingredients.Item>
                ))}
                <div className="flex">
                  <div className="flex-1" />
                  <Button
                    type="button"
                    onClick={() => append(emptyIngredientsComponent)}
                    size="xs"
                    variant="outline"
                  >
                    <Plus />
                    Add group
                  </Button>
                </div>
              </div>
            )}
          </recipeForm.ingredients>
          <recipeForm.steps>
            {({ items, append }) => (
              <div className="flex flex-col gap-2">
                {items.map((_, index) => (
                  <recipeForm.steps.Item key={index} index={index}>
                    {({ remove }) => (
                      <StepCard number={index + 1} remove={remove} />
                    )}
                  </recipeForm.steps.Item>
                ))}
                <div className="flex">
                  <div className="flex-1" />
                  <Button
                    type="button"
                    onClick={() => append(emptyStep)}
                    size="xs"
                    variant="outline"
                  >
                    <Plus />
                    Add step
                  </Button>
                </div>
              </div>
            )}
          </recipeForm.steps>

          <Button type="submit">
            {variant === "add" ? "Add" : "Save"} Recipe
          </Button>
        </div>
      </div>
    </Form>
  )
}

function FormCard({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="flex flex-col gap-4 bg-background border rounded-md p-4">
      {children}
    </div>
  )
}

function ComponentCard({ remove }: { remove: (() => void) | undefined }) {
  return (
    <FormCard>
      <div className="flex flex-col flex-1 gap-1">
        <recipeForm.ingredients.name placeholder="Ingredient group" />
        <recipeForm.ingredients.ingredients remove={remove} />
      </div>
    </FormCard>
  )
}

const unitOptions = Unit.literals.map((value) => ({
  label: value,
  value,
}))

// The ingredients of a group, an array inside the groups' array field
const IngredientList: FormReact.FieldComponent<
  ReadonlyArray<typeof IngredientFormSchema.Encoded>,
  { remove: (() => void) | undefined }
> = ({ field, props: { remove } }) => {
  const ingredients = field.value
  const add = () => field.onChange([...ingredients, emptyIngredient])
  return (
    <>
      {ingredients.map((_, index) => (
        <div key={index} className="flex items-center gap-1">
          <div className="w-14">
            <NumberInput
              field={itemField(field, index, "quantity")}
              props={{ className: "no-step-button" }}
            />
          </div>
          <div>
            <Select
              field={itemField(field, index, "unit")}
              props={{ options: unitOptions, placeholder: "-" }}
            />
          </div>
          <div className="flex-1">
            <TextInput
              field={itemField(field, index, "name")}
              props={{ className: "flex-1" }}
            />
          </div>
          {ingredients.length > 1 && (
            <Button
              type="button"
              onClick={() =>
                field.onChange(ingredients.filter((_, i) => i !== index))
              }
              variant="ghost"
              size="icon"
              className="h-4"
            >
              <Trash />
            </Button>
          )}
        </div>
      ))}
      <div className="flex gap-2 items-center">
        <Button
          type="button"
          onClick={add}
          size="sm"
          variant="outline"
          className="flex-1"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Ingredient
        </Button>
        {remove && (
          <Button
            type="button"
            onClick={remove}
            variant="ghost"
            size="icon"
            className="h-4"
          >
            <Trash />
          </Button>
        )}
      </div>
    </>
  )
}

function StepCard({ number, remove }: { number: number; remove: () => void }) {
  return (
    <FormCard>
      <div className="flex gap-2 items-start">
        <span className="bg-orange-100 text-orange-800 text-sm font-medium rounded-full h-6 w-6 flex items-center justify-center">
          {number}
        </span>
        <div className="flex flex-col flex-1 gap-2">
          <recipeForm.steps.text />
          <recipeForm.steps.tips remove={remove} />
        </div>
      </div>
    </FormCard>
  )
}

// The tips of a step, an array inside the steps' array field
const TipList: FormReact.FieldComponent<
  ReadonlyArray<string>,
  { remove: () => void }
> = ({ field, props: { remove } }) => {
  const tips = field.value
  return (
    <>
      {tips.map((_, index) => (
        <div key={index} className="flex flex-1 items-center gap-2">
          <span className="text-muted-foreground">💡</span>
          <TextInput
            field={itemValueField(field, index)}
            props={{ className: "flex-1" }}
          />
          <Button
            type="button"
            onClick={() => field.onChange(tips.filter((_, i) => i !== index))}
            size="sm"
            variant="ghost"
            className="p-0!"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <div className="flex">
        <Button
          type="button"
          onClick={() => field.onChange([...tips, ""])}
          size="xs"
          variant="outline"
        >
          <Plus />
          Add tip
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          onClick={remove}
          variant="ghost"
          size="icon"
          className="h-4"
        >
          <Trash />
        </Button>
      </div>
    </>
  )
}

const recipeForm = makeForm(RecipeFormBuilder, {
  title: TextInput,
  imageUrl: TextInput,
  prepTime: NumberInput,
  cookingTime: NumberInput,
  servings: NumberInput,
  ingredients: { name: TextInput, ingredients: IngredientList },
  steps: { text: TextArea, tips: TipList },
  rating: RatingInput,
  sourceName: TextInput,
  sourceUrl: TextInput,
})

// effect-form puts an array's item fields on its component, so the groups'
// `name` field hides the component's function name, which React reads to
// name it in its dev tools
recipeForm.ingredients.displayName = "IngredientsField"

export function RecipeFormSkeleton() {
  return (
    <div className="md:page-wide">
      <div className="flex flex-col p-4 mb-8 max-w-lg mx-auto gap-4 pt-22 md:mx-0 md:max-w-2xl md:px-0">
        <Skeleton className="h-72 mb-4 w-full" />
        <Skeleton className="h-48 mb-4 w-full" />
        <Skeleton className="h-48 mb-4 w-full" />
      </div>
    </div>
  )
}
