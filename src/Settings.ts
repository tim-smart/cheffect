import * as Data from "effect/Data"
import * as Schema from "effect/Schema"
import { Store, storeIdAtom, syncEnabledAtom } from "./livestore/atoms"
import { events } from "./livestore/schema"
import { queryDb, sql } from "@livestore/livestore"
import { flow } from "effect"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import { Atom, Result } from "@effect-atom/atom-react"
import { kvsRuntime } from "./atoms"
import * as DateTime from "effect/DateTime"
import * as Function from "effect/Function"
import { makeResultOptionAtom } from "./lib/atom"
import * as Effect from "effect/Effect"

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
      const isSuccess = Result.isSuccess(result)
      if (isSuccess || !cacheAtom) {
        if (cacheAtom && isSuccess) {
          get.set(cacheAtom, result.value)
        }
        return result
      }
      const cached = get(cacheAtom)
      if (Option.isSome(cached)) {
        return Result.success(cached)
      } else if (setting.initialValue !== undefined) {
        get.set(cacheAtom, Option.some(setting.initialValue))
        return Result.success(Option.some(setting.initialValue))
      }
      return result
    },
    (ctx, newValue: Option.Option<S["Type"]>) => {
      const value = Schema.encodeSync(optionSchema)(newValue)
      ctx.set(
        Store.commit,
        events.settingsSet({
          id: setting.name,
          value,
          updatedAt: DateTime.unsafeNow(),
        }),
      )
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
  atomOverride?: Atom.Writable<
    Result.Result<Option.Option<S["Type"]>>,
    Option.Option<S["Type"]>
  >
}> {
  readonly atom = this.atomOverride ?? makeAtom(this)
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

export const aiCountry = new Setting({
  name: "aiCountry",
  label: "Country",
  schema: Schema.NonEmptyString,
  schemaInput: OptionFromString,
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

export const livestoreStoreId = new Setting({
  name: "livestoreStoreId",
  label: "LiveStore Store ID",
  schema: Schema.NonEmptyString,
  schemaInput: OptionFromString,
  atomOverride: makeResultOptionAtom(storeIdAtom),
})

export const livestoreSyncEnabled = new Setting({
  name: "livestoreSyncEnabled",
  label: "Enable Sync",
  schema: Schema.Boolean,
  schemaInput: AsSome(
    Schema.transform(Schema.String, Schema.Boolean, {
      decode: (s) => s === "true",
      encode: (b) => (b ? "true" : "false"),
    }),
    Function.constFalse,
  ),
  atomOverride: makeResultOptionAtom(syncEnabledAtom),
})

export const clearAiMemoryAtom = Atom.fn<void>()(
  Effect.fnUntraced(function* (_, get) {
    const store = get(Store.storeUnsafe)!
    store.commit(events.aiMemoryClear())
  }),
)
