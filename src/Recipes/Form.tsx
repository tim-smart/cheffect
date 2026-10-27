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
  type InputProps,
} from "@/lib/Form"
import { Button } from "@/components/ui/button"
import { FormControl, FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { FadeImage } from "@/components/FadeImage"
import { ArrowLeft, Lightbulb, Plus, Trash, X } from "lucide-react"
import { Unit } from "@/domain/Recipe"
import { Skeleton } from "@/components/ui/skeleton"
import { router } from "@/Router"
import type { FormReact } from "@lucas-barake/effect-form-react"
import type { ReactNode } from "react"

/**
 * The form element id, for the edit screen's save button.
 */
export const recipeFormId = "recipe-form"

/**
 * The form is laid out like the recipe page it produces: the name in the
 * cookbook's title face, the facts in a row under it, then Ingredients and
 * Method under the same headings, with the steps numbered the same way.
 * There are no boxes around the sections; the headings and the space
 * between them do the grouping.
 */
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
      <div className="page-wide">
        <div className="flex flex-col gap-10 pt-3 pb-4 max-w-2xl md:gap-12 md:pt-4">
          <section className="flex flex-col gap-4">
            <recipeForm.title label="Recipe name" />
            <recipeForm.imageUrl label="Photo" />
            <div className="grid grid-cols-3 gap-3 md:gap-4">
              <recipeForm.prepTime
                label="Prep time"
                suffix="min"
                className="no-step-button"
              />
              <recipeForm.cookingTime
                label="Cook time"
                suffix="min"
                className="no-step-button"
              />
              <recipeForm.servings
                label="Servings"
                className="no-step-button"
              />
            </div>
            <recipeForm.rating label="Rating" />
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <recipeForm.sourceName label="Source" />
              <recipeForm.sourceUrl
                label="Source link"
                placeholder="https://"
              />
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <SectionHeading>Ingredients</SectionHeading>
            <recipeForm.ingredients>
              {({ items, append }) => (
                <div className="flex flex-col gap-8">
                  {items.map((_, index) => (
                    <recipeForm.ingredients.Item key={index} index={index}>
                      {({ remove }) => (
                        <IngredientGroup
                          remove={items.length > 1 ? remove : undefined}
                        />
                      )}
                    </recipeForm.ingredients.Item>
                  ))}
                  <div>
                    <Button
                      type="button"
                      onClick={() => append(emptyIngredientsComponent)}
                      variant="outline"
                    >
                      <Plus />
                      Add group
                    </Button>
                  </div>
                </div>
              )}
            </recipeForm.ingredients>
          </section>

          <section className="flex flex-col gap-6">
            <SectionHeading>Method</SectionHeading>
            <recipeForm.steps>
              {({ items, append }) => (
                <div className="flex flex-col gap-6">
                  {items.map((_, index) => (
                    <recipeForm.steps.Item key={index} index={index}>
                      {({ remove }) => (
                        <StepRow number={index + 1} remove={remove} />
                      )}
                    </recipeForm.steps.Item>
                  ))}
                  <div className="md:pl-11">
                    <Button
                      type="button"
                      onClick={() => append(emptyStep)}
                      variant="outline"
                    >
                      <Plus />
                      Add step
                    </Button>
                  </div>
                </div>
              )}
            </recipeForm.steps>
          </section>

          <div className="pt-2">
            <Button
              type="submit"
              className="h-11 w-full rounded-full px-8 text-[15px] md:w-auto"
            >
              {variant === "add" ? "Add recipe" : "Save recipe"}
            </Button>
          </div>
        </div>
      </div>
    </Form>
  )
}

/**
 * The bar above the form: a way back and the page's title, with room for
 * one action on the right. On phones it stays put while the form scrolls.
 */
export function RecipeFormHeader({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <header className="bg-background border-b border-border sticky top-bar-offset z-10 md:border-b-0">
      <div className="page-wide py-4 md:pt-6 md:pb-2">
        <div className="flex items-center gap-3 -ml-2 md:min-h-11">
          <Button
            variant="ghost"
            size="sm"
            className="p-2"
            aria-label="Back"
            onClick={() => router.history.back()}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold line-clamp-1 flex-1 md:font-display md:text-[32px] md:leading-tight md:font-medium md:tracking-tight">
            {title}
          </h1>
          {action}
        </div>
      </div>
    </header>
  )
}

// The section headings match the recipe page's
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-[22px] md:text-[24px] font-medium tracking-tight leading-none">
      {children}
    </h2>
  )
}

// A quiet icon button for taking a row away
function RemoveButton({
  label,
  onClick,
  icon = <Trash />,
}: {
  label: string
  onClick: () => void
  icon?: ReactNode
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant="ghost"
      size="icon"
      aria-label={label}
      className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
    >
      {icon}
    </Button>
  )
}

// The recipe's name, set like the title it becomes
const TitleInput: FormReact.FieldComponent<string, InputProps> = ({
  field,
  props,
}) => (
  <TextInput
    field={field}
    props={{
      ...props,
      className:
        "h-12 px-3.5 font-display text-[22px] md:h-14 md:px-4 md:text-[26px] font-medium tracking-tight",
    }}
  />
)

// A link to the recipe's photo, with the photo under it once there is one,
// cropped the way the recipe page shows it
const ImageUrlInput: FormReact.FieldComponent<string, InputProps> = ({
  field,
  props: { label, onBlur, ...props },
}) => (
  <FormItem className="w-full">
    {label && <FormLabel>{label}</FormLabel>}
    <FormControl>
      <Input
        {...props}
        type="url"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="https://"
        name={field.path}
        value={field.value}
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={(e) => {
          onBlur?.(e)
          field.onBlur()
        }}
      />
    </FormControl>
    {field.value.trim() !== "" && (
      <div className="mt-1 aspect-[4/3] w-40 overflow-hidden rounded-xl bg-muted">
        <FadeImage
          key={field.value}
          src={field.value}
          alt=""
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.hidden = true
          }}
        />
      </div>
    )}
  </FormItem>
)

function IngredientGroup({ remove }: { remove: (() => void) | undefined }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <recipeForm.ingredients.name
          label="Group name"
          placeholder="Ingredient group"
        />
        {remove && <RemoveButton label="Remove group" onClick={remove} />}
      </div>
      <recipeForm.ingredients.ingredients remove={remove !== undefined} />
    </div>
  )
}

const unitOptions = Unit.literals.map((value) => ({
  label: value,
  value,
}))

// The ingredients of a group, an array inside the groups' array field. Each
// row is an amount, a unit and a name, with the column names once above the
// first row. The group's own remove button sits beside its name, so the rows
// keep their last column for the ingredient's remove button.
const IngredientList: FormReact.FieldComponent<
  ReadonlyArray<typeof IngredientFormSchema.Encoded>,
  { remove: boolean }
> = ({ field }) => {
  const ingredients = field.value
  const add = () => field.onChange([...ingredients, emptyIngredient])
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="w-14 md:w-16">Amount</div>
        <div className="w-[5.25rem] md:w-22">Unit</div>
        <div className="flex-1">Ingredient</div>
        <div className="w-9" aria-hidden />
      </div>
      {ingredients.map((_, index) => (
        <div key={index} className="flex items-center gap-2">
          <div className="w-14 md:w-16">
            <NumberInput
              field={itemField(field, index, "quantity")}
              props={{ className: "no-step-button" }}
            />
          </div>
          <div className="w-[5.25rem] md:w-22">
            <Select
              field={itemField(field, index, "unit")}
              props={{ options: unitOptions, placeholder: "-" }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <TextInput field={itemField(field, index, "name")} props={{}} />
          </div>
          {ingredients.length > 1 ? (
            <RemoveButton
              label="Remove ingredient"
              onClick={() =>
                field.onChange(ingredients.filter((_, i) => i !== index))
              }
              icon={<X />}
            />
          ) : (
            <div className="w-9 shrink-0" aria-hidden />
          )}
        </div>
      ))}
      <div>
        <Button
          type="button"
          onClick={add}
          size="sm"
          variant="ghost"
          className="-ml-2 text-primary hover:text-primary"
        >
          <Plus />
          Add ingredient
        </Button>
      </div>
    </div>
  )
}

// A step, numbered the way the recipe page numbers it
function StepRow({ number, remove }: { number: number; remove: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 shrink-0 pt-1 text-center font-display text-[28px] leading-none font-medium tabular-nums text-muted-foreground/60">
        {number}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <recipeForm.steps.text placeholder="What to do" />
        <recipeForm.steps.tips remove={remove} />
      </div>
    </div>
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
        <div key={index} className="flex items-center gap-2">
          <Lightbulb className="size-4 shrink-0 text-primary" aria-hidden />
          <TextInput
            field={itemValueField(field, index)}
            props={{ placeholder: "A tip for this step" }}
          />
          <RemoveButton
            label="Remove tip"
            onClick={() => field.onChange(tips.filter((_, i) => i !== index))}
            icon={<X />}
          />
        </div>
      ))}
      <div className="flex items-center">
        <Button
          type="button"
          onClick={() => field.onChange([...tips, ""])}
          size="sm"
          variant="ghost"
          className="-ml-2 text-primary hover:text-primary"
        >
          <Plus />
          Add tip
        </Button>
        <div className="flex-1" />
        <RemoveButton label="Remove step" onClick={remove} />
      </div>
    </>
  )
}

const recipeForm = makeForm(RecipeFormBuilder, {
  title: TitleInput,
  imageUrl: ImageUrlInput,
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
    <div className="page-wide">
      <div className="flex flex-col gap-10 pt-20 max-w-2xl md:pt-24">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-full md:h-14" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  )
}
