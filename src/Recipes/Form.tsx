import { RecipeFormSchema } from "@/domain/RecipeForm"
import { FormDisplay } from "@inato-form/core"
import * as Effect from "effect/Effect"
import { ShadcnReactHookFormLayer } from "@/lib/InatoForm"
import { Button } from "@/components/ui/button"
import { Plus, Trash, X } from "lucide-react"
import * as Arr from "effect/Array"
import { Unit } from "@/domain/Recipe"
import { Skeleton } from "@/components/ui/skeleton"

const Display = FormDisplay.make(RecipeFormSchema).pipe(
  Effect.provide(ShadcnReactHookFormLayer),
  Effect.runSync,
)

export function RecipeForm({
  initialValue,
  variant = "add",
  onSubmit,
}: {
  initialValue?: typeof RecipeFormSchema.schema.Encoded
  variant?: "add" | "edit"
  onSubmit: (decoded: typeof RecipeFormSchema.schema.Type) => void
}) {
  return (
    <Display.Form
      initialValues={initialValue ? { encoded: initialValue } : undefined}
      onError={(error) => {
        console.error("Form submission error:", error)
      }}
      onSubmit={({ decoded }) => {
        onSubmit(decoded)
      }}
    >
      <div className="flex flex-col gap-4 p-2 pt-8 max-w-lg mx-auto">
        <FormCard>
          <div className="flex flex-col gap-2">
            <Display.title label="Recipe name" />
            <Display.imageUrl label="Image" />
            <div className="flex gap-2">
              <Display.prepTime label="Prep time (min)" />
              <Display.cookingTime label="Cooking time (min)" />
            </div>
            <div className="flex gap-2">
              <Display.servings label="Servings" />
              <Display.rating label="Rating" />
            </div>
          </div>
        </FormCard>
        <FormCard>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Display.sourceName label="Source" />
              <Display.sourceUrl label="Source URL" />
            </div>
          </div>
        </FormCard>
        <Display.ingredients>
          <div className="flex flex-col gap-2">
            <Display.ingredients.Fields>
              <Display.ingredients.Element.ingredients>
                <ComponentCard />
              </Display.ingredients.Element.ingredients>
            </Display.ingredients.Fields>
            <div className="flex">
              <div className="flex-1" />
              <AddComponent />
            </div>
          </div>
        </Display.ingredients>
        <Display.steps>
          <div className="flex flex-col gap-2">
            <Display.steps.Fields>
              <StepCard />
            </Display.steps.Fields>
            <div className="flex">
              <div className="flex-1" />
              <AddStep />
            </div>
          </div>
        </Display.steps>

        <Display.Submit>
          {variant === "add" ? "Add" : "Save"} Recipe
        </Display.Submit>
      </div>
    </Display.Form>
  )
}

function FormCard({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="flex flex-col gap-4 bg-background border rounded-md p-4">
      {children}
    </div>
  )
}

function AddComponent() {
  const controls = Display.ingredients.useControls()
  return (
    <Button
      type="button"
      onClick={() => controls.append()}
      size="xs"
      variant="outline"
    >
      <Plus />
      Add group
    </Button>
  )
}

function ComponentCard() {
  const controls = Display.ingredients.useControls()
  const components = controls.watch()
  const componentControls = Display.ingredients.Element.useControls()
  const component = componentControls.watch()
  const add = Display.ingredients.Element.ingredients.useControls().append
  const remove = () => {
    controls.set(Arr.remove(components, components.indexOf(component)))
  }
  return (
    <FormCard>
      <div className="flex flex-col flex-1 gap-1">
        <Display.ingredients.Element.name placeholder="Ingredient group" />
        <Display.ingredients.Element.ingredients.Fields>
          <IngredientFields />
        </Display.ingredients.Element.ingredients.Fields>
        <div className="flex gap-2 items-center">
          <Button
            type="button"
            onClick={() => add()}
            size="sm"
            variant="outline"
            className="flex-1"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Ingredient
          </Button>
          {components.length > 1 && (
            <Button
              type="button"
              onClick={() => remove()}
              variant="ghost"
              size="icon"
              className="h-4"
            >
              <Trash />
            </Button>
          )}
        </div>
      </div>
    </FormCard>
  )
}

const unitOptions = Unit.literals.map((value) => ({
  label: value,
  value,
}))

function IngredientFields() {
  const controls = Display.ingredients.Element.ingredients.useControls()
  const ingredients = controls.watch()
  const ingredientControls =
    Display.ingredients.Element.ingredients.Element.useControls()
  const ingredient = ingredientControls.watch()
  const index = ingredients.indexOf(ingredient)
  const remove = () => {
    controls.set(Arr.remove(ingredients, index))
  }
  return (
    <div className="flex items-center gap-1">
      <div className="w-14">
        <Display.ingredients.Element.ingredients.Element.quantity className="no-step-button" />
      </div>
      <div>
        <Display.ingredients.Element.ingredients.Element.unit
          options={unitOptions}
          placeholder="-"
        />
      </div>
      <div className="flex-1">
        <Display.ingredients.Element.ingredients.Element.name className="flex-1" />
      </div>
      {ingredients.length > 1 && (
        <Button
          type="button"
          onClick={() => remove()}
          variant="ghost"
          size="icon"
          className="h-4"
        >
          <Trash />
        </Button>
      )}
    </div>
  )
}

function AddStep() {
  const controls = Display.steps.useControls()
  return (
    <Button
      type="button"
      onClick={() => controls.append()}
      size="xs"
      variant="outline"
    >
      <Plus />
      Add step
    </Button>
  )
}

function StepCard() {
  const controls = Display.steps.useControls()
  const steps = controls.watch()
  const stepControls = Display.steps.Element.useControls()
  const step = stepControls.watch()
  const remove = () => {
    controls.set(Arr.remove(steps, steps.indexOf(step)))
  }
  const number = steps.indexOf(step) + 1
  return (
    <FormCard>
      <Display.steps.Element.tips>
        <div className="flex gap-2 items-start">
          <span className="bg-orange-100 text-orange-800 text-sm font-medium rounded-full h-6 w-6 flex items-center justify-center">
            {number}
          </span>
          <div className="flex flex-col flex-1 gap-2">
            <Display.steps.Element.text />
            {step.tips.length > 0 && (
              <Display.steps.Element.tips.Fields>
                <TipFields />
              </Display.steps.Element.tips.Fields>
            )}
            <div className="flex">
              <AddTip />
              <div className="flex-1" />
              <Button
                type="button"
                onClick={() => remove()}
                variant="ghost"
                size="icon"
                className="h-4"
              >
                <Trash />
              </Button>
            </div>
          </div>
        </div>
      </Display.steps.Element.tips>
    </FormCard>
  )
}

function AddTip() {
  const controls = Display.steps.Element.tips.useControls()
  return (
    <Button
      type="button"
      onClick={() => controls.append()}
      size="xs"
      variant="outline"
    >
      <Plus />
      Add tip
    </Button>
  )
}
function TipFields() {
  const controls = Display.steps.Element.tips.useControls()
  const tips = controls.watch()
  const tip = Display.steps.Element.tips.Element.useControls().watch()
  const removeTip = () => {
    controls.set(Arr.remove(tips, tips.indexOf(tip)))
  }
  return (
    <div className="flex flex-1 items-center gap-2">
      <span className="text-muted-foreground">💡</span>
      <Display.steps.Element.tips.Element className="flex-1" />
      <Button
        type="button"
        onClick={() => removeTip()}
        size="sm"
        variant="ghost"
        className="p-0!"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  )
}

export function RecipeFormSkeleton() {
  return (
    <div className="flex flex-col p-4 mb-8 max-w-lg mx-auto gap-4 pt-22">
      <Skeleton className="h-72 mb-4 w-full" />
      <Skeleton className="h-48 mb-4 w-full" />
      <Skeleton className="h-48 mb-4 w-full" />
    </div>
  )
}
