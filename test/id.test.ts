import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Schema from "effect/Schema"
import * as Atom from "effect/reactivity/Atom"
import {
  UuidBytes,
  UuidFromString,
  familyById,
  generateUuidBytes,
  idEquals,
  uuidBytes,
  uuidString,
} from "@/lib/Id"

// Entity ids are UUID bytes inside the app and canonical `8-4-4-4-12` strings
// at every edge: routes, AI tool schemas, export files, primary keys and
// reactivity keys.

const TestId = UuidBytes("TestId")
const TestIdFromString = UuidFromString(TestId)
const canonical = "0193c7a0-1b2c-7def-8123-456789abcdef"
const canonicalBytes = [
  0x01, 0x93, 0xc7, 0xa0, 0x1b, 0x2c, 0x7d, 0xef, 0x81, 0x23, 0x45, 0x67, 0x89,
  0xab, 0xcd, 0xef,
]

test("ids cross the string edge as canonical lowercase UUIDs", () => {
  const decode = Schema.decodeSync(TestIdFromString)
  const encode = Schema.encodeSync(TestIdFromString)

  const id = decode(canonical)
  assert.deepEqual(Array.from(id), canonicalBytes)
  assert.equal(encode(id), canonical)
  assert.equal(encode(decode(canonical.toUpperCase())), canonical)
  assert.equal(uuidString(uuidBytes(canonical)), canonical)

  for (const bad of [
    "not-a-uuid",
    canonical.replaceAll("-", ""),
    canonical.slice(1),
  ]) {
    assert.throws(() => decode(bad), `"${bad}" should not decode`)
  }
})

test("new ids are random version 4 UUIDs", () => {
  const a = generateUuidBytes()
  const b = generateUuidBytes()
  assert.equal(a.length, 16)
  assert.equal(a[6] >> 4, 4, "version nibble")
  assert.equal(a[8] & 0xc0, 0x80, "variant bits")
  assert.notEqual(uuidString(a), uuidString(b))
})

test("ids compare by value and family atoms are keyed by the string form", () => {
  const a = uuidBytes(canonical)
  const b = uuidBytes(canonical)
  assert.ok(a !== b)
  assert.ok(idEquals(a, b))
  assert.ok(!idEquals(a, generateUuidBytes()))

  const built: Array<string> = []
  const family = familyById(TestIdFromString)((id) => {
    built.push(uuidString(id))
    return Atom.make(uuidString(id))
  })
  assert.strictEqual(family(canonical), family(canonical))
  assert.deepEqual(built, [canonical])
})
