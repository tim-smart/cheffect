import * as Prompt from "effect/ai/Prompt"

// What can be attached to a chat message. The model reads images and PDFs as
// files; it can't take other documents as files, so text files are read into
// the message as text before it's sent.

// The image formats OpenAI accepts.
const imageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
])

// Browsers don't agree on the type of a text file, and often report none, so
// text files are known by their extension.
const textTypesByExtension: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
}
const textTypes = new Set(Object.values(textTypesByExtension))

// Images stay broad so phones offer the camera, and hand over photos as JPEG.
export const accept = [
  "image/*",
  "android/allowCamera",
  "application/pdf",
  ...Object.keys(textTypesByExtension).map((extension) => `.${extension}`),
].join(",")

// The type to send a file as, or undefined when the model can't read it.
export const attachmentType = (file: {
  readonly name: string
  readonly type: string
}): string | undefined => {
  if (imageTypes.has(file.type) || file.type === "application/pdf") {
    return file.type
  }
  const dot = file.name.lastIndexOf(".")
  if (dot === -1) return undefined
  return textTypesByExtension[file.name.slice(dot + 1).toLowerCase()]
}

// Swaps text files for their contents, leaving images and PDFs as files.
export const inlineTextFiles = (prompt: Prompt.Prompt): Prompt.Prompt =>
  Prompt.fromMessages(
    prompt.content.map((message) =>
      message.role === "user"
        ? {
            ...message,
            content: message.content.map((part) =>
              part.type === "file" &&
              textTypes.has(part.mediaType) &&
              part.data instanceof Uint8Array
                ? Prompt.textPart({
                    text: `<file name="${part.fileName ?? "attachment"}">\n${new TextDecoder().decode(part.data)}\n</file>`,
                  })
                : part,
            ),
          }
        : message,
    ),
  )
