import * as Data from "effect/Data"
import * as Schema from "effect/Schema"
import { Store } from "./livestore/atoms"
import { events } from "./livestore/schema"
import { queryDb, sql } from "@livestore/livestore"
import { flow } from "effect"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import { Atom, Result } from "@effect-atom/atom-react"
import { kvsRuntime } from "./atoms"

const makeAtom = <S extends Schema.Schema.AnyNoContext>(
  setting: Setting<S>,
) => {
  const schema: Schema.Schema<S["Type"], S["Encoded"]> = setting.schema
  const optionSchema = Schema.OptionFromSelf(schema)
  const read = Store.makeQuery(
    queryDb(
      {
        query: sql`SELECT value FROM settings WHERE id = ? AND value IS NOT NULL`,
        bindValues: [setting.name],
        schema: Schema.Array(
          Schema.Struct({
            value: Schema.OptionFromNullOr(Schema.parseJson(schema)),
          }),
        ),
      },
      {
        map: flow(
          Array.head,
          Option.flatMap((row) => row.value),
        ),
      },
    ),
  )

  const cacheAtom =
    setting.cached &&
    Atom.kvs({
      runtime: kvsRuntime,
      key: `setting:${setting.name}`,
      schema: Schema.Option(schema),
      defaultValue: Option.none,
    })

  return Atom.writable(
    (get) => {
      const result = get(read)
      if (Result.isSuccess(result) || !cacheAtom) {
        return result
      }
      const cached = get(cacheAtom)
      if (Option.isSome(cached)) {
        return Result.success(cached)
      } else if (setting.initialValue !== undefined) {
        return Result.success(Option.some(setting.initialValue))
      }
      return result
    },
    (ctx, newValue: Option.Option<S["Type"]>) => {
      const value = Schema.encodeSync(optionSchema)(newValue)
      ctx.set(Store.commit, events.settingsSet({ id: setting.name, value }))
      if (cacheAtom) {
        ctx.set(cacheAtom, newValue)
      }
    },
  )
}

export class Setting<S extends Schema.Schema.AnyNoContext> extends Data.Class<{
  name: string
  label: string
  schema: S
  schemaInput: Schema.Schema<Option.Option<S["Type"]>, string>
  initialValue?: S["Type"] | undefined
  cached?: boolean | undefined
}> {
  readonly atom = makeAtom(this)
}

const OptionFromString = Schema.String.pipe(
  Schema.transform(Schema.OptionFromSelf(Schema.String), {
    decode: (s) => (s === "" ? Option.none() : Option.some(s)),
    encode: Option.match({
      onNone: () => "",
      onSome: (s) => s,
    }),
  }),
)

const AsSome = <S extends Schema.Schema.Any>(
  schema: S,
  orElse: () => S["Type"],
) =>
  schema.pipe(
    Schema.transform(Schema.OptionFromSelf(Schema.typeSchema(schema)), {
      decode: Option.some,
      encode: Option.getOrElse(orElse),
    }),
  )

export const openAiApiKey = new Setting({
  name: "openAiApiKey",
  label: "OpenAI API Key",
  schema: Schema.Redacted(Schema.String),
  schemaInput: OptionFromString.pipe(
    Schema.compose(Schema.OptionFromSelf(Schema.Redacted(Schema.String))),
  ),
})

const WeekDays = Schema.Literal(0, 1, 2, 3, 4, 5, 6)

export const mealPlanWeekStart = new Setting({
  name: "mealPlanWeekStart",
  label: "Week Start",
  schema: WeekDays,
  schemaInput: AsSome(
    Schema.NumberFromString.pipe(Schema.compose(WeekDays)),
    () => 0 as const,
  ),
  cached: true,
})
