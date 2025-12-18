import { Atom, Result } from "@effect-atom/atom-react"
import * as Option from "effect/Option"

export const makeResultOptionAtom = <R, W>(source: Atom.Writable<R, W>) =>
  Atom.writable(
    (get) => Result.success(Option.some(get(source))),
    (ctx, newValue: Option.Option<W>) => {
      if (Option.isSome(newValue)) {
        ctx.set(source, newValue.value)
      }
    },
  )
