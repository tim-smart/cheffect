import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Prompt from "effect/ai/Prompt"
import * as Response from "effect/ai/Response"

// AiChatService rebuilds the assistant message from the parts streamed so far
// on every chunk, so text that has not ended yet must still be included.
// Upstream drops it; patches/effect@4.0.3.patch fixes that.

const assistantTexts = (prompt: Prompt.Prompt) =>
  prompt.content.flatMap((message) =>
    message.role === "assistant"
      ? message.content.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        )
      : [],
  )

test("fromResponseParts keeps text deltas that have not ended", () => {
  const prompt = Prompt.fromResponseParts([
    Response.makePart("text-start", { id: "a" }),
    Response.makePart("text-delta", { id: "a", delta: "Yes " }),
    Response.makePart("text-delta", { id: "a", delta: "chef" }),
  ])
  assert.deepEqual(assistantTexts(prompt), ["Yes chef"])
})

test("fromResponseParts includes ended text once", () => {
  const prompt = Prompt.fromResponseParts([
    Response.makePart("text-start", { id: "a" }),
    Response.makePart("text-delta", { id: "a", delta: "First" }),
    Response.makePart("text-end", { id: "a" }),
    Response.makePart("text-start", { id: "b" }),
    Response.makePart("text-delta", { id: "b", delta: "Second" }),
  ])
  assert.deepEqual(assistantTexts(prompt), ["First", "Second"])
})
