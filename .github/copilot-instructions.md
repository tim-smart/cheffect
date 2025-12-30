# AI Instructions

## Project Setup

- This project uses **pnpm** as the package manager

## Code Quality Checks

Before committing code, ensure:

- **prettier** must pass: Run `pnpm exec prettier --check .` to verify formatting
- **tsc --noEmit** must pass: Run `pnpm exec tsc --noEmit` to verify TypeScript type checking

## Reference source code

If you need to work out how something works, there are some `git submodule`s you
can refer to:

- `.agents/effect` - for the `effect` and `@effect/*` libraries
- `.agents/effect-atom` - for the `@effecto-atom/*` libraries
