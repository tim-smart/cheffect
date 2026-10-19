import type * as Schema from "effect/Schema"

// The fields of a schema but `id`, read from a value that may carry more,
// e.g. a whole `Recipe` for a recipe update. These are what an `EventRow`
// patch writes; `id` is its key.
export const patchFields = <Fields extends Schema.Struct.Fields>(schema: {
  readonly fields: Fields
}) => {
  const keys = Object.keys(schema.fields).filter((key) => key !== "id")
  return <A extends Omit<Schema.Struct<Fields>["Type"], "id">>(
    value: A,
  ): Omit<Schema.Struct<Fields>["Type"], "id"> =>
    Object.fromEntries(keys.map((key) => [key, value[key as keyof A]])) as any
}
