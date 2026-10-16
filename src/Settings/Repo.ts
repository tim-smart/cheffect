import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { makeSnapshot } from "@/lib/Snapshot"
import type { SettingRow } from "./Table"

// Every setting's encoded value, keyed by setting name. Decoding is left to
// each setting's atom, which knows its schema.
export type SettingValues = ReadonlyMap<string, string>

const toValues = (rows: ReadonlyArray<SettingRow>): SettingValues =>
  new Map(rows.map((row) => [row.id, row.value]))

export class SettingsRepo extends Context.Service<SettingsRepo>()(
  "cheffect/Settings/Repo/SettingsRepo",
  {
    make: Effect.gen(function* () {
      const settings = yield* makeSnapshot("settings")
      return {
        stream: settings.stream.pipe(Stream.map(toValues)),
      } as const
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
