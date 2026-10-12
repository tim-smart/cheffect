# AI Instructions

## Project Setup

- This project uses **pnpm** as the package manager
  are installed

## Code Quality Checks

Before committing code, ensure:

- **prettier** must pass: Run `pnpm exec prettier --check .` to verify formatting
- **tsc --noEmit** must pass: Run `pnpm exec tsc --noEmit` to verify TypeScript type checking

## `effect` library

Read `node_modules/effect/AGENTS.md` **in full** before working with effect
code.

## When working on UI changes

When working on UI changes, use the `frontend-design` skill

## Interaction with the app

Any visual changes to the app should be tested by running the dev server and
using the playwright MCP tools to interact with the app.

1. Start the dev server in the background `pnpm dev &`
2. Use the playwright MCP tools to interact with the app at
   http://localhost:5173
3. Stop the dev server when done
