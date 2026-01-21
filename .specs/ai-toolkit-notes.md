# AI Toolkit Notes for Menus and Meal Plans

## Overview

The AI toolkit currently exposes menu entries and meal plan entries without the
existing day notes stored in the app. This means the assistant can miss context
that users already captured when reading menus or meal plans. We will include
existing day notes in the tool responses so the AI can reference them directly.

## Goals

- Attach existing menu day notes to `GetMenuEntries` tool responses.
- Attach existing meal plan day notes to `GetCurrentMealPlan` tool responses.
- Return only the latest note per day (by `updatedAt`).
- Add tools to set a note for a menu day or meal plan day.
- Keep existing note storage and UI unchanged.

## Non-goals

- Do not generate new notes automatically.
- Do not add new note creation or editing UI.
- Do not change database schemas.

## Data Sources

- Menu day notes: LiveStore queries in `src/Menus/atoms.ts` (prefer existing queries; add new ones only if required).
- Meal plan day notes: LiveStore queries in `src/livestore/queries.ts` (prefer existing queries; add new ones only if required).

## Behavior

- When the AI calls `GetMenuEntries`, the response includes `menuDayNotes` with
  the latest note for each menu day from LiveStore queries.
- When the AI calls `GetCurrentMealPlan`, the response includes
  `mealPlanDayNotes` with the latest note for each meal plan day from LiveStore
  queries.
- When the AI calls `SetMenuDayNote`, the note for the provided menu day is
  created if missing or updated if already present. If the note is set to an
  empty string, remove the note for that day.
- When the AI calls `SetMealPlanDayNote`, the note for the provided meal plan day
  is created if missing or updated if already present. If the note is set to an
  empty string, remove the note for that day.
- Notes are keyed to the same day fields already used in the menu/meal plan
  data (menu day number or meal plan date).

## Toolkit Changes

- Update tool schemas in `src/domain/Toolkits.ts`:
  - `GetMenuEntries` returns `{ entries: MenuEntry[], menuDayNotes: MenuDayNote[] }`.
  - `GetCurrentMealPlan` returns `{ entries: MealPlanEntry[], mealPlanDayNotes: MealPlanDayNote[] }`.
  - Add `SetMenuDayNote` and `SetMealPlanDayNote` tools to upsert notes by day.
- Update tool descriptions to mention notes are included and should be used
  as the source of truth for existing notes.

## Selection Logic

- For each day, select the note with the most recent `updatedAt`.
- If multiple notes exist for the same day, only the latest is returned.

## Acceptance Criteria

- Tool responses include day notes in a stable schema.
- Only the latest note per day is included.
- Notes can be created or updated by day through the new toolkit tools.
- No changes to note creation/storage behavior.
- AI has access to notes when reading menus or meal plans.
