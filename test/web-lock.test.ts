import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import { tryWebLock, withWebLock } from "@/lib/WebLock"

// Each extraction job runs under its own Web Lock, so a job is only ever
// worked on by one tab. Node ships `navigator.locks`, so this runs the real
// Web Locks path; the in-process fallback only exists for runtimes without it.

test("tryWebLock yields none while the name is held and runs once it is free", async () => {
  const program = Effect.gen(function* () {
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let acquired!: () => void
    const held = new Promise<void>((resolve) => {
      acquired = resolve
    })

    const holder = yield* Effect.forkChild(
      withWebLock(
        "cheffect/extract/job-1",
        Effect.sync(acquired).pipe(
          Effect.andThen(Effect.promise(() => released)),
          Effect.as("holder"),
        ),
      ),
    )
    yield* Effect.promise(() => held)

    const whileHeld = yield* tryWebLock(
      "cheffect/extract/job-1",
      Effect.succeed("second"),
    )
    const otherName = yield* tryWebLock(
      "cheffect/extract/job-2",
      Effect.succeed("other"),
    )
    release()
    const holderResult = yield* Fiber.join(holder)
    const afterRelease = yield* tryWebLock(
      "cheffect/extract/job-1",
      Effect.succeed("third"),
    )
    return { whileHeld, otherName, holderResult, afterRelease }
  })

  assert.deepEqual(await Effect.runPromise(program), {
    whileHeld: Option.none(),
    otherName: Option.some("other"),
    holderResult: "holder",
    afterRelease: Option.some("third"),
  })
})
