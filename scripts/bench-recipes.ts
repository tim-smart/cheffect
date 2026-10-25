// Times the recipe list and search reads over a large library:
//
//   pnpm exec tsx scripts/bench-recipes.ts [count...]
//
// Each phase is what one user action costs on the main thread, leaving out
// the IndexedDB read itself: a write to any recipe reloads the table, which
// decodes every row and builds the recipes, then the list runs a search for
// every keystroke and sort change.

import * as Schema from "effect/Schema"
import { decodeRecipes, searchRecipes } from "@/Recipes/Repo"
import { encodeRows, makeLibrary, rowsSchema } from "./recipeLibrary"

// Warm up, then take the median, so JIT and GC pauses don't skew it.
const time = (run: () => unknown): number => {
  for (let i = 0; i < 5; i++) run()
  const samples: Array<number> = []
  for (let i = 0; i < 25; i++) {
    const start = performance.now()
    run()
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]!
}

const typing = ["c", "ch", "chi", "chic", "chick", "chicke", "chicken"]

const counts = process.argv.slice(2).map(Number)
for (const count of counts.length > 0 ? counts : [1000, 5000]) {
  const stored = encodeRows(makeLibrary(count))
  const rows = Schema.decodeSync(rowsSchema)(stored)
  const recipes = decodeRecipes(rows)

  const results: Record<string, number> = {
    "reload: decode rows": time(() => Schema.decodeSync(rowsSchema)(stored)),
    "reload: build recipes": time(() => decodeRecipes(rows)),
    "reload: first list": time(() =>
      searchRecipes(decodeRecipes(rows), { query: "", sortBy: "title" }),
    ),
  }
  results["reload: first list"]! -= results["reload: build recipes"]!
  for (const sortBy of ["title", "createdAt", "rating"] as const) {
    results[`list by ${sortBy}`] = time(() =>
      searchRecipes(recipes, { query: "", sortBy }),
    )
  }
  results[`type "chicken", per keystroke`] =
    time(() => {
      for (const query of typing) {
        searchRecipes(recipes, { query, sortBy: "title" })
      }
    }) / typing.length
  results["search with no match"] = time(() =>
    searchRecipes(recipes, { query: "zzzz", sortBy: "title" }),
  )

  console.log(`\n${count} recipes`)
  for (const [name, ms] of Object.entries(results)) {
    console.log(`  ${name.padEnd(32)} ${ms.toFixed(2).padStart(8)} ms`)
  }
}
