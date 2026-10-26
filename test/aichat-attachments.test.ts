import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Prompt from "effect/ai/Prompt"
import { attachmentType, inlineTextFiles } from "@/AiChat/Attachments"

// The chat model reads images and PDFs as files, and text files once they're
// read into the message. Anything else can't be attached.

test("only files the model can read can be attached", () => {
  assert.equal(
    attachmentType({ name: "a.png", type: "image/png" }),
    "image/png",
  )
  assert.equal(
    attachmentType({ name: "a.pdf", type: "application/pdf" }),
    "application/pdf",
  )
  // Text files are known by extension, whatever type the browser reports.
  assert.equal(attachmentType({ name: "Notes.MD", type: "" }), "text/markdown")
  assert.equal(
    attachmentType({ name: "list.csv", type: "application/vnd.ms-excel" }),
    "text/csv",
  )
  assert.equal(
    attachmentType({ name: "a.heic", type: "image/heic" }),
    undefined,
  )
  assert.equal(
    attachmentType({
      name: "a.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    undefined,
  )
  assert.equal(attachmentType({ name: "txt", type: "" }), undefined)
})

test("text files are sent as their contents, images stay files", () => {
  const image = Prompt.filePart({
    mediaType: "image/png",
    fileName: "a.png",
    data: new Uint8Array([1, 2, 3]),
  })
  const prompt = Prompt.fromMessages([
    Prompt.makeMessage("user", {
      content: [
        image,
        Prompt.filePart({
          mediaType: "text/markdown",
          fileName: "soup.md",
          data: new TextEncoder().encode("# Soup\n\nBoil water."),
        }),
        Prompt.textPart({ text: "Make this vegan" }),
      ],
    }),
  ])

  const [message] = inlineTextFiles(prompt).content
  assert.equal(message.role, "user")
  assert.deepEqual(message.content, [
    image,
    Prompt.textPart({
      text: '<file name="soup.md">\n# Soup\n\nBoil water.\n</file>',
    }),
    Prompt.textPart({ text: "Make this vegan" }),
  ])
})
