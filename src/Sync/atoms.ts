import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import { eventLogAtom, remoteAtom } from "@/EventLog"
import { join } from "./Join"
import { takeJoinLink } from "./ShareLink"

// The share link this page was opened with, taken out of the address bar
// before the router starts (see main.tsx).
export const initialJoinLink = takeJoinLink()

const syncRuntime = Atom.runtime((get) =>
  Layer.merge(get(eventLogAtom.layer), BrowserKeyValueStore.layerLocalStorage),
)

// Joins and reloads into the joined collection. Other tabs reload when the
// database is rebuilt.
export const joinAtom = syncRuntime
  .fn<{ readonly identity: string; readonly serverUrl?: string | undefined }>()(
    (target) =>
      join(target).pipe(
        Effect.andThen(Effect.sync(() => window.location.reload())),
        Effect.tapCause(Effect.logWarning),
      ),
  )
  .pipe(Atom.keepAlive)

// Whether the join dialog should offer an export first: unless sync is on,
// connected, and has nothing left to upload, the device may hold the only
// copy of something.
export const exportAdvisedAtom = syncRuntime.atom((get) =>
  Effect.gen(function* () {
    const journal = yield* EventJournal.EventJournal
    const remote = get(remoteAtom)
    if (AsyncResult.isSuccess(remote)) {
      const { id } = Context.get(remote.value, EventLogRemote.EventLogRemote)
      const pending = yield* journal.withRemoteUncommited(id, () => Effect.void)
      return Option.isSome(pending)
    }
    return (yield* journal.entries).length > 0
  }),
)
