import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import { toXML } from "jstoxml"

export const UnknownToXml = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Unknown,
    SchemaTransformation.transform({
      decode(): unknown {
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
  ),
)
