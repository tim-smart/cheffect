import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Prompt from "effect/ai/Prompt"
import {
  attachmentType,
  inlineTextFiles,
  pastedImages,
} from "@/AiChat/Attachments"

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
  assert.equal(attachmentType({ name: "a.constructor", type: "" }), undefined)
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
        // Saved as UTF-16 with a byte order mark
        Prompt.filePart({
          mediaType: "text/plain",
          fileName: "dessert.txt",
          data: new Uint8Array([
            0xff, 0xfe, 0x43, 0x00, 0x72, 0x00, 0xe8, 0x00, 0x6d, 0x00, 0x65,
            0x00,
          ]),
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
    Prompt.textPart({ text: '<file name="dessert.txt">\nCrème\n</file>' }),
    Prompt.textPart({ text: "Make this vegan" }),
  ])
})

// A paste attaches the images on the clipboard, unless it holds text.

const clipboard = (files: Array<File>, text = "") => ({
  files,
  getData: (format: string) => (format === "text/plain" ? text : ""),
})

test("pasted images are attached under names not already taken", async () => {
  const screenshot = new File([new Uint8Array([1, 2, 3])], "image.png", {
    type: "image/png",
  })
  const photo = new File([new Uint8Array([4])], "image.jpeg", {
    type: "image/jpeg",
  })
  const notes = new File(["Boil water"], "notes.txt", { type: "text/plain" })

  const pasted = pastedImages(clipboard([screenshot, photo, notes]), [
    "Pasted image.png",
    "soup.md",
  ])
  assert.deepEqual(
    pasted.map((file) => [file.name, file.type]),
    [
      ["Pasted image 2.png", "image/png"],
      ["Pasted image.jpg", "image/jpeg"],
    ],
  )
  assert.deepEqual(
    new Uint8Array(await pasted[0].arrayBuffer()),
    new Uint8Array([1, 2, 3]),
  )

  // Two images in one paste get names of their own
  assert.deepEqual(
    pastedImages(clipboard([screenshot, screenshot]), []).map((f) => f.name),
    ["Pasted image.png", "Pasted image 2.png"],
  )
})

test("text on the clipboard pastes as text", () => {
  const picture = new File([new Uint8Array([1])], "image.png", {
    type: "image/png",
  })
  // As copied from a spreadsheet: the cells, and a picture of them
  assert.deepEqual(pastedImages(clipboard([picture], "1 cup\tflour"), []), [])
  assert.deepEqual(pastedImages(clipboard([], "flour"), []), [])
})
