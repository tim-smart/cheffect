import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as Event from "effect/eventlog/Event"
import type * as EventGroup from "effect/eventlog/EventGroup"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"

// Compaction of remote replays. When a batch of remote entries arrives, the
// handlers skip an entry the rest of the batch makes irrelevant. The journal
// still stores every entry, so other devices and later batches see them all.
//
// Entries are only ever skipped, never merged or rewritten. Last-writer-wins
// stamps each field with the id of the entry that wrote it, and a merged entry
// would need a new id, which would compare differently against writes outside
// the batch.
//
// Each event describes what its handler does to one row of one table:
//
// - `create` inserts the row only when it's missing.
// - `patch` writes `fields` under last-writer-wins, only when the row exists.
// - `set` writes `fields` under last-writer-wins, inserting the row when it's
//   missing.
// - `remove` hard-deletes the rows with the given keys.
// - `keep` is anything else, such as a tombstone, and is always replayed.
//   Without a table it may read or write any row, so nothing before it is
//   skipped because of anything after it.
//
// A handler that reads other rows is a `keep` without a table. Walking the
// batch in entry order, an entry is skipped when:
//
// - a later entry hard-deletes its row, so whatever the entry did is gone
//   with the row.
// - it's a patch, and later entries write every field it writes. Each of
//   those either finds the row and wins under last-writer-wins, or finds it
//   deleted after the patch.
// - it's a set, later entries write every field it writes, and the entry right
//   after it for the row is also a set. That set inserts the row if the
//   skipped one would have, before anything that needs the row exists. A set
//   with an undefined field isn't skipped this way, because an insert stamps
//   undefined fields and an update doesn't.
//
// Deletes and `keep` entries are never skipped.

export type Replay =
  | { readonly _tag: "Create"; readonly table: string }
  | {
      readonly _tag: "Patch" | "Set"
      readonly table: string
      readonly fields: object
    }
  | {
      readonly _tag: "Remove"
      readonly table: string
      readonly keys: ReadonlyArray<string>
    }
  | { readonly _tag: "Keep"; readonly table?: string }

export const create = (table: string): Replay => ({ _tag: "Create", table })

export const patch = (table: string, fields: object): Replay => ({
  _tag: "Patch",
  table,
  fields,
})

export const set = (table: string, fields: object): Replay => ({
  _tag: "Set",
  table,
  fields,
})

export const remove = (table: string, keys: ReadonlyArray<string>): Replay => ({
  _tag: "Remove",
  table,
  keys,
})

export const keep = (table?: string): Replay => ({ _tag: "Keep", table })

interface RowState {
  removed: boolean
  nextIsSet: boolean
  readonly written: Set<string>
}

const definedFields = (fields: object) =>
  Object.entries(fields).flatMap(([key, value]) =>
    value === undefined ? [] : [key],
  )

// The entries to replay, in entry order.
const compact = (
  batch: ReadonlyArray<{
    readonly entry: EventJournal.Entry
    readonly replay: Replay
  }>,
): ReadonlyArray<EventJournal.Entry> => {
  const rows = new Map<string, RowState>()
  const row = (table: string, key: string) => {
    const id = JSON.stringify([table, key])
    let state = rows.get(id)
    if (state === undefined) {
      state = { removed: false, nextIsSet: false, written: new Set() }
      rows.set(id, state)
    }
    return state
  }

  const sorted = batch.toSorted((a, b) =>
    EventJournal.Entry.Order(a.entry, b.entry),
  )
  const replayed: Array<EventJournal.Entry> = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const { entry, replay } = sorted[i]
    switch (replay._tag) {
      case "Keep": {
        replayed.push(entry)
        if (replay.table === undefined) {
          rows.clear()
        } else {
          row(replay.table, entry.primaryKey).nextIsSet = false
        }
        break
      }
      case "Remove": {
        replayed.push(entry)
        for (const key of replay.keys) {
          const state = row(replay.table, key)
          state.removed = true
          state.nextIsSet = false
        }
        break
      }
      case "Create": {
        const state = row(replay.table, entry.primaryKey)
        if (!state.removed) replayed.push(entry)
        state.nextIsSet = false
        break
      }
      case "Patch": {
        const state = row(replay.table, entry.primaryKey)
        const fields = definedFields(replay.fields)
        const overwritten = fields.every((field) => state.written.has(field))
        if (!state.removed && !overwritten) replayed.push(entry)
        for (const field of fields) state.written.add(field)
        state.nextIsSet = false
        break
      }
      case "Set": {
        const state = row(replay.table, entry.primaryKey)
        const fields = Object.keys(replay.fields)
        const complete = definedFields(replay.fields).length === fields.length
        const overwritten =
          complete &&
          state.nextIsSet &&
          fields.every((field) => state.written.has(field))
        if (!state.removed && !overwritten) replayed.push(entry)
        if (complete) {
          for (const field of fields) state.written.add(field)
        }
        state.nextIsSet = complete
        break
      }
    }
  }
  return replayed.reverse()
}

// Registers the group's compactor. An entry whose payload doesn't decode is
// replayed as `keep`, so its handler reports the failure as it would without
// compaction.
export const layer = <Events extends Event.Any>(
  group: EventGroup.EventGroup<Events>,
  replays: {
    readonly [Tag in Event.Tag<Events>]: (
      payload: Event.PayloadWithTag<Events, Tag>,
    ) => Replay
  },
): Layer.Layer<never, never, EventLog.Registry> =>
  Layer.effectDiscard(
    EventLog.Registry.use((registry) =>
      registry.registerCompaction({
        events: Object.keys(group.events),
        effect: ({ entries, write }) =>
          Effect.forEach(
            compact(
              entries.map((entry) => {
                const event: Event.Any | undefined = Object.hasOwn(
                  group.events,
                  entry.event,
                )
                  ? group.events[entry.event]
                  : undefined
                const replay =
                  event === undefined
                    ? keep()
                    : Schema.decodeUnknownOption(
                        event.payloadSchemaBinary as Schema.Codec<unknown>,
                      )(entry.payload).pipe(
                        Option.map((payload) =>
                          (
                            replays as Record<
                              string,
                              (payload: unknown) => Replay
                            >
                          )[entry.event](payload),
                        ),
                        Option.getOrElse(() => keep()),
                      )
                return { entry, replay }
              }),
            ),
            write,
            { discard: true },
          ),
      }),
    ),
  )
