import * as Cause from "effect/Cause"
import * as Data from "effect/Data"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import * as Option from "effect/Option"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { kvsRuntime } from "./atoms"
import * as Function from "effect/Function"
import * as Effect from "effect/Effect"
import { eventLogAtom, writeEventAtom } from "./EventLog"
import { exportAll, ExportFileJson, importAll } from "./ExportFile"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { toast } from "sonner"
import { withToast } from "./lib/sonner"
import { SettingEvent } from "./Settings/Events"
import { SettingsRepo } from "./Settings/Repo"

// Every setting's encoded value, kept live from the `settings` snapshot.
const settingsRuntime = Atom.runtime((get) =>
  SettingsRepo.layer.pipe(Layer.provideMerge(get(eventLogAtom.layer))),
).pipe(Atom.keepAlive)

const settingValuesAtom = settingsRuntime
  .atom(SettingsRepo.useSync((_) => _.stream).pipe(Stream.unwrap))
  .pipe(Atom.keepAlive)

// A setting's value is its encoded `Option` as a JSON string. A cleared
// setting, or one that no longer decodes, reads as `None` and falls back to
// the initial value.
const makeAtom = <S extends Schema.Codec<any, any>>(setting: Setting<S>) => {
  const schema: Schema.Codec<S["Type"], S["Encoded"]> = setting.schema
  const valueSchema = Schema.fromJsonString(
    Schema.toCodecJson(Schema.Option(schema)),
  )
  const decodeValue = Schema.decodeUnknownOption(valueSchema)
  const read = Atom.make((get) =>
    AsyncResult.map(get(settingValuesAtom), (values) =>
      Option.fromUndefinedOr(values.get(setting.name)).pipe(
        Option.flatMap(decodeValue),
        Option.flatten,
        setting.initialValue
          ? Option.orElse(() => Option.some(setting.initialValue!))
          : Function.identity,
      ),
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
      const isSuccess = AsyncResult.isSuccess(result)
      if (isSuccess || !cacheAtom) {
        if (cacheAtom && isSuccess) {
          get.set(cacheAtom, result.value)
        }
        return result
      }
      const cached = get(cacheAtom)
      if (Option.isSome(cached)) {
        return AsyncResult.success(cached)
      }
      return result
    },
    (ctx, newValue: Option.Option<S["Type"]>) => {
      ctx.set(
        writeEventAtom,
        SettingEvent.set({
          id: setting.name,
          value: Schema.encodeSync(valueSchema)(newValue),
        }),
      )
      if (cacheAtom) {
        ctx.set(cacheAtom, newValue)
      }
    },
  )
}

export class Setting<S extends Schema.Codec<any, any>> extends Data.Class<{
  name: string
  label: string
  schema: S
  schemaInput: Schema.Codec<Option.Option<S["Type"]>, string>
  initialValue?: S["Type"] | undefined
  cached?: boolean | undefined
  atomOverride?: Atom.Writable<
    AsyncResult.AsyncResult<Option.Option<S["Type"]>>,
    Option.Option<S["Type"]>
  >
}> {
  readonly atom = this.atomOverride ?? makeAtom(this)
}

const OptionFromString = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Option(Schema.String),
    SchemaTransformation.transform({
      decode: (s) => (s === "" ? Option.none() : Option.some(s)),
      encode: Option.match({
        onNone: () => "",
        onSome: (s) => s,
      }),
    }),
  ),
)

const AsSome = <S extends Schema.Codec<any, any>>(
  schema: S,
  orElse: () => S["Type"],
) =>
  schema.pipe(
    Schema.decodeTo(
      Schema.Option(Schema.toType(schema)),
      SchemaTransformation.transform({
        decode: (a: S["Type"]) => Option.some(a),
        encode: Option.getOrElse(orElse),
      }),
    ),
  )

export const openAiApiKey = new Setting({
  name: "openAiApiKey",
  label: "OpenAI API key",
  schema: Schema.RedactedFromValue(Schema.String),
  schemaInput: OptionFromString.pipe(
    Schema.decodeTo(Schema.Option(Schema.RedactedFromValue(Schema.String))),
  ),
})

export const aiChatModel = new Setting({
  name: "aiChatModel",
  label: "AI chat model",
  schema: Schema.NonEmptyString,
  schemaInput: OptionFromString,
  initialValue: "gpt-6.1-sol",
})

export const openAiModel = new Setting({
  name: "openAiModel",
  label: "Extraction model",
  schema: Schema.NonEmptyString,
  schemaInput: OptionFromString,
  initialValue: "gpt-6-luna",
})

export const aiCountry = new Setting({
  name: "aiCountry",
  label: "Country",
  schema: Schema.NonEmptyString,
  schemaInput: OptionFromString,
})

const WeekDays = Schema.Literals([0, 1, 2, 3, 4, 5, 6])

export const mealPlanWeekStart = new Setting({
  name: "mealPlanWeekStart",
  label: "Week start",
  schema: WeekDays,
  schemaInput: AsSome(
    Schema.FiniteFromString.pipe(Schema.decodeTo(WeekDays)),
    () => 0 as const,
  ),
  cached: true,
})

// Export and import
//
// Both go through the EventLog runtime, so export works offline, with sync
// off and before the remote has ever connected. Export keeps the share-only
// behaviour: where files can't be shared it does nothing.

export const exportAllAtom = eventLogAtom.fn<void>()(
  Effect.fnUntraced(function* () {
    const json = yield* exportAll.pipe(
      Effect.flatMap(Schema.encodeEffect(ExportFileJson)),
    )
    const file = new File([json], `cheffect-${new Date().toISOString()}.txt`, {
      type: "text/plain",
    })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] })
    }
  }),
)

// A file that doesn't decode writes nothing. One that fails part way can be
// imported again, because import merges.
export const importAllAtom = eventLogAtom.fn<File>()(
  Effect.fnUntraced(
    function* (file) {
      const text = yield* Effect.promise(() => file.text())
      yield* importAll(text)
    },
    withToast(() => ({
      loading: "Importing data",
      onExit(exit, toastId) {
        if (Exit.isSuccess(exit)) {
          return toast.success("Data imported", {
            id: toastId,
            cancel: undefined,
          })
        }
        const error = Cause.squash(exit.cause)
        if (Schema.isSchemaError(error)) {
          return toast.error("This file can't be imported. Nothing changed.", {
            id: toastId,
            cancel: undefined,
            description: error.message,
          })
        }
        toast.error("Import didn't finish. Import the file again.", {
          id: toastId,
          cancel: undefined,
        })
      },
    })),
  ),
)
