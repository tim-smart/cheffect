import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Prompt from "effect/ai/Prompt"
import * as Response from "effect/ai/Response"

// AiChatService rebuilds the assistant message from the parts streamed so far
// on every chunk, so text that has not ended yet must still be included.
// effect dropped it before 4.0.4.

const assistantTexts = (prompt: Prompt.Prompt) =>
  prompt.content.flatMap((message) =>
    message.role === "assistant"
      ? message.content.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        )
      : [],
  )

test("fromResponseParts includes ended text once and text that has not ended", () => {
  const prompt = Prompt.fromResponseParts([
    Response.makePart("text-start", { id: "a" }),
    Response.makePart("text-delta", { id: "a", delta: "First" }),
    Response.makePart("text-end", { id: "a" }),
    Response.makePart("text-start", { id: "b" }),
    Response.makePart("text-delta", { id: "b", delta: "Second" }),
  ])
  assert.deepEqual(assistantTexts(prompt), ["First", "Second"])
})
