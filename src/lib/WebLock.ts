import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Semaphore from "effect/Semaphore"

// Web Locks are shared by every tab of the origin, which is what makes a
// per-job lock enough to keep two tabs off the same extraction job. Where
// there is no lock manager the helpers fall back to in-process locks, the same
// way Effect's event journal does.

const lockManager = (): LockManager | undefined =>
  typeof navigator !== "undefined" && "locks" in navigator
    ? navigator.locks
    : undefined

const fallback = new Map<string, Semaphore.Semaphore>()
const fallbackSemaphore = (name: string) => {
  let semaphore = fallback.get(name)
  if (semaphore === undefined) {
    semaphore = Semaphore.makeUnsafe(1)
    fallback.set(name, semaphore)
  }
  return semaphore
}

const request = <A, E, R>(
  locks: LockManager,
  name: string,
  options: LockOptions,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<Option.Option<A>, E, R> =>
  Effect.callback((resume, signal) => {
    // The signal cancels a request that is still waiting. It can't be combined
    // with `ifAvailable`, and that mode never waits anyway.
    const request = options.ifAvailable ? options : { ...options, signal }
    const granted = locks.request(name, request, (lock) => {
      if (lock === null) {
        resume(Effect.succeedNone)
        return
      }
      return new Promise<void>((release) => {
        resume(
          Effect.onExit(Effect.asSome(effect), () => {
            release()
            // The lock is released once the callback's promise settles, and
            // the request promise settles after that. Waiting for it means a
            // caller that runs on from here can take the lock again.
            return Effect.promise(() => settled)
          }),
        )
      })
    })
    const settled = granted.then(
      () => undefined,
      () => undefined,
    )
    granted.catch((defect) => {
      if (signal.aborted) return
      resume(Effect.die(defect))
    })
  })

// Runs `effect` while holding the exclusive lock `name`, waiting for it.
export const withWebLock = <A, E, R>(
  name: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  const locks = lockManager()
  return locks
    ? Effect.map(
        request(locks, name, { mode: "exclusive" }, effect),
        (result) => (result as Option.Some<A>).value,
      )
    : fallbackSemaphore(name).withPermit(effect)
}

// Runs `effect` only if the lock `name` is free right now; `None` otherwise.
export const tryWebLock = <A, E, R>(
  name: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<Option.Option<A>, E, R> => {
  const locks = lockManager()
  return locks
    ? request(locks, name, { mode: "exclusive", ifAvailable: true }, effect)
    : fallbackSemaphore(name).withPermitsIfAvailable(1)(effect)
}
