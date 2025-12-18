import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import { toast } from "sonner"

export const withToast =
  <A, E, Args extends ReadonlyArray<any>>(
    options: (...args: Args) => {
      readonly loading: string | React.ReactNode
      readonly onExit: (exit: Exit.Exit<A, E>, toastId: number | string) => void
    },
  ) =>
  <R>(
    effect: Effect.Effect<A, E, R>,
    ...args: Args
  ): Effect.Effect<A, E, R> => {
    const opts = options(...args)
    return Effect.flatMap(Effect.fork(effect), (fiber) => {
      const toastId = toast.loading(opts.loading, {
        cancel: {
          label: "Cancel",
          onClick() {
            fiber.unsafeInterruptAsFork(fiber.id())
          },
        },
      })
      fiber.addObserver((exit) => {
        if (Exit.isInterrupted(exit)) {
          return toast.dismiss(toastId)
        }
        opts.onExit(exit, toastId)
      })
      return Fiber.join(fiber)
    })
  }
