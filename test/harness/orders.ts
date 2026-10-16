// Every ordering of a scenario's entries. Scenarios are 3-5 entries, so this
// tops out at 120 orders; anything larger is a sign the scenario should be
// split, not that the runner should get cleverer.
export const everyOrder = <A>(
  items: ReadonlyArray<A>,
): ReadonlyArray<ReadonlyArray<A>> => {
  if (items.length > 5) {
    throw new Error(
      `everyOrder: ${items.length} entries would be ${factorial(items.length)} orders; keep scenarios to 5 entries`,
    )
  }
  if (items.length <= 1) return [items]
  const orders: Array<ReadonlyArray<A>> = []
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)]
    for (const order of everyOrder(rest)) {
      orders.push([item, ...order])
    }
  })
  return orders
}

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1))
