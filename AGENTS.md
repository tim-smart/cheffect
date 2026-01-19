# AI Instructions

## Project Setup

- This project uses **pnpm** as the package manager
  are installed

## Code Quality Checks

Before committing code, ensure:

- **prettier** must pass: Run `pnpm exec prettier --check .` to verify formatting
- **tsc --noEmit** must pass: Run `pnpm exec tsc --noEmit` to verify TypeScript type checking

## `effect` and `@effect-atom/atom-react` libraries

If you need to work out how something works, there are some `git submodule`s you
can refer to:

- `.agents/effect` - for the `effect` and `@effect/*` libraries
- `.agents/effect-atom` - for the `@effect-atom/*` libraries

**Do not** use node_modules to look at the source code for these libraries.

## Interaction with the app

1. Start the dev server in the background `pnpm dev &`
2. Use the playwright MCP tools to interact with the app at
   http://localhost:5173
