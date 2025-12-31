import { screenWakeLockAtom } from "@/atoms"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Recipe, unitNeedsSpace } from "@/domain/Recipe"
import { AddToGroceriesButton } from "@/Groceries/AddButton"
import { cn, quantityFormatter } from "@/lib/utils"
import { useCommit } from "@/livestore/atoms"
import { events } from "@/livestore/schema"
import {
  MealPlanDatePicker,
  MealPlanDatePickerTarget,
} from "@/MealPlan/DatePicker"
import {
  canConvertIngredientsAtom,
  checkedIngredientsAtom,
  convertIngredientsAtom,
  discardModifiedRecipeAtom,
  newModifiedRecipeAtom,
  recipeForDisplayAtom,
  recipeSelectedStep,
  saveModifiedRecipeAtom,
  showOriginalRecipeAtom,
} from "@/Recipes/atoms"
import { NoRecipeFound } from "@/Recipes/NoRecipeFound"
import { router } from "@/Router"
import {
  Result,
  useAtom,
  useAtomMount,
  useAtomSet,
  useAtomValue,
} from "@effect-atom/atom-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as BigDecimal from "effect/BigDecimal"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as HashSet from "effect/HashSet"
import * as Option from "effect/Option"
import {
  ArrowLeft,
  Calendar,
  Clock,
  Edit,
  MoreVertical,
  SlidersHorizontal,
  Star,
  Trash,
  Users,
  Link as LinkIcon,
  Save,
  Plus,
  ArrowLeftRight,
  MoreHorizontal,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

export const Route = createFileRoute("/recipes/$id")({
  component: RouteComponent,
})

function RouteComponent() {
  const { id } = Route.useParams()
  const result = useAtomValue(recipeForDisplayAtom(id))
  return Result.builder(result)
    .onSuccess(({ resolved, isModified }) => (
      <RecipeDetails recipe={resolved} modified={isModified} />
    ))
    .onErrorTag("NoSuchElementException", () => <NoRecipeFound />)
    .render()
}

export function RecipeDetails({
  recipe,
  modified,
}: {
  recipe: Recipe
  modified: boolean
}) {
  // Keep screen awake while viewing recipe
  useAtomMount(screenWakeLockAtom)

  const commit = useCommit()

  const ingredients = useMemo(() => recipe.ingredientsDisplay, [recipe])
  const [checkedIngredients, setCheckedIngredients] = useAtom(
    checkedIngredientsAtom(recipe.id),
  )
  const stepElements: Array<HTMLDivElement> = []
  const [currentStep, setCurrentStep] = useAtom(recipeSelectedStep)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " ")) {
        return
      } else if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }
      e.preventDefault()
      const nextIndex =
        e.key === "ArrowUp"
          ? Math.max(currentStep - 1, 0)
          : Math.min(currentStep + 1, recipe.steps.length - 1)
      setCurrentStep(nextIndex)
      stepElements[nextIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [currentStep, recipe.steps.length, stepElements])

  const toggleIngredient = (ingredientId: string) => {
    setCheckedIngredients(HashSet.toggle(ingredientId))
  }

  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="pb-content">
      {/* Header */}
      <header className="bg-background border-b border-border sticky top-0 z-10">
        <div
          className={cn(
            "flex items-center",
            recipe.imageUrl ? "gap-3 md:gap-4 p-2" : "gap-2 px-2 py-4",
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            className="p-2"
            onClick={() => router.history.back()}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          {recipe.imageUrl && (
            <img
              src={recipe.imageUrl}
              alt={recipe.title}
              className="block size-14 md:size-18 border object-cover rounded-lg -ml-2"
            />
          )}
          <h1
            className={cn(
              "text-lg font-semibold  flex-1 leading-tight",
              recipe.imageUrl ? "line-clamp-2" : "line-clamp-1",
            )}
          >
            {recipe.title}
          </h1>
          <div className="flex items-center gap-1">
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="p-2">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/edit/$id" params={{ id: recipe.id }}>
                    <Edit />
                    Edit
                  </Link>
                </DropdownMenuItem>
                <MealPlanDatePicker
                  target={MealPlanDatePickerTarget.New({
                    recipeId: recipe.id,
                  })}
                  onSelect={() => {
                    setMenuOpen(false)
                  }}
                >
                  <DropdownMenuItem>
                    <Calendar />
                    Add to meal plan
                  </DropdownMenuItem>
                </MealPlanDatePicker>
                <DropdownMenuItem
                  onClick={() => {
                    if (
                      !confirm("Are you sure you want to delete this recipe?")
                    ) {
                      return
                    }
                    commit(
                      events.recipeDeleted({
                        id: recipe.id,
                        deletedAt: DateTime.unsafeNow(),
                      }),
                    )
                    return router.history.back()
                  }}
                >
                  <Trash />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {!recipe.hasNoDetails && (
        <div className="bg-background p-4 border-b border-border flex items-center">
          {/* Recipe Image & Basic Info */}
          <div className="grid grid-cols-2 sm:flex sm:gap-10 items-center gap-2 text-sm text-muted-foreground">
            {recipe.prepTime && (
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>Prep: {Duration.format(recipe.prepTime)}</span>
              </div>
            )}
            {recipe.cookingTime && (
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>Cook: {Duration.format(recipe.cookingTime)}</span>
              </div>
            )}
            {recipe.servings && (
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{recipe.servingsDisplay} servings</span>
              </div>
            )}
            {recipe.sourceUrl && (
              <a
                href={recipe.sourceUrl}
                className="flex items-center gap-1"
                target="_blank"
                rel="noopener noreferrer"
              >
                <LinkIcon className="size-4" />
                <span className="text-blue-500 border-b border-transparent hover:border-blue-500">
                  {recipe.sourceName ?? "Source"}
                </span>
              </a>
            )}
            {recipe.rating && (
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span>{recipe.rating}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {modified && <ModifiedBanner recipe={recipe} />}

      <div className="flex flex-col md:items-start gap-4 mt-4 md:flex-row max-w-7xl mx-auto">
        {/* Ingredients */}
        <div className="flex-1 md:rounded-lg p-4">
          <div className="flex">
            <h2 className="text-lg font-semibold  mb-4">
              Ingredients
              {recipe.ingredientScale !== 1 && (
                <span className="text-sm text-muted-foreground ml-2">
                  (scaled)
                </span>
              )}
            </h2>
            <div className="flex-1" />
            <div>
              <AddToGroceriesButton
                recipes={[recipe]}
                excludeIngredients={checkedIngredients}
              />
              <IngredientDropdown recipe={recipe} />
            </div>
          </div>

          <div className="space-y-6">
            {ingredients.map((group, groupIndex) => (
              <div key={groupIndex}>
                {ingredients.length > 1 && (
                  <h3 className="font-medium  mb-3 text-base">{group.name}</h3>
                )}

                <div className="rounded-lg overflow-hidden divide-y divide-border border border-border">
                  {group.ingredients.map((ingredient, ingredientIndex) => {
                    const ingredientId = ingredient.id(
                      groupIndex,
                      ingredientIndex,
                    )
                    const isChecked = HashSet.has(
                      checkedIngredients,
                      ingredientId,
                    )

                    return (
                      <div
                        key={ingredientIndex}
                        className="flex items-start gap-3 p-3 bg-card active:bg-muted dark:active:bg-card/50 transition-colors cursor-default"
                        onClick={() => toggleIngredient(ingredientId)}
                      >
                        <Checkbox
                          checked={isChecked}
                          onChange={() => toggleIngredient(ingredientId)}
                          className="mt-[0.25em]"
                        />
                        <div
                          className={`flex-1 ${isChecked ? "text-muted-foreground" : ""}`}
                        >
                          <span>
                            {ingredient.quantity !== null && (
                              <>
                                {quantityFormatter.format(
                                  ingredient.quantity,
                                  ingredient.unit,
                                )}
                                {ingredient.unit &&
                                  `${unitNeedsSpace.has(ingredient.unit) ? " " : ""}${ingredient.unit}`}{" "}
                              </>
                            )}
                            {ingredient.name}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div className="flex-2 p-4">
          {recipe.steps.length > 0 && (
            <h2 className="text-xl font-semibold  mb-4">Instructions</h2>
          )}

          <div className="space-y-4">
            {recipe.steps.map((step, stepIndex) => (
              <div
                key={stepIndex}
                ref={(el) => {
                  stepElements[stepIndex] = el!
                }}
                className={`border-2 rounded-lg p-4 transition-all ${
                  currentStep === stepIndex
                    ? "border-primary bg-primary-muted"
                    : "border-border bg-card"
                }`}
                onClick={() => setCurrentStep(stepIndex)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                      currentStep === stepIndex
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {stepIndex + 1}
                  </div>

                  <div className="flex-1 flex flex-col gap-2">
                    <p className=" leading-relaxed">{step.text}</p>

                    {step.tips.length > 0 && (
                      <div className="space-y-1">
                        {step.tips.map((tip, tipIndex) => (
                          <div
                            key={tipIndex}
                            className="flex items-start gap-2"
                          >
                            <span className="text-primary text-sm">💡</span>
                            <p className="text-sm text-muted-foreground italic">
                              {tip}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function IngredientDropdown({ recipe }: { recipe: Recipe }) {
  const [open, setOpen] = useState(false)
  const commit = useCommit()
  const canConvert = useAtomValue(canConvertIngredientsAtom)
  const convert = useAtomSet(convertIngredientsAtom)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="p-2 hover:bg-border active:bg-border"
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="flex items-center gap-2 px-2 py-1">
          <SlidersHorizontal className="text-muted-foreground size-4" />
          Scale
          <Input
            defaultValue={quantityFormatter.format(recipe.ingredientScale)}
            className="w-16"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              const scale = Option.gen(function* () {
                const parts = e.currentTarget.value.split("/")
                if (parts.length > 2) {
                  return yield* Option.none()
                } else if (parts.length === 2) {
                  const numerator = yield* BigDecimal.fromString(parts[0])
                  const denominator = yield* BigDecimal.fromString(parts[1])
                  return yield* BigDecimal.divide(numerator, denominator)
                } else if (parts[0].trim() === "") {
                  return yield* Option.some(BigDecimal.unsafeFromNumber(1))
                }
                return yield* BigDecimal.fromString(parts[0])
              })
              if (Option.isSome(scale)) {
                commit(
                  events.recipeSetIngredientScale({
                    id: recipe.id,
                    ingredientScale: BigDecimal.unsafeToNumber(scale.value),
                    updatedAt: DateTime.unsafeNow(),
                  }),
                )
              }
              setOpen(false)
            }}
          />
        </div>
        {canConvert && (
          <DropdownMenuItem onClick={() => convert(recipe)}>
            <ArrowLeftRight />
            Convert
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ModifiedBanner({ recipe }: { recipe: Recipe }) {
  const [originals, setOriginals] = useAtom(showOriginalRecipeAtom)
  const showOriginal = HashSet.has(originals, recipe.id)
  const discard = useAtomSet(discardModifiedRecipeAtom)
  const save = useAtomSet(saveModifiedRecipeAtom)
  const create = useAtomSet(newModifiedRecipeAtom)
  return (
    <div className="bg-yellow-50 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-50 px-4 py-2 text-sm border-b border-yellow-200 dark:border-yellow-700 flex items-center gap-2">
      <div>You are viewing a modified version of this recipe.</div>
      <div className="flex-1" />
      <ButtonGroup>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOriginals(HashSet.toggle(recipe.id))}
        >
          {showOriginal ? "Show modified" : "Show original"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => discard(recipe.id)}>
              <Trash />
              Discard
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => save(recipe.id)}>
              <Save />
              Save
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => create(recipe.id)}>
              <Plus />
              Create new
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
    </div>
  )
}
