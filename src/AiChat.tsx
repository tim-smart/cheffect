import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { X, Send, MessageSquare, Loader2 } from "lucide-react"
import { LanguageModel, Prompt } from "@effect/ai"
import * as Effect from "effect/Effect"
import * as AiChat from "@effect/ai/Chat"
import * as Stream from "effect/Stream"
import { OpenAiLanguageModel } from "@effect/ai-openai"
import {
  Atom,
  Registry,
  Result,
  useAtomSet,
  useAtomValue,
} from "@effect-atom/atom-react"
import * as Layer from "effect/Layer"
import { openAiClientLayer } from "@/services/AiHelpers"
import { pipe } from "effect"
import * as Array from "effect/Array"
import * as AiResponse from "@effect/ai/Response"
import * as Ref from "effect/Ref"
import { Streamdown } from "streamdown"
import * as Chunk from "effect/Chunk"
import { router } from "./Router"
import { recipeByIdAtom } from "./livestore/queries"
import { menuByIdAtom, menuEntriesAtom } from "./Menus/atoms"
import { MenuEntry } from "./domain/MenuEntry"
import { useStickToBottom } from "use-stick-to-bottom"
import { cn } from "./lib/utils"

class AiChatService extends Effect.Service<AiChatService>()(
  "cheffect/AiChat/AiChatService",
  {
    scoped: Effect.gen(function* () {
      const model = yield* OpenAiLanguageModel.model("gpt-5-chat-latest")
      const registry = yield* Registry.AtomRegistry

      const baseSystemPrompt = `You are a helpful AI assistant specialized in providing information about recipes, meal planning, and cooking tips. Your goal is to assist users in finding recipes, suggesting meal plans, and answering any cooking-related questions they may have.

You should be concise and informative in your responses, sacrificing some grammar for brevity when necessary.`

      const currentSystemPrompt = Effect.gen(function* () {
        const location = router.state.location
        const currentTime = `The current date and time is: ${new Date().toLocaleString()}.`

        if (location.pathname === "/") {
          return `${baseSystemPrompt}

The user is currently browsing the homepage of the recipe website, which contains a list of their recipes.

${currentTime}`
        } else if (location.pathname.startsWith("/recipes/")) {
          const id = location.pathname.split("/")[2]
          const recipe = yield* Atom.getResult(recipeByIdAtom(id))

          return `${baseSystemPrompt}

${currentTime}

The user is currently viewing the recipe titled "${recipe.title}".

Here are the details of the recipe:

${recipe.toXml()}`
        } else if (location.pathname === "/groceries") {
          return `${baseSystemPrompt}

The user is currently viewing their grocery list.

${currentTime}`
        } else if (location.pathname === "/plan") {
          return `${baseSystemPrompt}

The user is currently viewing their meal plan for the week.

${currentTime}`
        } else if (location.pathname === "/menus") {
          return `${baseSystemPrompt}

The user is currently browsing their list of menus.

${currentTime}`
        } else if (location.pathname.startsWith("/menus/")) {
          const id = location.pathname.split("/")[2]
          const menu = yield* Atom.getResult(menuByIdAtom(id))
          const menuEntries = (yield* Atom.get(menuEntriesAtom(id)))!

          return `${baseSystemPrompt}

${currentTime}

The user is currently viewing the menu titled "${menu.name}".

Here are the details of the menu and its entries:

${menu.toXml()}

${MenuEntry.toXml(menuEntries)}`
        }

        return baseSystemPrompt + "\n\n" + currentTime
      })

      const chat = yield* AiChat.fromPrompt(Prompt.empty)

      const send = Effect.fnUntraced(function* (message: string) {
        const history = (yield* Ref.get(chat.history)).pipe(
          Prompt.merge(message),
          Prompt.setSystem(yield* currentSystemPrompt),
        )
        registry.set(currentPromptAtom, history)
        let parts = Array.empty<AiResponse.AnyPart>()
        registry.set(
          currentPromptAtom,
          Prompt.merge(history, Prompt.fromResponseParts(parts)),
        )
        yield* pipe(
          LanguageModel.streamText({ prompt: history }),
          Stream.mapChunks((chunk) => {
            parts.push(...chunk)
            return Chunk.of(Prompt.fromResponseParts(parts))
          }),
          Stream.runForEach((response) => {
            registry.set(currentPromptAtom, Prompt.merge(history, response))
            return Effect.void
          }),
        )
        yield* Ref.set(chat.history, registry.get(currentPromptAtom))
      }, Effect.provide(model))

      return { send } as const
    }),
  },
) {}

const runtime = Atom.runtime((get) =>
  AiChatService.Default.pipe(Layer.provide(get(openAiClientLayer))),
).pipe(Atom.keepAlive)

const currentPromptAtom = Atom.make<Prompt.Prompt>(Prompt.empty).pipe(
  Atom.keepAlive,
)

const sendAtom = runtime.fn<string>()(
  Effect.fnUntraced(function* (message) {
    const ai = yield* AiChatService
    return yield* ai.send(message)
  }),
)

export function AiChatModal() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-4 bottom-22 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg active:scale-95 transition-transform"
        aria-label="Open AI Chat"
      >
        <MessageSquare className="h-6 w-6" />
      </button>

      {/* Modal - Desktop: bottom-right corner, allows page interaction. Mobile: full-screen modal */}
      {/* Mobile overlay (blocks interaction) */}
      <div className={isOpen ? "" : "hidden"}>
        <div
          className="fixed inset-0 z-50 bg-black/50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
        <ModalContent onClose={() => setIsOpen(false)} />
      </div>
    </>
  )
}

function ModalContent({ onClose }: { readonly onClose: () => void }) {
  const { scrollRef, contentRef, scrollToBottom } = useStickToBottom({
    initial: "instant",
    resize: "smooth",
  })
  const currentPrompt = useAtomValue(currentPromptAtom)
  const messages = currentPrompt.content

  return (
    <div
      className={cn(
        "flex fixed z-50 bg-white shadow-2xl inset-x-0 bottom-0 h-[85vh] rounded-t-2xl md:inset-auto md:right-4 md:bottom-22 md:w-96 md:h-150 md:rounded-2xl flex-col",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold">AI Assistant</h2>
        </div>
        <button
          onClick={() => onClose()}
          className="rounded-full p-2 hover:bg-gray-100 active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-gray-400 mb-0">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Ask me anything about recipes or meal planning!</p>
            </div>
          </div>
        )}
        <div ref={contentRef} className="space-y-4">
          {messages
            .filter((m) => m.role !== "system")
            .map((message, i) => (
              <div
                key={i}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    message.role === "user"
                      ? "bg-orange-500 text-white"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  {message.content.length === 0 ? (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                  ) : (
                    message.content
                      .filter((_) => _.type === "text")
                      .map((part, idx) => (
                        <Streamdown key={idx}>
                          {part.type === "text" ? part.text : ""}
                        </Streamdown>
                      ))
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Input */}
      <PromptInput onSubmit={scrollToBottom} />
    </div>
  )
}

function PromptInput({ onSubmit }: { readonly onSubmit: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState("")
  const sendMessage = useAtomSet(sendAtom)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const message = input.trim()
    if (!message) return

    setInput("")
    sendMessage(message)
    onSubmit()
  }

  const isLoading = useAtomValue(sendAtom, Result.isWaiting)

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:border-orange-500 focus:outline-none"
        />
        <Button
          type="submit"
          size="icon"
          className="h-10 w-10 rounded-full bg-orange-500 hover:bg-orange-600"
          disabled={isLoading || !input.trim()}
        >
          <Send />
        </Button>
      </div>
    </form>
  )
}
