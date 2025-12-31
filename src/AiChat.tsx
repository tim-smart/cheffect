import { useRef, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { X, Send, MessageSquare, Eraser, Square, Plus } from "lucide-react"
import {
  Atom,
  Result,
  useAtom,
  useAtomSet,
  useAtomValue,
} from "@effect-atom/atom-react"
import Markdown from "react-markdown"
import { useStickToBottom } from "use-stick-to-bottom"
import { cn } from "./lib/utils"
import { aiChatOpenAtom } from "./atoms"
import {
  clearAtom,
  currentPromptAtom,
  isVisualMessage,
  sendAtom,
} from "./AiChat/AiChatService"
import { router } from "./Router"
import { isAiEnabledAtom } from "./services/AiHelpers"
import { useIsViewportObstructed, useViewportObstructed } from "./lib/hooks"

export function AiChatModal() {
  const aiEnabled = useAtomValue(isAiEnabledAtom)
  const [isOpen, setIsOpen] = useAtom(aiChatOpenAtom)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pushedHistoryRef = useRef(false)

  // Handle history state when modal opens/closes
  useEffect(() => {
    if (isOpen && !pushedHistoryRef.current) {
      // Push history state when modal opens
      history.pushState({ aiChatOpen: true }, "")
      pushedHistoryRef.current = true
    } else if (!isOpen && pushedHistoryRef.current) {
      // Modal was closed via X button or overlay, clean up history state
      // Use replaceState to avoid triggering popstate event
      if (history.state && history.state.aiChatOpen) {
        history.back()
      }
      pushedHistoryRef.current = false
    }
  }, [isOpen])

  // Handle back button
  useEffect(() => {
    if (!isOpen) return

    const handlePopState = () => {
      if (pushedHistoryRef.current) {
        pushedHistoryRef.current = false
        setIsOpen(false)
      }
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [isOpen])

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => {
          if (!aiEnabled) {
            return router.navigate({ to: "/settings" })
          }
          setIsOpen(true)
          ref.current?.classList.remove("hidden")
          inputRef.current?.focus()
        }}
        className="fixed right-4 floating-b z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg active:scale-95 transition-transform"
        aria-label="Open AI Chat"
      >
        <MessageSquare className="h-6 w-6" />
      </button>

      {/* Modal - Desktop: bottom-right corner, allows page interaction. Mobile: full-screen modal */}
      {/* Mobile overlay (blocks interaction) */}
      <div ref={ref} className={isOpen ? "" : "hidden"}>
        <div
          className="fixed inset-0 z-50 bg-black/50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
        <ModalContent
          inputRef={inputRef}
          onClose={() => setIsOpen(false)}
          open={isOpen}
        />
      </div>
    </>
  )
}

function ModalContent({
  inputRef,
  onClose,
  open,
}: {
  readonly inputRef: React.RefObject<HTMLTextAreaElement | null>
  readonly onClose: () => void
  readonly open: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollRef, contentRef, scrollToBottom } = useStickToBottom({
    initial: "instant",
    resize: "smooth",
  })
  const viewportObstructed = useViewportObstructed()
  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: "instant" })
      scrollToBottom()
    }, 10)
  }, [viewportObstructed > 0, open])

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "flex fixed z-50 bg-background shadow-2xl inset-x-0 bottom-0 md:inset-auto md:right-4 md:floating-b md:w-100 md:h-150 flex-col transition-[top] duration-75 md:top-auto!",
          viewportObstructed > 0
            ? "md:rounded-2xl"
            : "top-[15vh]! rounded-t-2xl md:rounded-2xl",
        )}
        onClick={(e) => e.stopPropagation()}
        style={{ top: viewportObstructed }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pl-4 pr-2 py-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">AI Sous-chef</h2>
          </div>
          <Button
            onClick={() => onClose()}
            className="rounded-full"
            size="icon"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 bg-card"
          onClick={(e) => {
            if (!(e.target instanceof HTMLAnchorElement)) return
            e.preventDefault()
            const url = new URL(e.target.href)
            router.navigate({ to: url.pathname })
            onClose()
          }}
        >
          <MessagesList
            ref={contentRef}
            inputRef={inputRef}
            onNewMessage={scrollToBottom}
          />
        </div>
        {/* Input */}
        <PromptInput onSubmit={scrollToBottom} inputRef={inputRef} />
      </div>
    </>
  )
}

function MessagesList({
  ref,
  inputRef,
  onNewMessage,
}: {
  readonly ref: (instance: HTMLDivElement | null) => void
  readonly inputRef: React.RefObject<HTMLTextAreaElement | null>
  readonly onNewMessage: () => void
}) {
  const currentPrompt = useAtomValue(currentPromptAtom)
  const messages = currentPrompt.content
  const setInput = useAtomSet(inputAtom)

  useEffect(() => {
    onNewMessage()
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="flex flex-col gap-2 text-center h-full items-center justify-center text-muted-foreground mb-0">
        <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>Ask me anything about recipes or meal planning!</p>
        <div className="flex flex-wrap justify-center mt-2 gap-2">
          {tips.map((tip, i) => (
            <Button
              key={i}
              variant="outline"
              size="sm"
              className="rounded-full"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setInput(tip.prompt)
                inputRef.current?.focus()
              }}
            >
              {tip.title}
            </Button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div ref={ref} className="space-y-4">
      {messages.filter(isVisualMessage).map((message, i) =>
        message.role === "tool" ? (
          <div
            key={i}
            className="flex flex-col justify-start text-muted-foreground text-sm"
          >
            {message.content.map((part) => (
              <span key={part.id} className="block">
                Tool call "{part.name}"
              </span>
            ))}
          </div>
        ) : (
          <div
            key={i}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-2 prose dark:prose-invert leading-tight overflow-auto ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted dark:bg-border text-foreground"
              }`}
            >
              {message.content
                .filter((_) => _.type === "text")
                .map((part, idx) => (
                  <Markdown key={idx}>
                    {part.type === "text" ? part.text : ""}
                  </Markdown>
                ))}
            </div>
          </div>
        ),
      )}
    </div>
  )
}

const tips = [
  {
    title: "Create a recipe",
    prompt: "Create a recipe for ",
  },
  {
    title: "What's for dinner?",
    prompt: "What's for dinner?",
  },
  {
    title: "Remember allergies",
    prompt: "Remember someone is allergic to ",
  },
  {
    title: "Adjust this recipe",
    prompt: "I would like to change this recipe to ",
  },
  {
    title: "Create meal plan",
    prompt: "Create a meal plan for ",
  },
  {
    title: "Grocery list",
    prompt: "Add these items to my grocery list: ",
  },
]

const inputAtom = Atom.make("").pipe(Atom.setIdleTTL(0))

function PromptInput({
  inputRef,
  onSubmit,
}: {
  readonly onSubmit: () => void
  readonly inputRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const [input, setInput] = useAtom(inputAtom)
  const inputTrim = input.trim()
  const sendMessage = useAtomSet(sendAtom)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const message = input.trim()
    if (!message) return
    const options = {
      text: message,
      files,
    }

    setInput("")
    setFiles(null)
    sendMessage(options)
    onSubmit()
  }

  const fileRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<FileList | null>(null)

  const isLoading = useAtomValue(sendAtom, Result.isWaiting)

  const clear = useAtomSet(clearAtom)

  const viewportObstructed = useIsViewportObstructed()

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "border-t border-border p-2 pl-1 z-10",
        viewportObstructed ? "" : "nav-pb md:pb-2!",
      )}
    >
      <div className="flex gap-2 pl-15">
        {(files ? Array.from(files) : []).map((file) => (
          <div key={file.name} className="relative">
            <img
              src={URL.createObjectURL(file)}
              alt={file.name}
              className="size-16 rounded-md object-cover border border-border mb-2"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="absolute -top-2 -right-2 size-6 rounded-full"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!files) return
                const newFiles = Array.from(files).filter(
                  (f) => f.name !== file.name,
                )
                if (newFiles.length === 0) {
                  setFiles(null)
                } else {
                  const dataTransfer = new DataTransfer()
                  newFiles.forEach((f) => dataTransfer.items.add(f))
                  setFiles(dataTransfer.files)
                }
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 items-center">
        <div className="flex">
          <Button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              clear()
              inputRef.current?.focus()
            }}
            size="icon"
            variant="ghost"
            className="size-8"
            title="Clear chat"
          >
            <Eraser />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 -mx-1.5"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
          >
            <Plus />
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/*,android/allowCamera"
            multiple
            onChange={(e) => {
              const selectedFiles = e.target.files
              if (!selectedFiles || selectedFiles.length === 0) return
              setFiles((prevFiles) => {
                const dataTransfer = new DataTransfer()
                const names = new Set<string>()
                if (prevFiles) {
                  Array.from(prevFiles).forEach((f) => {
                    names.add(f.name)
                    return dataTransfer.items.add(f)
                  })
                }
                Array.from(selectedFiles).forEach((f) => {
                  if (names.has(f.name)) return
                  return dataTransfer.items.add(f)
                })
                return dataTransfer.files
              })
              // Reset the input value to allow selecting the same file again
              setTimeout(() => {
                e.target.value = ""
              }, 0)
            }}
          />
        </div>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return
            e.preventDefault()
            handleSubmit(e)
          }}
          placeholder="Type your message..."
          className="flex-1 rounded-lg border-2 border-border bg-card px-3 py-2 text-base focus:border-primary focus:outline-none field-sizing-content resize-none"
          autoFocus
        />
        <Button
          type="submit"
          size="icon"
          className="h-10 w-10 rounded-full bg-primary hover:bg-orange-700"
          disabled={!isLoading && !inputTrim}
          onClick={() => {
            if (!(isLoading && !inputTrim)) return
            sendMessage(Atom.Interrupt)
          }}
        >
          {isLoading && !inputTrim ? (
            <Square className="animate-pulse text-white" />
          ) : (
            <Send
              className={cn("text-white", isLoading ? "animate-pulse" : "")}
            />
          )}
        </Button>
      </div>
    </form>
  )
}
