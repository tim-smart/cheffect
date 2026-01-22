# Cheffect Dev Recipe Seeding

## Overview

In development builds, automatically seed the local LiveStore database with a
small set of sample recipes when there are no non-deleted recipes. This
provides realistic UI data for recipes, timers, menus, and grocery flows
without manual setup.

## Goals

- Seed 3-5 sample recipes with ingredients, steps, and remote placeholder
  images.
- Include at least one step with a duration string (for example, "10 min") for
  timer parsing.
- Run only in dev builds and only when the recipes table is empty
  (deletedAt IS NULL).
- Use LiveStore events so seeded data behaves like user-created data.

## Non-goals

- Seeding in production builds.
- Seeding other tables (menus, meal plans, groceries, timers).
- Providing a UI control for seeding (unless added later).

## Functional Requirements

- On app startup, after the LiveStore runtime is available, check for existing
  recipes with `deletedAt IS NULL`.
- If the count is zero, insert the seed recipes. The only dev gating should be
  at the `useAtomMount` call site.
- The check only runs on startup; deleting all recipes should require a reload
  to re-seed.
- Seed recipes must map to the `Recipe` model:
  - id: new UUID
  - ingredientScale: 1
  - rating: null
  - sourceUrl: null
  - createdAt/updatedAt: now
- Use `events.recipeCreated` for inserts.

## Non-functional Requirements

- Seeding should be fast and not block initial render.
- The seed data should live in a static module so it is easy to edit.
- Image URLs should be stable remote placeholders (HTTPS, no random URLs).

## Seed Data Set

Create 3-5 recipes with distinct titles, ingredients, and steps. Example set:

1. Lemon Herb Chicken
   - Steps include: "Roast for 25 min" (timer text).
2. Weeknight Veggie Stir Fry
   - Steps include: "Stir-fry for 8 min".
3. Tomato Basil Pasta
   - Steps include: "Simmer for 12 min".
4. Blueberry Pancakes
   - Steps include: "Cook for 2 min per side".

Each recipe should include at least one IngredientsComponent with 4-8
Ingredient entries.

## Design Notes

- Add a module such as `src/dev/seedRecipes.ts` that exports the seed recipe
  data (as `ExtractedRecipe` entries or already-constructed `Recipe` objects).
- Add a seeding routine (for example, `seedDevRecipesAtom`) that:
  - Queries `recipes` for a count of rows where `deletedAt IS NULL`.
  - If empty, constructs `Recipe` objects and commits `events.recipeCreated`
    for each.
- Mount the seeding routine once in `App` using `useAtomMount`, and only render
  the mount when `import.meta.env.DEV` is true (avoid calling the hook in
  production). No other DEV checks are needed.

## Acceptance Criteria

- In dev builds with an empty store, the recipes list shows the seed recipes
  after initial load.
- In dev builds with existing recipes, no seed recipes are added.
- In production builds, no seed recipes are added.
- If all recipes are deleted and the app is reloaded in dev, the seed recipes
  are added again.
- Seeded recipes display images, ingredients, and steps with at least one
  timer-like duration.
