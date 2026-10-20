import { useEffect, useRef, useState } from "react"
import { TimerList } from "@/Timers/TimerList"
import { Button } from "@/components/ui/button"
import {
  ChevronDown,
  Eraser,
  FileText,
  Maximize2,
  MessageSquare,
  Minimize2,
  Paperclip,
  Send,
  Square,
  X,
} from "lucide-react"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import { Streamdown } from "streamdown"
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
import { useVisualViewport, virtualKeyboard } from "./lib/hooks"
import { ViewportDebug, viewportDebug } from "./lib/ViewportDebug"

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
      <div className="fixed right-4 floating-b z-50 flex items-center gap-2">
        <TimerList />
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
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg active:scale-95 transition-transform"
          aria-label="Open AI Chat"
        >
          <MessageSquare className="h-6 w-6" />
        </button>
      </div>

      {/* Modal - Desktop: bottom-right corner, allows page interaction. Mobile: full-screen modal */}
      {/* Mobile overlay (blocks interaction) */}
      <div ref={ref} className={isOpen ? "" : "hidden"}>
        <div
          className="fixed inset-0 z-50 bg-black/50 touch-none chat-panel:hidden"
          onClick={() => setIsOpen(false)}
        />
        <ModalContent
          inputRef={inputRef}
          onClose={() => setIsOpen(false)}
          open={isOpen}
        />
        {viewportDebug && <ViewportDebug />}
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
  const { scrollRef, contentRef, scrollToBottom } = useStickToBottom({
    initial: "instant",
    resize: "smooth",
  })
  const viewport = useVisualViewport()
  // Safari in landscape can leave less room than the message field needs:
  // the chat becomes a single row with the field and a way to hide the
  // keyboard
  const cramped = viewport.obstructed && viewport.height < 64
  const [maximized, setMaximized] = useState(false)
  // Where Chromium can say where the keyboard is, have it overlay the page
  // while the chat is open; see `virtualKeyboard`
  useEffect(() => {
    const keyboard = virtualKeyboard
    if (!open || !keyboard) return
    keyboard.overlaysContent = true
    return () => {
      keyboard.overlaysContent = false
    }
  }, [open])
  // With nothing of the page visible the chat can't be seen, so lower the
  // keyboard to get the screen back
  useEffect(() => {
    if (!open || !viewport.collapsed) return
    if (document.activeElement === inputRef.current) inputRef.current?.blur()
  }, [open, viewport.collapsed])
  useEffect(() => {
    setTimeout(scrollToBottom, 10)
  }, [viewport.obstructed, open])

  return (
    <>
      {/* Mobile: a sheet over the screen that, while the keyboard is up,
          covers exactly the visible part of the page. Desktop: a panel above
          the floating buttons, or most of the window when maximized. */}
      <div
        className={cn(
          "flex flex-col fixed z-50 bg-background shadow-2xl inset-x-0 overscroll-none",
          viewport.obstructed
            ? // paint the sheet below the visible area too, so the page
              // doesn't show between it and the keyboard's accessory bar
              "top-(--chat-top) h-(--chat-height) pt-[env(safe-area-inset-top)] after:absolute after:inset-x-0 after:top-full after:h-screen after:bg-background after:pointer-events-none chat-panel:after:hidden"
            : "top-[calc(env(safe-area-inset-top)+0.5rem)] bottom-0 rounded-t-2xl",
          "chat-panel:inset-auto chat-panel:right-4 chat-panel:floating-b chat-panel:rounded-2xl chat-panel:pt-0",
          maximized
            ? "chat-panel:top-4 chat-panel:h-auto chat-panel:w-[min(64rem,calc(100vw-2rem))]"
            : "chat-panel:top-auto chat-panel:w-[26rem] chat-panel:h-128 chat-panel:max-h-[calc(100dvh-7.5rem)]",
        )}
        onClick={(e) => e.stopPropagation()}
        style={
          {
            "--chat-top": `${viewport.top}px`,
            "--chat-height": `${viewport.height}px`,
          } as React.CSSProperties
        }
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center justify-between border-b border-border pl-4 pr-2 py-2 touch-none",
            // too short for the header and the message field: keep the
            // field, the header returns with the keyboard down
            viewport.obstructed && viewport.height < 160 && "hidden",
            "chat-panel:flex",
          )}
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">AI Sous-chef</h2>
          </div>
          <div className="flex items-center">
            <Button
              onClick={() => setMaximized(!maximized)}
              className="rounded-full hidden chat-panel:inline-flex"
              size="icon"
              variant="ghost"
              aria-label={maximized ? "Restore chat size" : "Maximize chat"}
              title={maximized ? "Restore size" : "Maximize"}
            >
              {maximized ? <Minimize2 /> : <Maximize2 />}
            </Button>
            <Button
              onClick={() => onClose()}
              className="rounded-full"
              size="icon"
              variant="ghost"
              aria-label="Close chat"
            >
              <X />
            </Button>
          </div>
        </div>
        {/* Messages */}
        <div
          ref={scrollRef}
          className={cn(
            "flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 bg-card",
            cramped && "hidden",
          )}
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
        <PromptInput
          onSubmit={scrollToBottom}
          inputRef={inputRef}
          viewportObstructed={viewport.obstructed}
          cramped={cramped}
        />
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
  const isLoading = useAtomValue(sendAtom, AsyncResult.isWaiting)
  const messages = currentPrompt.content
  const setInput = useAtomSet(inputAtom)

  useEffect(() => {
    onNewMessage()
  }, [messages.length])

  if (messages.length === 0) {
    return (
      <div className="flex flex-col gap-2 text-center h-full items-center justify-center text-muted-foreground mb-0 py-4">
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
    <div ref={ref} className="space-y-3 py-4">
      {messages.filter(isVisualMessage).map((message, i) =>
        message.role === "tool" ? (
          <div
            key={i}
            className="flex flex-col justify-start text-muted-foreground text-sm"
          >
            {message.content.map((part) =>
              part.type === "tool-result" ? (
                <span key={part.id} className="block">
                  Tool call "{part.name}"
                </span>
              ) : null,
            )}
          </div>
        ) : (
          <div
            key={i}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={cn(
                `max-w-[90%] rounded-2xl px-4 py-2 leading-tight overflow-auto break-words`,
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted dark:bg-border text-foreground",
              )}
            >
              {message.content
                .filter((_) => _.type === "text")
                .map((part, idx) => (
                  <Streamdown
                    key={idx}
                    animated
                    isAnimating={isLoading && message.role === "assistant"}
                    linkSafety={{ enabled: false }}
                  >
                    {part.type === "text" ? part.text : ""}
                  </Streamdown>
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
  viewportObstructed,
  cramped,
}: {
  readonly onSubmit: () => void
  readonly inputRef: React.RefObject<HTMLTextAreaElement | null>
  readonly viewportObstructed: boolean
  readonly cramped: boolean
}) {
  const [input, setInput] = useAtom(inputAtom)
  const inputTrim = input.trim()
  const sendMessage = useAtomSet(sendAtom)
  const handleSubmit = (e: React.SyntheticEvent) => {
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

  const isLoading = useAtomValue(sendAtom, AsyncResult.isWaiting)

  const clear = useAtomSet(clearAtom)

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "border-t border-border p-2 pl-1 z-10",
        viewportObstructed ? "" : "nav-pb chat-panel:pb-2!",
        cramped && "flex-1 min-h-0 p-0 border-0",
      )}
    >
      <div className={cn("flex gap-2 pl-15", cramped && "hidden")}>
        {(files ? Array.from(files) : []).map((file) => (
          <div key={file.name} className="relative">
            {file.type.startsWith("image/") ? (
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="size-16 rounded-md object-cover border border-border mb-2"
              />
            ) : (
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1.5 mb-2 max-w-32 overflow-hidden">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-xs truncate min-w-0" title={file.name}>
                  {file.name}
                </span>
              </div>
            )}
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
      <div
        className={cn(
          "flex gap-2 items-center",
          cramped && "h-full items-stretch gap-0",
        )}
      >
        <div className={cn("flex", cramped && "hidden")}>
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
            <Paperclip />
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/*,android/allowCamera,application/pdf"
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
          className={cn(
            "flex-1 rounded-lg border-2 border-border bg-card px-3 py-2 text-base focus:border-primary focus:outline-none field-sizing-content resize-none",
            // keep 16px text so iOS doesn't zoom, and scroll extra lines
            // inside the field
            cramped &&
              "h-full min-h-0 py-0 border-0 rounded-none leading-tight [field-sizing:fixed]",
          )}
          autoFocus
        />
        {cramped && (
          <button
            type="button"
            aria-label="Hide keyboard"
            className="h-full shrink-0 flex items-center gap-1 px-5 text-xs leading-none font-medium text-primary"
            onClick={() => inputRef.current?.blur()}
          >
            <ChevronDown className="size-4" />
            Hide keyboard
          </button>
        )}
        <Button
          type="submit"
          size="icon"
          className={cn(
            "h-10 w-10 rounded-full bg-primary hover:bg-orange-700",
            cramped && "hidden",
          )}
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
