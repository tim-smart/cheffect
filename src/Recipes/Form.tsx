import { RecipeFormSchema, RecipeInsert } from "@/domain/RecipeForm"
import { FormDisplay } from "@inato-form/core"
import * as Effect from "effect/Effect"
import { ShadcnReactHookFormLayer } from "@/lib/InatoForm"
import { Button } from "@/components/ui/button"
import { Plus, Trash, X } from "lucide-react"
import * as Arr from "effect/Array"
import * as Schema from "effect/Schema"
import { useAtomSet } from "@effect-atom/atom-react"
import { commitAtom } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import { router } from "@/Router"
import { Unit } from "@/domain/Recipe"

const Display = FormDisplay.make(RecipeFormSchema).pipe(
  Effect.provide(ShadcnReactHookFormLayer),
  Effect.runSync,
)

export function RecipeForm({
  initialValues,
}: {
  initialValues?: typeof RecipeFormSchema.schema.Encoded
}) {
  const commit = useAtomSet(commitAtom)
  return (
    <Display.Form
      initialValues={initialValues ? { encoded: initialValues } : undefined}
      onError={(error) => {
        console.error("Form submission error:", error)
      }}
      onSubmit={({ decoded }) => {
        commit(events.recipeCreated(Schema.decodeSync(RecipeInsert)(decoded)))
        router.navigate({ to: "/" })
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

        <Display.Submit>Add Recipe</Display.Submit>
      </div>
    </Display.Form>
  )
}

function FormCard({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="flex flex-col gap-4 bg-white border rounded-md py-4 px-2">
      {children}
    </div>
  )
}

function AddComponent() {
  const controls = Display.ingredients.useControls()
  return (
    <Button onClick={() => controls.append()} size="xs">
      <Plus />
      Add Group
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

const unitOptions = [
  {
    label: "-",
    value: null as string | null,
  },
].concat(
  Unit.literals.map((value) => ({
    label: value,
    value,
  })),
)

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
      <div className="w-16">
        <Display.ingredients.Element.ingredients.Element.quantity />
      </div>
      <div>
        <Display.ingredients.Element.ingredients.Element.unit
          options={unitOptions as any}
        />
      </div>
      <div className="flex-1">
        <Display.ingredients.Element.ingredients.Element.name className="flex-1" />
      </div>
      {ingredients.length > 1 && (
        <Button
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
    <Button onClick={() => controls.append()} size="xs">
      <Plus />
      Add Step
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
              {steps.length > 1 && (
                <Button
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
        </div>
      </Display.steps.Element.tips>
    </FormCard>
  )
}

function AddTip() {
  const controls = Display.steps.Element.tips.useControls()
  return (
    <Button onClick={() => controls.append()} size="xs">
      <Plus />
      Add Tip
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
      <span className="text-gray-500">💡</span>
      <Display.steps.Element.tips.Element className="flex-1" />
      <Button
        type="button"
        onClick={() => removeTip()}
        size="sm"
        variant="ghost"
        className="!p-0"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  )
}
