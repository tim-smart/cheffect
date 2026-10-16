import * as Prompt from "effect/ai/Prompt"
import * as Schema from "effect/Schema"
import { UuidBytes, UuidFromString } from "@/lib/Id"

// One finished chat turn: the user's message and everything the assistant
// did to answer it, tool calls and results included, so they always sync
// together.
export const AiChatTurnId = UuidBytes("AiChatTurnId")
export type AiChatTurnId = typeof AiChatTurnId.Type
export const AiChatTurnIdFromString = UuidFromString(AiChatTurnId)

// A turn's messages as a JSON string. A `Prompt` can't be an event field
// itself: SchemaBinary can't tell the members of `FilePart.data` apart, so
// file parts are stripped before writing and the JSON is stored as text.
export const PromptJson = Schema.fromJsonString(
  Schema.toCodecJson(Prompt.Prompt),
)
