import * as Schema from "effect/Schema"
import * as Atom from "effect/reactivity/Atom"
import { kvsRuntime } from "@/lib/atom"

// The grocery list this device is showing; `null` is the default list. Per
// device and synchronous, since it drives a controlled input.
export const groceryCurrentListAtom = Atom.kvs({
  runtime: kvsRuntime,
  key: "cheffect:groceryCurrentList",
  schema: Schema.NullOr(Schema.String),
  defaultValue: () => null,
})
