import * as Duration from "effect/Duration"
import * as Prompt from "effect/ai/Prompt"
import * as Schema from "effect/Schema"
import { AiChatTurnId, PromptJson } from "@/domain/AiChatTurn"
import { generateUuidBytes } from "@/lib/Id"
import { AiChatTurnEvent } from "./Events"

// A chat left alone for an hour is put aside: it fades, and the next message
// starts a fresh chat unless it's resumed first. A chat was last used at its
// latest turn, from any device; an empty chat has never been used. Times are
// epoch millis.

export const inactiveAfter = Duration.hours(1)

// When a chat last used at `lastActive` goes inactive.
export const inactiveAt = (lastActive: number): number =>
  lastActive + Duration.toMillis(inactiveAfter)

export const isInactive = (
  lastActive: number | undefined,
  now: number,
): boolean => lastActive !== undefined && now >= inactiveAt(lastActive)

// A resume is saved as a turn with no messages, so it syncs like any other
// turn and counts as use on every device. A clear removes it with the rest.
export const resumeTurn = (now: number) =>
  AiChatTurnEvent.set({
    id: AiChatTurnId.make(generateUuidBytes()),
    prompt: Schema.encodeSync(PromptJson)(Prompt.empty),
    entryTime: now,
  })
