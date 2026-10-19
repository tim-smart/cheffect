import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import * as Model from "effect/schema/Model"
import * as Atom from "effect/reactivity/Atom"

// Entity ids are UUID bytes inside the app and canonical lowercase
// `8-4-4-4-12` strings at every edge: routes, AI tool schemas, export files,
// event primary keys and reactivity keys. Never compare ids by reference;
// use `idEquals`, or key maps, sets and atom families by the string form.

export const uuidString = (bytes: Uint8Array): string => {
  let hex = ""
  for (let i = 0; i < 16; i++) {
    hex += bytes[i].toString(16).padStart(2, "0")
    if (i === 3 || i === 5 || i === 7 || i === 9) hex += "-"
  }
  return hex
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const uuidBytes = (uuid: string): Uint8Array<ArrayBuffer> => {
  if (!uuidPattern.test(uuid)) {
    throw new Error(`Not a UUID: ${JSON.stringify(uuid)}`)
  }
  const hex = uuid.replaceAll("-", "")
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export const generateUuidBytes = (): Uint8Array<ArrayBuffer> => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return bytes
}

export const idEquals = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// A branded UUID-bytes schema for one entity, e.g. `UuidBytes("RecipeId")`.
export const UuidBytes = <const B extends string>(
  brand: B,
): Schema.brand<typeof Model.Uint8Array, B> =>
  Model.Uint8Array.pipe(Schema.brand<B>(brand as never))

export type UuidBytes<B extends string> = Schema.brand<
  typeof Model.Uint8Array,
  B
>

// The string codec for an id: decodes a UUID string in any case, encodes the
// canonical lowercase form.
export const UuidFromString = <
  S extends Schema.Top & {
    readonly Type: Uint8Array
    readonly Encoded: Uint8Array<ArrayBuffer>
  },
>(
  id: S,
) =>
  Schema.String.check(Schema.isUUID()).pipe(
    Schema.decodeTo(
      id,
      SchemaTransformation.transform<S["Encoded"], string>({
        decode: uuidBytes,
        encode: uuidString,
      }),
    ),
  )

// An `Atom.family` that takes the string form and hands the factory the id,
// so two lookups of the same id share one atom.
export const familyById =
  <Id extends Uint8Array>(fromString: Schema.Codec<Id, string>) =>
  <T extends object>(f: (id: Id) => T): ((id: string) => T) => {
    const decode = Schema.decodeSync(fromString)
    return Atom.family((id: string) => f(decode(id)))
  }

// The `EventRow` key of a row with a UUID `id`. `patch` and `remove` carry
// `{ id }`, and the entry's primary key is the id's string form, which reads
// better in the journal than the default encoding of the bytes.
export const uuidKey = {
  fields: ["id"],
  derive: ({ id }: { readonly id: Uint8Array }) => uuidString(id),
} as const
