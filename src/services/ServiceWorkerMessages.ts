import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as PubSub from "effect/PubSub"
import * as Stream from "effect/Stream"

export type ServiceWorkerMessage = Data.TaggedEnum<{
  ShareUrl: { url: string }
}>
export const ServiceWorkerMessage = Data.taggedEnum<ServiceWorkerMessage>()

export class ServiceWorkerMessages extends Effect.Service<ServiceWorkerMessages>()(
  "cheffect/ServiceWorkerMessages",
  {
    scoped: Effect.gen(function* () {
      const messages = yield* PubSub.unbounded<ServiceWorkerMessage>()
      const stream = Stream.fromPubSub(messages)

      function onMessage(event: MessageEvent) {
        if ("_tag" in event.data) {
          messages.unsafeOffer(event.data)
        }
      }

      if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener("message", onMessage)
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            navigator.serviceWorker?.removeEventListener("message", onMessage)
          }),
        )
      }

      return {
        messages,
        stream,
      }
    }),
  },
) {}
