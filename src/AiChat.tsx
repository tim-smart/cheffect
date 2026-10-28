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
  Minus,
  Paperclip,
  RotateCcw,
  Send,
  Square,
  X,
} from "lucide-react"
import * as Atom from "effect/reactivity/Atom"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Prompt from "effect/ai/Prompt"
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import { Streamdown } from "streamdown"
import { formatDistanceToNowStrict } from "date-fns"
import { useStickToBottom } from "use-stick-to-bottom"
import { toast } from "sonner"
import { cn } from "./lib/utils"
import { aiChatOpenAtom } from "./atoms"
import { groceryCurrentListAtom } from "./Groceries/currentList"
import {
  clearAtom,
  currentPromptAtom,
  isInactiveAtom,
  isVisualMessage,
  lastActiveAtom,
  resumeAtom,
  sendAtom,
} from "./AiChat/AiChatService"
import { ToolActivityList, type ToolCall } from "./AiChat/ToolActivity"
import { accept, attachmentType } from "./AiChat/Attachments"
import { router, scrollRestorationKey } from "./Router"
import { isAiEnabledAtom } from "./services/AiHelpers"
import { useVisualViewport, virtualKeyboard } from "./lib/hooks"

// ⌘J on Apple keyboards and Ctrl+J elsewhere opens and closes the chat, where
// other apps put their assistant. In Chrome and Edge on Windows and Linux
// this takes Ctrl+J from Downloads while the app has focus
const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
const toggleShortcut = isApple ? "⌘J" : "Ctrl+J"
const toggleKeyShortcuts = isApple ? "Meta+J" : "Control+J"
// layers that hold focus until they close, and get the shortcut's key
const modalLayers =
  "[role=dialog], [role=alertdialog], [role=menu], [role=listbox]"

export function AiChatModal() {
  const aiEnabled = useAtomValue(isAiEnabledAtom)
  const [isOpen, setIsOpen] = useAtom(aiChatOpenAtom)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const pushedHistoryRef = useRef(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const open = () => {
    if (!aiEnabled) {
      router.navigate({ to: "/settings" })
      return
    }
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null
    setIsOpen(true)
    ref.current?.classList.remove("hidden")
    inputRef.current?.focus()
  }

  // Minimizing puts focus back where it was before the chat opened, or on
  // the chat button when there was nowhere or it has gone
  const minimize = () => {
    setIsOpen(false)
    const target = returnFocusRef.current
    returnFocusRef.current = null
    const returnTo = target?.isConnected ? target : buttonRef.current
    returnTo?.focus({ preventScroll: true })
  }

  // Handle history state when modal opens/closes
  useEffect(() => {
    if (isOpen && !pushedHistoryRef.current) {
      // Push history state when modal opens. The router sees every
      // pushState as a navigation and resets the scroll for it, so push
      // through the router and keep the page where it is. The entry shares
      // the page's scroll position, so closing the chat doesn't undo any
      // scrolling done beside the desktop panel.
      router.navigate({
        to: ".",
        search: true,
        hash: true,
        state: {
          aiChatOpen: true,
          scrollKey: scrollRestorationKey(router.state.location),
        },
        resetScroll: false,
      })
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

  // The shortcut works from anywhere, the message field included: it needs
  // the modifier, so it never takes a key that would type text. Not with
  // Shift, which is the browsers' developer tools, or Alt, as AltGr is
  // Ctrl+Alt on Windows. A dialog or menu keeps the key, since the chat
  // can't take focus from it
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key !== "j" && e.key !== "J") ||
        (isApple ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) ||
        e.altKey ||
        e.shiftKey ||
        (e.target instanceof Element && e.target.closest(modalLayers) !== null)
      ) {
        return
      }
      e.preventDefault()
      if (e.repeat) return
      if (isOpen) {
        minimize()
      } else {
        open()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, aiEnabled])

  return (
    <>
      <div className="fixed floating-r floating-b z-50 flex items-center gap-2">
        <TimerList />
        {/* Floating Action Button */}
        <button
          ref={buttonRef}
          onClick={open}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg motion-safe:active:scale-95 transition-transform"
          aria-label="Open AI Chat"
          aria-keyshortcuts={toggleKeyShortcuts}
          title={`AI Sous-chef (${toggleShortcut})`}
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
          onMinimize={minimize}
          open={isOpen}
        />
      </div>
    </>
  )
}

function ModalContent({
  inputRef,
  onClose,
  onMinimize,
  open,
}: {
  readonly inputRef: React.RefObject<HTMLTextAreaElement | null>
  readonly onClose: () => void
  readonly onMinimize: () => void
  readonly open: boolean
}) {
  const { scrollRef, contentRef, scrollToBottom } = useStickToBottom({
    initial: "instant",
    resize: "smooth",
  })
  const setGroceryList = useAtomSet(groceryCurrentListAtom)
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
        role="region"
        aria-label="AI Sous-chef"
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
              onClick={onMinimize}
              className="rounded-full"
              size="icon"
              variant="ghost"
              aria-label="Minimize chat"
              aria-keyshortcuts={toggleKeyShortcuts}
              title={`Minimize (${toggleShortcut})`}
            >
              <Minus />
            </Button>
          </div>
        </div>
        {/* Messages */}
        <div
          ref={scrollRef}
          role="log"
          aria-label="Messages"
          className={cn(
            "flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 bg-card",
            cramped && "hidden",
          )}
          onClick={(e) => {
            if (!(e.target instanceof HTMLAnchorElement)) return
            e.preventDefault()
            const url = new URL(e.target.href)
            // The groceries page shows whichever list this device last
            // chose, so a link that names a list chooses it first
            if (url.pathname === "/groceries" && url.searchParams.has("list")) {
              setGroceryList(url.searchParams.get("list") || null)
            }
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
  const inactive = useAtomValue(isInactiveAtom) && !isLoading

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
  const items = chatItems(messages)
  // Only tool calls made for the latest message can still be waiting on
  // results; a run from an earlier message that was stopped stays stopped
  const lastUserIndex = items.findLastIndex(
    (item) => item.kind === "text" && item.role === "user",
  )
  const lastToolsIndex = items.findLastIndex((item) => item.kind === "tools")
  const activeToolsIndex = lastToolsIndex > lastUserIndex ? lastToolsIndex : -1
  return (
    <div ref={ref} className="py-4">
      <div
        className={cn(
          "space-y-3 motion-safe:transition-opacity motion-safe:duration-700",
          inactive && "opacity-40",
        )}
      >
        {items.map((item, i) =>
          item.kind === "tools" ? (
            <ToolActivityList
              key={i}
              calls={item.calls}
              active={isLoading && i === activeToolsIndex}
            />
          ) : (
            <div
              key={i}
              className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                role="article"
                className={cn(
                  // 60ch of text plus the px-4 padding, but never wider
                  // than 90% of the panel on narrow screens
                  `max-w-[min(90%,calc(60ch+2rem))] rounded-2xl px-4 py-2 leading-tight overflow-auto break-words`,
                  item.role === "user"
                    ? // Streamdown colors links text-primary, which would
                      // vanish into the bubble
                      "bg-primary text-primary-foreground [&_a]:text-primary-foreground"
                    : "bg-muted dark:bg-border text-foreground",
                )}
              >
                {item.parts.map((part, idx) => (
                  <Streamdown
                    key={idx}
                    animated
                    isAnimating={isLoading && item.role === "assistant"}
                    linkSafety={{ enabled: false }}
                  >
                    {part.text}
                  </Streamdown>
                ))}
              </div>
            </div>
          ),
        )}
      </div>
      {inactive && <ResumeBar inputRef={inputRef} />}
    </div>
  )
}

// A chat left alone for a while is set aside: the next message starts a new
// chat unless this brings the old one back.
function ResumeBar({
  inputRef,
}: {
  readonly inputRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const lastActive = useAtomValue(lastActiveAtom)
  const resume = useAtomSet(resumeAtom)
  return (
    <div className="sticky bottom-0 -mx-4 mt-3 flex flex-col items-center gap-2 bg-linear-to-t from-card from-60% to-transparent px-4 pt-6 pb-1">
      {lastActive !== undefined && (
        <p className="text-xs text-muted-foreground">
          Last used {formatDistanceToNowStrict(lastActive, { addSuffix: true })}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="rounded-full bg-card"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          resume()
          inputRef.current?.focus()
        }}
      >
        <RotateCcw />
        Resume chat
      </Button>
    </div>
  )
}

type ChatItem =
  | {
      readonly kind: "text"
      readonly role: "user" | "assistant"
      readonly parts: ReadonlyArray<Prompt.TextPart>
    }
  | {
      readonly kind: "tools"
      readonly calls: ReadonlyArray<ToolCall>
    }

/**
 * What the chat shows, in order: text bubbles and runs of tool calls. A tool
 * call is shown where the assistant made it, with its result attached once
 * the tool message carrying it arrives, so a call still running has its place
 * before the result exists. Consecutive calls, even across messages, form one
 * run. Provider-executed tools (web search) only report a result, which
 * stands in for the call.
 */
const chatItems = (
  messages: ReadonlyArray<Prompt.Message>,
): ReadonlyArray<ChatItem> => {
  const results = new Map<string, Prompt.ToolResultPart>()
  const calls = new Set<string>()
  for (const message of messages) {
    if (message.role === "system") continue
    for (const part of message.content) {
      if (part.type === "tool-result") results.set(part.id, part)
      else if (part.type === "tool-call") calls.add(part.id)
    }
  }
  const items: Array<ChatItem> = []
  const addCall = (call: ToolCall) => {
    const last = items.at(-1)
    if (last?.kind === "tools") {
      items[items.length - 1] = { kind: "tools", calls: [...last.calls, call] }
    } else {
      items.push({ kind: "tools", calls: [call] })
    }
  }
  for (const message of messages.filter(isVisualMessage)) {
    let text: Array<Prompt.TextPart> | undefined
    for (const part of message.content) {
      if (part.type === "text" && message.role !== "tool") {
        if (text === undefined) {
          text = []
          items.push({ kind: "text", role: message.role, parts: text })
        }
        text.push(part)
      } else if (part.type === "tool-call") {
        text = undefined
        addCall({
          id: part.id,
          name: part.name,
          params: part.params,
          result: results.get(part.id),
        })
      } else if (part.type === "tool-result" && !calls.has(part.id)) {
        text = undefined
        addCall({
          id: part.id,
          name: part.name,
          params: undefined,
          result: part,
        })
      }
    }
  }
  return items
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
  // Sending to an inactive chat starts a new one
  const inactive = useAtomValue(isInactiveAtom) && !isLoading

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
            accept={accept}
            multiple
            onChange={(e) => {
              const selectedFiles = Array.from(e.target.files ?? [])
              const unsupported = selectedFiles.filter(
                (f) => attachmentType(f) === undefined,
              )
              if (unsupported.length > 0) {
                toast.error(
                  `Can't attach ${unsupported.map((f) => f.name).join(", ")}`,
                  {
                    description:
                      "Attach images (PNG, JPEG, WebP, GIF), PDFs, or text, Markdown, CSV or JSON files.",
                  },
                )
              }
              // Reset the input value to allow selecting the same file again
              setTimeout(() => {
                e.target.value = ""
              }, 0)
              const supported = selectedFiles.filter(
                (f) => attachmentType(f) !== undefined,
              )
              if (supported.length === 0) return
              setFiles((prevFiles) => {
                const dataTransfer = new DataTransfer()
                const names = new Set<string>()
                if (prevFiles) {
                  Array.from(prevFiles).forEach((f) => {
                    names.add(f.name)
                    return dataTransfer.items.add(f)
                  })
                }
                supported.forEach((f) => {
                  if (names.has(f.name)) return
                  return dataTransfer.items.add(f)
                })
                return dataTransfer.files
              })
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
          placeholder={
            inactive ? "Start a new chat..." : "Type your message..."
          }
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
