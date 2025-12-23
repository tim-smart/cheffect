import { useState, useEffect, useRef } from "react"
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
  useAtomSubscribe,
  useAtomValue,
} from "@effect-atom/atom-react"
import * as Layer from "effect/Layer"
import { openAiClientLayer } from "@/services/AiHelpers"
import { pipe } from "effect"
import * as Array from "effect/Array"
import * as AiResponse from "@effect/ai/Response"
import * as Ref from "effect/Ref"
import * as Function from "effect/Function"
import { Streamdown } from "streamdown"

class AiChatService extends Effect.Service<AiChatService>()(
  "cheffect/AiChat/AiChatService",
  {
    scoped: Effect.gen(function* () {
      const model = yield* OpenAiLanguageModel.model("gpt-5-chat-latest")
      const registry = yield* Registry.AtomRegistry

      const chat = yield* AiChat.fromPrompt(
        Prompt.empty.pipe(
          Prompt.setSystem(
            `You are a helpful AI assistant specialized in providing information about recipes, meal planning, and cooking tips. Your goal is to assist users in finding recipes, suggesting meal plans, and answering any cooking-related questions they may have.`,
          ),
        ),
      )

      const send = (message: string) =>
        pipe(
          Effect.gen(function* () {
            const history = (yield* Ref.get(chat.history)).pipe(
              Prompt.merge(message),
            )
            registry.set(currentPromptAtom, history)
            let parts = Array.empty<AiResponse.AnyPart>()
            // @effect-diagnostics-next-line unnecessaryEffectGen:off
            return LanguageModel.streamText({
              prompt: history,
            }).pipe(
              Stream.tap((part) => {
                parts.push(part)
                return Effect.void
              }),
              Stream.ensuring(
                Effect.gen(function* () {
                  yield* Ref.update(
                    chat.history,
                    Function.flow(
                      Prompt.merge(message),
                      Prompt.merge(Prompt.fromResponseParts(parts)),
                    ),
                  )
                }),
              ),
            )
          }),
          Stream.unwrap,
          Stream.filter((part) => part.type === "text-delta"),
          Stream.scan("", (acc, part) => acc + part.delta),
          Stream.filter((s) => s.length > 0),
          Stream.provideSomeLayer(model),
        )

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
    return ai.send(message)
  }, Stream.unwrap),
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
      {isOpen && (
        <>
          {/* Mobile overlay (blocks interaction) */}
          <div
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setIsOpen(false)}
          />
          <ModalContent onClose={() => setIsOpen(false)} />
        </>
      )}
    </>
  )
}

function ModalContent({ onClose }: { readonly onClose: () => void }) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isInitialLoadRef = useRef(true)
  const currentPrompt = useAtomValue(currentPromptAtom)
  const messages = currentPrompt.content

  useEffect(() => {
    setTimeout(() => {
      if (isInitialLoadRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" })
        isInitialLoadRef.current = false
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      }
    }, 10)
  }, [currentPrompt])

  useAtomSubscribe(sendAtom, () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  })

  return (
    <div
      className="fixed z-50 bg-white shadow-2xl
                       inset-x-0 bottom-0 h-[85vh] rounded-t-2xl
                       md:inset-auto md:right-4 md:bottom-22 md:w-96 md:h-150 md:rounded-2xl
                       flex flex-col"
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-gray-400 mb-0">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Ask me anything about recipes or meal planning!</p>
            </div>
          </div>
        )}
        {messages
          .filter((m) => m.role !== "system")
          .map((message, i) => (
            <div
              key={(message.options.id as any) ?? i}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  message.role === "user"
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                {message.content
                  .filter((_) => _.type === "text")
                  .map((part, idx) => (
                    <Streamdown key={idx}>
                      {part.type === "text" ? part.text : ""}
                    </Streamdown>
                  ))}
              </div>
            </div>
          ))}
        <LatestMessage />
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <PromptInput />
    </div>
  )
}

function LatestMessage() {
  const result = useAtomValue(sendAtom)
  return (
    <>
      {Result.builder(result)
        .onSuccess((message) => (
          <div className={`flex justify-start`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 bg-gray-100 text-gray-900 text-sm`}
            >
              <Streamdown>{message}</Streamdown>
            </div>
          </div>
        ))
        .onWaiting(() => (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            </div>
          </div>
        ))
        .render()}
    </>
  )
}

function PromptInput() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState("")
  const sendMessage = useAtomSet(sendAtom)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const message = input.trim()
    if (!message) return

    setInput("")
    sendMessage(message)
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
