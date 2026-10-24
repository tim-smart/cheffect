import * as HashSet from "effect/HashSet"
import { GroceryItem, normalizeIngredientName } from "@/domain/GroceryItem"
import type { Ingredient, Recipe } from "@/domain/Recipe"

// What adding recipes to the grocery list would add, before the user picks.
// Every ingredient is offered; the ones in the pantry or already ticked off on
// the recipe start deselected, with the reason shown beside them.

export type GroceryCandidateReason = "pantry" | "ticked"

export interface GroceryCandidate {
  // Unique across the groups, since a plan can hold the same recipe twice.
  readonly key: string
  readonly recipe: Recipe
  readonly ingredient: Ingredient
  readonly reason: GroceryCandidateReason | null
}

export interface GroceryCandidateGroup {
  readonly key: string
  readonly recipe: Recipe
  readonly candidates: ReadonlyArray<GroceryCandidate>
}

export const groceryCandidates = (
  recipes: Iterable<Recipe>,
  options: {
    // The normalised names of what's in the pantry.
    readonly pantryNames: ReadonlySet<string>
    // The ids of the ingredients ticked off on a recipe.
    readonly ticked: (recipe: Recipe) => HashSet.HashSet<string>
  },
): Array<GroceryCandidateGroup> => {
  const groups: Array<GroceryCandidateGroup> = []
  let ri = 0
  for (const recipe of recipes) {
    const ticked = options.ticked(recipe)
    const candidates: Array<GroceryCandidate> = []
    for (const [gi, group] of recipe.ingredientsDisplay.entries()) {
      for (const [ii, ingredient] of group.ingredients.entries()) {
        const id = ingredient.id(gi, ii)
        candidates.push({
          key: `${ri}:${id}`,
          recipe,
          ingredient,
          reason: HashSet.has(ticked, id)
            ? "ticked"
            : options.pantryNames.has(normalizeIngredientName(ingredient.name))
              ? "pantry"
              : null,
        })
      }
    }
    if (candidates.length > 0) {
      groups.push({ key: String(ri), recipe, candidates })
    }
    ri++
  }
  return groups
}

// The keys selected when the dialog opens.
export const defaultGrocerySelection = (
  groups: ReadonlyArray<GroceryCandidateGroup>,
): ReadonlySet<string> =>
  new Set(
    groups.flatMap((group) =>
      group.candidates
        .filter((candidate) => candidate.reason === null)
        .map((candidate) => candidate.key),
    ),
  )

// The grocery items for the selected candidates on `list`, in recipe order.
export const selectedGroceryItems = (
  groups: ReadonlyArray<GroceryCandidateGroup>,
  selected: ReadonlySet<string>,
  list: string | null,
): Array<GroceryItem> =>
  groups.flatMap((group) =>
    group.candidates
      .filter((candidate) => selected.has(candidate.key))
      .map((candidate) =>
        GroceryItem.fromIngredient(
          list,
          candidate.ingredient,
          candidate.recipe,
        ),
      ),
  )
