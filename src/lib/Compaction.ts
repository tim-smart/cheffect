import * as Effect from "effect/Effect"
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
// A handler that reads other rows is a `keep` without a table.
//
// The handlers run in the order the batch arrived in, which need not be
// entry order: a device that was offline uploads its older entries after
// newer ones. "Later" below means later in that order. Overwriting also needs
// a newer entry, because an older one loses to the skipped entry under
// last-writer-wins. Walking the batch, an entry is skipped when:
//
// - a later entry hard-deletes its row, so whatever the entry did is gone
//   with the row.
// - it's a patch, and later, newer entries write every field it writes. Each
//   of those either finds the row and wins under last-writer-wins, or finds
//   it deleted after the patch.
// - it's a set, later, newer entries write every field it writes, and the
//   entry right after it for the row is also a set. That set inserts the row
//   if the skipped one would have, before anything that needs the row exists.
//   A set with an undefined field isn't skipped this way, because an insert
//   stamps undefined fields and an update doesn't.
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
  // Each field written later in the batch, with the newest id that wrote it.
  readonly written: Map<string, string>
}

const definedFields = (fields: object) =>
  Object.entries(fields).flatMap(([key, value]) =>
    value === undefined ? [] : [key],
  )

// The entries to replay, in batch order.
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
      state = { removed: false, nextIsSet: false, written: new Map() }
      rows.set(id, state)
    }
    return state
  }
  const overwritten = (
    state: RowState,
    entry: EventJournal.Entry,
    fields: ReadonlyArray<string>,
  ) =>
    fields.every((field) => {
      const newest = state.written.get(field)
      return newest !== undefined && newest > entry.idString
    })
  const write = (
    state: RowState,
    entry: EventJournal.Entry,
    fields: ReadonlyArray<string>,
  ) => {
    for (const field of fields) {
      const newest = state.written.get(field)
      if (newest === undefined || entry.idString > newest) {
        state.written.set(field, entry.idString)
      }
    }
  }

  const replayed: Array<EventJournal.Entry> = []
  for (let i = batch.length - 1; i >= 0; i--) {
    const { entry, replay } = batch[i]
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
        if (!state.removed && !overwritten(state, entry, fields)) {
          replayed.push(entry)
        }
        write(state, entry, fields)
        state.nextIsSet = false
        break
      }
      case "Set": {
        const state = row(replay.table, entry.primaryKey)
        const fields = Object.keys(replay.fields)
        const complete = definedFields(replay.fields).length === fields.length
        const skip =
          complete && state.nextIsSet && overwritten(state, entry, fields)
        if (!state.removed && !skip) replayed.push(entry)
        if (complete) write(state, entry, fields)
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
) =>
  EventLog.groupBatchCompaction(group, ({ entries, forward }) =>
    Effect.forEach(
      compact(
        entries.map(({ entry, event }) => ({
          entry,
          replay:
            event === undefined
              ? keep()
              : (replays as Record<string, (payload: unknown) => Replay>)[
                  event._tag
                ](event.payload),
        })),
      ),
      forward,
      { discard: true },
    ),
  )
