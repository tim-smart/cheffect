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
import { parseStepDurations } from "@/lib/stepDurations"
import { cn, quantityFormatter } from "@/lib/utils"
import { useWrite } from "@/EventLog"
import { Timer, TimerId } from "@/domain/Timer"
import { TimerEvent } from "@/Timers/Events"
import { recipeDeleted, recipeIngredientScale } from "@/Recipes/Events"
import { generateUuidBytes } from "@/lib/Id"
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
import { exportRecipeAsHtml, exportRecipeAsYaml } from "@/Recipes/export"
import { NoRecipeFound } from "@/Recipes/NoRecipeFound"
import { router } from "@/Router"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import {
  useAtom,
  useAtomMount,
  useAtomSet,
  useAtomValue,
} from "@effect/atom-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as BigDecimal from "effect/BigDecimal"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as HashSet from "effect/HashSet"
import * as Option from "effect/Option"
import {
  ArrowLeft,
  Calendar,
  ChefHat,
  Edit,
  MoreVertical,
  SlidersHorizontal,
  Star,
  Trash,
  Link as LinkIcon,
  Save,
  Plus,
  ArrowLeftRight,
  MoreHorizontal,
  Share,
} from "lucide-react"
import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"

const toggleHashSet =
  <A,>(value: A) =>
  (self: HashSet.HashSet<A>): HashSet.HashSet<A> =>
    HashSet.has(self, value)
      ? HashSet.remove(self, value)
      : HashSet.add(self, value)

export const Route = createFileRoute("/recipes/$id")({
  component: RouteComponent,
})

function RouteComponent() {
  const { id } = Route.useParams()
  const result = useAtomValue(recipeForDisplayAtom(id))
  return AsyncResult.builder(result)
    .onSuccess((found) =>
      Option.match(found, {
        onNone: () => <NoRecipeFound />,
        onSome: ({ resolved, isModified }) => (
          <RecipeDetails recipe={resolved} modified={isModified} />
        ),
      }),
    )
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

  const write = useWrite()

  const ingredients = useMemo(() => recipe.ingredientsDisplay, [recipe])
  const [checkedIngredients, setCheckedIngredients] = useAtom(
    checkedIngredientsAtom(recipe.idString),
  )
  const stepElements: Array<HTMLDivElement> = []
  const [currentStep, setCurrentStep] = useAtom(
    recipeSelectedStep(recipe.idString),
  )

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
    setCheckedIngredients(toggleHashSet(ingredientId))
  }

  const [menuOpen, setMenuOpen] = useState(false)

  const handleStartTimer = (durationMs: number, label: string) => {
    const now = DateTime.nowUnsafe()
    const duration = Duration.millis(durationMs)
    write(
      TimerEvent.set(
        Timer.insert.make({
          id: TimerId.make(generateUuidBytes()),
          label,
          duration,
          expiresAt: DateTime.addDuration(now, duration),
          pausedRemaining: null,
          createdAt: now,
          updatedAt: now,
        }),
      ),
    )
  }

  const handleDurationKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    durationMs: number,
    label: string,
  ) => {
    if (!(event.key === "Enter" || event.key === " ")) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    handleStartTimer(durationMs, label)
  }

  const renderStepText = (stepText: string, stepIndex: number) =>
    parseStepDurations(stepText).map((segment, segmentIndex) => {
      if (segment.type === "text") {
        return (
          <span key={`${stepIndex}-text-${segmentIndex}`}>{segment.text}</span>
        )
      }

      const durationLabel = segment.text.trim()
      const timerLabel = `${recipe.title} · Step ${stepIndex + 1}: ${durationLabel}`

      return (
        <button
          key={`${stepIndex}-duration-${segmentIndex}`}
          type="button"
          className="text-primary underline decoration-primary/50 underline-offset-4 transition-colors hover:text-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
          onClick={(event) => {
            event.stopPropagation()
            handleStartTimer(segment.durationMs, timerLabel)
          }}
          onKeyDown={(event) =>
            handleDurationKeyDown(event, segment.durationMs, timerLabel)
          }
          aria-label={`Start timer for ${durationLabel}`}
        >
          {segment.text}
        </button>
      )
    })

  return (
    <div className="pb-content">
      {/* Header */}
      <header className="relative">
        <div
          className={cn(
            "relative",
            // the photo never takes more than 40% of a short desktop window
            recipe.imageUrl &&
              "aspect-[4/3] md:aspect-auto md:h-[min(340px,40vh)] bg-muted",
          )}
        >
          {recipe.imageUrl && (
            <>
              <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground">
                <ChefHat className="size-[18%] md:size-[10%] opacity-30" />
              </div>
              <img
                src={recipe.imageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.hidden = true
                }}
              />
            </>
          )}
          <div className="relative flex items-center justify-between p-3">
            <Button
              variant="ghost"
              size="sm"
              className="size-10 rounded-full bg-card text-foreground hover:bg-card"
              aria-label="Back"
              onClick={() => router.history.back()}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-1">
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-10 rounded-full bg-card text-foreground hover:bg-card"
                    aria-label="Recipe options"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to="/edit/$id" params={{ id: recipe.idString }}>
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
                      setMenuOpen(false)
                      exportRecipeAsYaml(recipe)
                    }}
                  >
                    <Share />
                    Export YAML
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setMenuOpen(false)
                      exportRecipeAsHtml(recipe)
                    }}
                  >
                    <Share />
                    Export HTML
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={async () => {
                      if (
                        !confirm("Are you sure you want to delete this recipe?")
                      ) {
                        return
                      }
                      await write(
                        recipeDeleted(recipe.id, DateTime.nowUnsafe()),
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
        </div>
        <h1 className="px-4 pt-5 font-display text-[30px] font-medium leading-[1.1] tracking-tight text-balance">
          {recipe.title}
        </h1>
      </header>

      {!recipe.hasNoDetails && (
        <div className="px-4 pt-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[15px] text-muted-foreground">
            {recipe.prepTime && (
              <span>
                Prep{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {Duration.format(recipe.prepTime)}
                </span>
              </span>
            )}
            {recipe.cookingTime && (
              <span>
                Cook{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {Duration.format(recipe.cookingTime)}
                </span>
              </span>
            )}
            {recipe.servings && (
              <span>
                Serves{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {recipe.servingsDisplay}
                </span>
              </span>
            )}
            {recipe.sourceUrl && (
              <a
                href={recipe.sourceUrl}
                className="flex items-center gap-1"
                target="_blank"
                rel="noopener noreferrer"
              >
                <LinkIcon className="size-4" />
                <span className="text-primary underline underline-offset-4 decoration-primary/30">
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

      <div className="flex flex-col md:items-start gap-6 md:gap-8 mt-6 md:flex-row max-w-7xl mx-auto">
        {/* Ingredients */}
        <div className="flex-1 px-4">
          <div className="flex items-center mb-2">
            <h2 className="font-display text-[22px] font-medium tracking-tight">
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
                  <h3 className="font-medium mb-3 text-base">{group.name}</h3>
                )}

                <div className="divide-y divide-border border-y border-border">
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
                        className="flex items-start gap-3 py-2.5 active:bg-muted transition-colors cursor-default"
                        onClick={() => toggleIngredient(ingredientId)}
                      >
                        <Checkbox
                          checked={isChecked}
                          onChange={() => toggleIngredient(ingredientId)}
                          className="mt-[0.2em] size-[18px] rounded-full"
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
        <div className="flex-2 px-2">
          {recipe.steps.length > 0 && (
            <h2 className="px-2 mb-2 font-display text-[22px] font-medium tracking-tight">
              Method
            </h2>
          )}

          <div className="space-y-0.5">
            {recipe.steps.map((step, stepIndex) => (
              <div
                key={stepIndex}
                ref={(el) => {
                  stepElements[stepIndex] = el!
                }}
                className={`rounded-xl px-2 py-2.5 transition-colors ${
                  currentStep === stepIndex
                    ? "bg-primary-muted"
                    : "active:bg-muted"
                }`}
                onClick={() => setCurrentStep(stepIndex)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`shrink-0 w-8 font-display text-[28px] leading-[1] font-medium tabular-nums text-center ${
                      currentStep === stepIndex
                        ? "text-primary"
                        : "text-muted-foreground/60"
                    }`}
                  >
                    {stepIndex + 1}
                  </div>

                  <div className="flex-1 flex flex-col gap-2">
                    <p className="text-[17px] leading-relaxed">
                      {renderStepText(step.text, stepIndex)}
                    </p>

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
  const write = useWrite()
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
            className="w-14"
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
                  return yield* Option.some(BigDecimal.fromNumberUnsafe(1))
                }
                return yield* BigDecimal.fromString(parts[0])
              })
              if (Option.isSome(scale)) {
                write(
                  recipeIngredientScale(
                    recipe.id,
                    BigDecimal.toNumberUnsafe(scale.value),
                    DateTime.nowUnsafe(),
                  ),
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
  const showOriginal = HashSet.has(originals, recipe.idString)
  const discard = useAtomSet(discardModifiedRecipeAtom)
  const save = useAtomSet(saveModifiedRecipeAtom)
  const create = useAtomSet(newModifiedRecipeAtom)
  return (
    <div className="bg-yellow-50 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-50 px-2 py-2 text-sm border-b border-yellow-200 dark:border-yellow-700 flex items-center gap-2">
      <div>You are viewing a modified version of this recipe.</div>
      <div className="flex-1" />
      <ButtonGroup>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOriginals(toggleHashSet(recipe.idString))}
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
            <DropdownMenuItem onClick={() => discard(recipe.idString)}>
              <Trash />
              Discard
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => save(recipe.idString)}>
              <Save />
              Save
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => create(recipe.idString)}>
              <Plus />
              Create new
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
    </div>
  )
}
