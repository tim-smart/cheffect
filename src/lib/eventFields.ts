import type * as Schema from "effect/Schema"

// A local write hands its handler the payload object as written, which can
// carry more fields than the event, e.g. a whole `Recipe` with the form's
// `createdAt`. Handlers use only the event's own fields, the same ones a
// remote device decodes from the entry.
export const eventFields = <Fields extends Schema.Struct.Fields>(schema: {
  readonly fields: Fields
}) => {
  const keys = Object.keys(schema.fields)
  return <A extends object>(payload: A): A =>
    Object.fromEntries(keys.map((key) => [key, payload[key as keyof A]])) as A
}
