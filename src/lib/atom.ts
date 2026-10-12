import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Option from "effect/Option"

export const makeResultOptionAtom = <R, W>(source: Atom.Writable<R, W>) =>
  Atom.writable(
    (get) => AsyncResult.success(Option.some(get(source))),
    (ctx, newValue: Option.Option<W>) => {
      if (Option.isSome(newValue)) {
        ctx.set(source, newValue.value)
      }
    },
  )
