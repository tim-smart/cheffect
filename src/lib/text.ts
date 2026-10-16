// One collator for every name and title, so screens agree on order.
// Case-insensitive, accent-sensitive at the base level ("e" and "é" tie),
// with natural numbers ("recipe 2" before "recipe 10").
export const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
})

export const compareText = (a: string, b: string): number =>
  collator.compare(a, b)

// Search is a substring test under Unicode case folding. Accents are kept, and
// unlike the old SQL `LIKE`, `%` and `_` mean themselves.
export const foldCase = (text: string): string => text.toLocaleLowerCase()

export const includesFolded = (text: string, query: string): boolean =>
  foldCase(text).includes(foldCase(query))
