import type React from "react"
import { useState } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select as SelectComponent,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Recipe, Unit } from "@/domain/Recipe"
import { FormBody, FormDisplay, FormField } from "@inato-form/core"
import {
  Checkbox,
  CheckboxGroup,
  MultiSelect,
  NumberInput,
  RadioGroup,
  Select,
  TextArea,
  TextInput,
} from "@inato-form/fields"
import * as Schema from "effect/Schema"
import { Rating } from "@/domain/Rating"
import * as Effect from "effect/Effect"
import { RatingInput, ShadcnReactHookFormLayer } from "@/lib/InatoForm"

const body = FormBody.struct({
  title: TextInput.Required,
  imageUrl: TextInput.Optional,
  prepTime: NumberInput.Optional,
  cookingTime: NumberInput.Optional,
  servings: NumberInput.Optional,
  ingredients: FormBody.array(
    FormBody.struct({
      name: TextInput.Required,
      ingredients: FormBody.array(
        FormBody.struct({
          name: TextInput.Required,
          quantity: NumberInput.Optional,
          unit: Select.OptionalWithLiterals(...Unit.literals),
        }),
      ),
    }),
  ),
  steps: FormBody.array(
    FormBody.struct({
      text: TextArea.Required,
      tips: FormBody.array(TextInput.Required),
    }),
  ),
  rating: RatingInput.Optional,
})

const Display = FormDisplay.make(body).pipe(
  Effect.provide(ShadcnReactHookFormLayer),
  Effect.runSync,
)

export function RecipeForm() {
  const [recipe, setRecipe] = useState<typeof Recipe.jsonCreate.Encoded>({
    title: "",
    imageUrl: null,
    prepTime: null,
    cookingTime: null,
    servings: null,
    ingredients: [
      {
        name: "",
        ingredients: [{ name: "", quantity: null, unit: "g" }],
      },
    ],
    steps: [{ text: "", tips: [] }],
    rating: null,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const updateBasicField = (
    field: keyof Pick<
      Recipe,
      "title" | "imageUrl" | "prepTime" | "cookingTime" | "servings" | "rating"
    >,
    value: string,
  ) => {
    setRecipe((prev) => ({
      ...prev,
      [field]:
        field === "title" || field === "imageUrl"
          ? value || (field === "title" ? "" : null)
          : value
            ? Number(value)
            : null,
    }))
  }

  const addIngredientGroup = () => {
    setRecipe((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        { name: "", ingredients: [{ name: "", quantity: null, unit: "g" }] },
      ],
    }))
  }

  const removeIngredientGroup = (groupIndex: number) => {
    setRecipe((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== groupIndex),
    }))
  }

  const updateIngredientGroupName = (groupIndex: number, name: string) => {
    setRecipe((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((group, i) =>
        i === groupIndex ? { ...group, name } : group,
      ),
    }))
  }

  const addIngredient = (groupIndex: number) => {
    setRecipe((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((group, i) =>
        i === groupIndex
          ? {
              ...group,
              ingredients: [
                ...group.ingredients,
                { name: "", quantity: null, unit: "g" },
              ],
            }
          : group,
      ),
    }))
  }

  const removeIngredient = (groupIndex: number, ingredientIndex: number) => {
    setRecipe((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((group, i) =>
        i === groupIndex
          ? {
              ...group,
              ingredients: group.ingredients.filter(
                (_, j) => j !== ingredientIndex,
              ),
            }
          : group,
      ),
    }))
  }

  const updateIngredient = (
    groupIndex: number,
    ingredientIndex: number,
    field: "name" | "quantity" | "unit",
    value: string | null,
  ) => {
    setRecipe((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((group, i) =>
        i === groupIndex
          ? {
              ...group,
              ingredients: group.ingredients.map((ingredient, j) =>
                j === ingredientIndex
                  ? {
                      ...ingredient,
                      [field]:
                        field === "quantity"
                          ? value
                            ? Number(value)
                            : null
                          : value,
                    }
                  : ingredient,
              ),
            }
          : group,
      ),
    }))
  }

  const addStep = () => {
    setRecipe((prev) => ({
      ...prev,
      steps: [...prev.steps, { text: "", tips: [] }],
    }))
  }

  const removeStep = (stepIndex: number) => {
    setRecipe((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== stepIndex),
    }))
  }

  const updateStepText = (stepIndex: number, text: string) => {
    setRecipe((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) =>
        i === stepIndex ? { ...step, text } : step,
      ),
    }))
  }

  const addTip = (stepIndex: number) => {
    setRecipe((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) =>
        i === stepIndex ? { ...step, tips: [...step.tips, ""] } : step,
      ),
    }))
  }

  const removeTip = (stepIndex: number, tipIndex: number) => {
    setRecipe((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) =>
        i === stepIndex
          ? { ...step, tips: step.tips.filter((_, j) => j !== tipIndex) }
          : step,
      ),
    }))
  }

  const updateTip = (stepIndex: number, tipIndex: number, tip: string) => {
    setRecipe((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) =>
        i === stepIndex
          ? {
              ...step,
              tips: step.tips.map((t, j) => (j === tipIndex ? tip : t)),
            }
          : step,
      ),
    }))
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!recipe.title.trim()) {
      newErrors.title = "Recipe title is required"
    }

    if (recipe.ingredients.some((group) => !group.name.trim())) {
      newErrors.ingredients = "All ingredient group names are required"
    }

    if (recipe.steps.some((step) => !step.text.trim())) {
      newErrors.steps = "All step descriptions are required"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validateForm()) {
      console.log("Recipe submitted:", recipe)
      // Handle form submission here
    }
  }

  return (
    <Display.Form
      onSubmit={({ encoded }) => {
        console.log("Form submitted with data:", encoded)
      }}
      initialValues={{
        encoded: {
          title: "",
          imageUrl: "",
          servings: null,
          cookingTime: null,
          prepTime: null,
          ingredients: [
            {
              name: "",
              ingredients: [{ name: "", quantity: null, unit: null }],
            },
          ],
          steps: [{ text: "", tips: [] }],
          rating: null,
        },
      }}
    >
      <Display.title label="Title" />
      <Display.steps>
        <Display.steps.Fields>
          <Display.steps.Element.text label="Step" />
        </Display.steps.Fields>
      </Display.steps>
      <Display.rating />
    </Display.Form>
  )

  // return (
  //   <div className="min-h-screen bg-gray-50">
  //     <form onSubmit={handleSubmit} className="p-4 space-y-6 pb-20">
  //       {/* Basic Information */}
  //       <Card>
  //         <CardHeader>
  //           <CardTitle className="text-base">Basic Information</CardTitle>
  //         </CardHeader>
  //         <CardContent className="space-y-4">
  //           <div>
  //             <Label htmlFor="title">Recipe Title *</Label>
  //             <Input
  //               id="title"
  //               value={recipe.title}
  //               onChange={(e) => updateBasicField("title", e.target.value)}
  //               placeholder="Enter recipe title"
  //               className={errors.title ? "border-red-500" : ""}
  //             />
  //             {errors.title && (
  //               <p className="text-sm text-red-500 mt-1">{errors.title}</p>
  //             )}
  //           </div>
  //
  //           <div>
  //             <Label htmlFor="imageUrl">Image URL</Label>
  //             <Input
  //               id="imageUrl"
  //               value={recipe.imageUrl || ""}
  //               onChange={(e) => updateBasicField("imageUrl", e.target.value)}
  //               placeholder="https://example.com/image.jpg"
  //             />
  //           </div>
  //
  //           <div className="grid grid-cols-2 gap-4">
  //             <div>
  //               <Label htmlFor="prepTime">Prep Time (min)</Label>
  //               <Input
  //                 id="prepTime"
  //                 type="number"
  //                 value={recipe.prepTime || ""}
  //                 onChange={(e) => updateBasicField("prepTime", e.target.value)}
  //                 placeholder="15"
  //               />
  //             </div>
  //             <div>
  //               <Label htmlFor="cookingTime">Cook Time (min)</Label>
  //               <Input
  //                 id="cookingTime"
  //                 type="number"
  //                 value={recipe.cookingTime || ""}
  //                 onChange={(e) =>
  //                   updateBasicField("cookingTime", e.target.value)
  //                 }
  //                 placeholder="30"
  //               />
  //             </div>
  //           </div>
  //
  //           <div className="grid grid-cols-2 gap-4">
  //             <div>
  //               <Label htmlFor="servings">Servings</Label>
  //               <Input
  //                 id="servings"
  //                 type="number"
  //                 value={recipe.servings || ""}
  //                 onChange={(e) => updateBasicField("servings", e.target.value)}
  //                 placeholder="4"
  //               />
  //             </div>
  //             <div>
  //               <Label htmlFor="rating">Rating (1-5)</Label>
  //               <Input
  //                 id="rating"
  //                 type="number"
  //                 min="1"
  //                 max="5"
  //                 step="0.1"
  //                 value={recipe.rating || ""}
  //                 onChange={(e) => updateBasicField("rating", e.target.value)}
  //                 placeholder="4.5"
  //               />
  //             </div>
  //           </div>
  //         </CardContent>
  //       </Card>
  //
  //       {/* Ingredients */}
  //       <Card>
  //         <CardHeader>
  //           <div className="flex items-center justify-between">
  //             <CardTitle className="text-base">Ingredients</CardTitle>
  //             <Button
  //               type="button"
  //               onClick={addIngredientGroup}
  //               size="sm"
  //               variant="outline"
  //             >
  //               <Plus className="w-4 h-4 mr-1" />
  //               Add Group
  //             </Button>
  //           </div>
  //         </CardHeader>
  //         <CardContent className="space-y-4">
  //           {errors.ingredients && (
  //             <p className="text-sm text-red-500">{errors.ingredients}</p>
  //           )}
  //           {recipe.ingredients.map((group, groupIndex) => (
  //             <div
  //               key={groupIndex}
  //               className="border border-gray-200 rounded-lg p-3 space-y-3"
  //             >
  //               <div className="flex items-center gap-2">
  //                 <Input
  //                   value={group.name}
  //                   onChange={(e) =>
  //                     updateIngredientGroupName(groupIndex, e.target.value)
  //                   }
  //                   placeholder="Ingredient group (e.g., 'For the sauce')"
  //                   className="flex-1"
  //                 />
  //                 {recipe.ingredients.length > 1 && (
  //                   <Button
  //                     type="button"
  //                     onClick={() => removeIngredientGroup(groupIndex)}
  //                     size="sm"
  //                     variant="ghost"
  //                     className="p-1"
  //                   >
  //                     <X className="w-4 h-4" />
  //                   </Button>
  //                 )}
  //               </div>
  //
  //               {group.ingredients.map((ingredient, ingredientIndex) => (
  //                 <div
  //                   key={ingredientIndex}
  //                   className="flex items-center gap-2"
  //                 >
  //                   <Input
  //                     value={ingredient.quantity || ""}
  //                     onChange={(e) =>
  //                       updateIngredient(
  //                         groupIndex,
  //                         ingredientIndex,
  //                         "quantity",
  //                         e.target.value,
  //                       )
  //                     }
  //                     placeholder="2"
  //                     type="number"
  //                     step="0.1"
  //                     className="w-20"
  //                   />
  //                   <Select
  //                     value={ingredient.unit || "g"}
  //                     onValueChange={(value) =>
  //                       updateIngredient(
  //                         groupIndex,
  //                         ingredientIndex,
  //                         "unit",
  //                         value || null,
  //                       )
  //                     }
  //                   >
  //                     <SelectTrigger className="w-20">
  //                       <SelectValue placeholder="Unit" />
  //                     </SelectTrigger>
  //                     <SelectContent>
  //                       <SelectItem value="g">None</SelectItem>
  //                       {Unit.literals.map((unit) => (
  //                         <SelectItem key={unit} value={unit}>
  //                           {unit}
  //                         </SelectItem>
  //                       ))}
  //                     </SelectContent>
  //                   </Select>
  //                   <Input
  //                     value={ingredient.name}
  //                     onChange={(e) =>
  //                       updateIngredient(
  //                         groupIndex,
  //                         ingredientIndex,
  //                         "name",
  //                         e.target.value,
  //                       )
  //                     }
  //                     placeholder="Ingredient name"
  //                     className="flex-1"
  //                   />
  //                   {group.ingredients.length > 1 && (
  //                     <Button
  //                       type="button"
  //                       onClick={() =>
  //                         removeIngredient(groupIndex, ingredientIndex)
  //                       }
  //                       size="sm"
  //                       variant="ghost"
  //                       className="p-1"
  //                     >
  //                       <X className="w-4 h-4" />
  //                     </Button>
  //                   )}
  //                 </div>
  //               ))}
  //
  //               <Button
  //                 type="button"
  //                 onClick={() => addIngredient(groupIndex)}
  //                 size="sm"
  //                 variant="outline"
  //                 className="w-full"
  //               >
  //                 <Plus className="w-4 h-4 mr-1" />
  //                 Add Ingredient
  //               </Button>
  //             </div>
  //           ))}
  //         </CardContent>
  //       </Card>
  //
  //       {/* Steps */}
  //       <Card>
  //         <CardHeader>
  //           <div className="flex items-center justify-between">
  //             <CardTitle className="text-base">Instructions</CardTitle>
  //             <Button
  //               type="button"
  //               onClick={addStep}
  //               size="sm"
  //               variant="outline"
  //             >
  //               <Plus className="w-4 h-4 mr-1" />
  //               Add Step
  //             </Button>
  //           </div>
  //         </CardHeader>
  //         <CardContent className="space-y-4">
  //           {errors.steps && (
  //             <p className="text-sm text-red-500">{errors.steps}</p>
  //           )}
  //           {recipe.steps.map((step, stepIndex) => (
  //             <div
  //               key={stepIndex}
  //               className="border border-gray-200 rounded-lg p-3 space-y-3"
  //             >
  //               <div className="flex items-start gap-2">
  //                 <span className="bg-orange-100 text-orange-800 text-sm font-medium px-2 py-1 rounded-full mt-1">
  //                   {stepIndex + 1}
  //                 </span>
  //                 <Textarea
  //                   value={step.text}
  //                   onChange={(e) => updateStepText(stepIndex, e.target.value)}
  //                   placeholder="Describe this step..."
  //                   className="flex-1 min-h-[80px]"
  //                 />
  //                 {recipe.steps.length > 1 && (
  //                   <Button
  //                     type="button"
  //                     onClick={() => removeStep(stepIndex)}
  //                     size="sm"
  //                     variant="ghost"
  //                     className="p-1 mt-1"
  //                   >
  //                     <X className="w-4 h-4" />
  //                   </Button>
  //                 )}
  //               </div>
  //
  //               {step.tips.map((tip, tipIndex) => (
  //                 <div key={tipIndex} className="flex items-center gap-2 ml-8">
  //                   <span className="text-sm text-gray-500">💡</span>
  //                   <Input
  //                     value={tip}
  //                     onChange={(e) =>
  //                       updateTip(stepIndex, tipIndex, e.target.value)
  //                     }
  //                     placeholder="Add a helpful tip..."
  //                     className="flex-1"
  //                   />
  //                   <Button
  //                     type="button"
  //                     onClick={() => removeTip(stepIndex, tipIndex)}
  //                     size="sm"
  //                     variant="ghost"
  //                     className="p-1"
  //                   >
  //                     <X className="w-4 h-4" />
  //                   </Button>
  //                 </div>
  //               ))}
  //
  //               <Button
  //                 type="button"
  //                 onClick={() => addTip(stepIndex)}
  //                 size="sm"
  //                 variant="outline"
  //                 className="ml-8"
  //               >
  //                 <Plus className="w-4 h-4 mr-1" />
  //                 Add Tip
  //               </Button>
  //             </div>
  //           ))}
  //         </CardContent>
  //       </Card>
  //
  //       {/* Submit Button */}
  //       <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
  //         <Button
  //           type="submit"
  //           className="w-full bg-orange-600 hover:bg-orange-700 h-12"
  //         >
  //           Save Recipe
  //         </Button>
  //       </div>
  //     </form>
  //   </div>
  // )
}
