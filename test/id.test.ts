import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Schema from "effect/Schema"
import { UuidBytes, UuidFromString } from "@/lib/Id"

// Entity ids are UUID bytes inside the app and canonical `8-4-4-4-12` strings
// at every edge: routes, AI tool schemas, export files, primary keys and
// reactivity keys.

const TestId = UuidBytes("TestId")
const TestIdFromString = UuidFromString(TestId)
const canonical = "0193c7a0-1b2c-7def-8123-456789abcdef"

test("ids cross the string edge as canonical lowercase UUIDs", () => {
  const decode = Schema.decodeSync(TestIdFromString)
  const encode = Schema.encodeSync(TestIdFromString)

  assert.equal(encode(decode(canonical)), canonical)
  assert.equal(encode(decode(canonical.toUpperCase())), canonical)
})
