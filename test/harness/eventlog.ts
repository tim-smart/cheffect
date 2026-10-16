import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import type * as Event from "effect/eventlog/Event"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import type * as EventLogRemote from "effect/eventlog/EventLogRemote"

export const testIdentity = EventLog.makeIdentity.pipe(
  Effect.provide(EventLogEncryption.layerSubtle),
)

// An entry as another device would have written it. `msecs` sets the entry
// time, which is what last-writer-wins compares, so scenarios can state the
// real-time order independently of the order entries arrive in.
export const makeEntry = <E extends Event.Any>(options: {
  readonly msecs: number
  readonly event: E
  readonly payload: Schema.Schema.Type<E["payload"]>
}): EventJournal.Entry =>
  new EventJournal.Entry({
    id: EventJournal.makeEntryIdUnsafe({ msecs: options.msecs }),
    event: options.event.tag,
    primaryKey: options.event.primaryKey(options.payload),
    payload: Schema.encodeUnknownSync(options.event.payloadSchemaBinary)(
      options.payload,
    ),
  })

export interface FakeRemote {
  // Registers the remote with the EventLog; compose it next to the EventLog
  // layer so they share one Registry.
  readonly layer: Layer.Layer<never, never, EventLog.Registry>
  // Delivers entries as a remote change batch and returns once the handlers
  // have run for all of them.
  readonly deliver: (
    entries: ReadonlyArray<EventJournal.Entry>,
  ) => Effect.Effect<void, EventJournal.EventJournalError, EventLog.EventLog>
  // Entries the EventLog uploaded to this remote so far.
  readonly uploaded: Effect.Effect<ReadonlyArray<EventJournal.Entry>>
}

export const makeFakeRemote: Effect.Effect<FakeRemote> = Effect.gen(
  function* () {
    const id = EventJournal.makeRemoteIdUnsafe()
    const changes = yield* Queue.unbounded<
      EventJournal.RemoteEntry,
      EventLogRemote.EventLogRemoteError
    >()
    const uploads: Array<EventJournal.Entry> = []
    let sequence = 0

    const remote: EventLogRemote.EventLogRemote["Service"] = {
      id,
      changes: () => Effect.succeed(changes),
      write: ({ entries }) =>
        Effect.sync(() => {
          uploads.push(...entries)
        }),
      whenAuthenticated: (effect) => effect,
    }

    const layer = Layer.effectDiscard(
      EventLog.Registry.use((registry) => registry.registerRemote(remote)),
    )

    const deliver = Effect.fnUntraced(function* (
      entries: ReadonlyArray<EventJournal.Entry>,
    ) {
      yield* Queue.offerAll(
        changes,
        entries.map(
          (entry) =>
            new EventJournal.RemoteEntry({
              remoteSequence: sequence++,
              entry,
            }),
        ),
      )
      // The journal runs the handlers before it commits a remote entry, so
      // once every delivered id is in the journal the replay has finished.
      const log = yield* EventLog.EventLog
      const pending = new Set(entries.map((entry) => entry.idString))
      while (pending.size > 0) {
        for (const entry of yield* log.entries) {
          pending.delete(entry.idString)
        }
        if (pending.size > 0) yield* Effect.sleep("2 millis")
      }
    })

    return {
      layer,
      deliver,
      uploaded: Effect.sync(() => uploads.slice()),
    }
  },
)
