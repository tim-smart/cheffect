import * as Schema from "effect/Schema"
import { toXML } from "jstoxml"

export const UnknownToXml = Schema.String.pipe(
  Schema.transform(Schema.Unknown, {
    decode() {
      throw new Error("Encode only")
    },
    encode(obj) {
      return toXML(obj as any, {
        indent: "  ",
        contentMap(val) {
          return val === null ? "" : val
        },
      })
    },
  }),
)
