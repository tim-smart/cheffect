import { useState } from "react"
import { useAtom, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Option from "effect/Option"
import { Copy, Eye, EyeOff, Share2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  defaultSyncServerUrl,
  identityAtom,
  parseSyncServerUrl,
  serverUrlAtom,
  syncEnabledAtom,
  syncServerUrlAtom,
} from "@/EventLog"
import { JoinDialog } from "./JoinDialog"
import { makeShareLink, parseJoinInput, type JoinRequest } from "./ShareLink"

// Controls the server URL, Enable Sync, the sync key and joining another
// collection. Changing the server or toggling sync takes effect without a
// reload: the remote follows the settings, and a new server receives this
// device's whole journal on its first connection.
export function SyncSettings() {
  const [joinRequest, setJoinRequest] = useState<JoinRequest>()
  return (
    <>
      <EnableSyncField />
      <ServerUrlField />
      <SyncKeyField />
      <JoinAnotherCollection onJoin={setJoinRequest} />
      <JoinDialog
        request={joinRequest}
        onClose={() => setJoinRequest(undefined)}
      />
    </>
  )
}

function ServerUrlField() {
  const [stored, setStored] = useAtom(syncServerUrlAtom)
  const [value, setValue] = useState(() => Option.getOrElse(stored, () => ""))
  const [invalid, setInvalid] = useState(false)
  const fallback = defaultSyncServerUrl()

  const save = () => {
    if (value.trim() === "") {
      setInvalid(false)
      setValue("")
      setStored(Option.none())
      return
    }
    const url = parseSyncServerUrl(value)
    setInvalid(Option.isNone(url))
    if (Option.isSome(url)) {
      setValue(url.value)
      setStored(url)
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <Label htmlFor="syncServerUrl">Sync server</Label>
      <Input
        id="syncServerUrl"
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder={Option.getOrElse(fallback, () => "wss://host/sync")}
        value={value}
        aria-invalid={invalid}
        aria-describedby="syncServerUrlHint"
        onChange={(e) => {
          setValue(e.target.value)
          setInvalid(false)
        }}
        onBlur={save}
      />
      {invalid ||
        (Option.isSome(fallback) && (
          <p
            id="syncServerUrlHint"
            className={
              invalid
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {invalid
              ? "Enter an address starting with wss://, ws://, https:// or http://."
              : "Leave blank to sync with the server this app is served from."}
          </p>
        ))}
    </form>
  )
}

function EnableSyncField() {
  const [enabled, setEnabled] = useAtom(syncEnabledAtom)
  const hasServer = Option.isSome(useAtomValue(serverUrlAtom))
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="syncEnabled">Enable sync</Label>
      <Switch
        id="syncEnabled"
        checked={enabled && hasServer}
        disabled={!hasServer}
        aria-describedby={hasServer ? undefined : "syncEnabledHint"}
        onCheckedChange={setEnabled}
      />
    </div>
  )
}

const copy = (text: string, done: string) =>
  navigator.clipboard.writeText(text).then(
    () => toast.success(done),
    () => toast.error("Couldn't copy to the clipboard."),
  )

function SyncKeyField() {
  const identity = useAtomValue(identityAtom).pipe(
    AsyncResult.getOrElse(() => ""),
  )
  const serverUrl = useAtomValue(serverUrlAtom)
  const [revealed, setRevealed] = useState(false)

  const share = (serverUrl: string) => {
    const url = makeShareLink({
      appUrl: window.location.href,
      identity,
      serverUrl,
    })
    if (typeof navigator.share === "function") {
      navigator
        .share({ title: "Join my Cheffect recipes", url })
        .catch(() => {})
    } else {
      copy(url, "Share link copied")
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="syncKey">Sync key</Label>
      <InputGroup>
        <InputGroupInput
          id="syncKey"
          readOnly
          type={revealed ? "text" : "password"}
          value={identity}
          className="font-mono text-xs"
          aria-describedby="syncKeyWarning"
          onFocus={(e) => e.target.select()}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={revealed ? "Hide sync key" : "Show sync key"}
            aria-pressed={revealed}
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <p id="syncKeyWarning" className="text-sm text-muted-foreground">
        Anyone with this key can read and change all your data.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={identity === ""}
          onClick={() => copy(identity, "Sync key copied")}
        >
          <Copy />
          Copy
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={identity === "" || Option.isNone(serverUrl)}
          title={
            Option.isNone(serverUrl)
              ? "Enter a sync server URL first"
              : undefined
          }
          onClick={() => Option.map(serverUrl, share)}
        >
          <Share2 />
          Share
        </Button>
      </div>
    </div>
  )
}

function JoinAnotherCollection({
  onJoin,
}: {
  readonly onJoin: (request: JoinRequest) => void
}) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [invalid, setInvalid] = useState(false)

  const close = (open: boolean) => {
    setOpen(open)
    if (!open) {
      setInput("")
      setInvalid(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="mr-auto"
        onClick={() => setOpen(true)}
      >
        Join another collection…
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              const request = parseJoinInput(input)
              if (Option.isNone(request)) {
                setInvalid(true)
                return
              }
              close(false)
              onJoin(request.value)
            }}
          >
            <DialogHeader>
              <DialogTitle>Join another collection</DialogTitle>
              <DialogDescription>
                Paste a share link or a sync key from another device.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="joinInput" className="sr-only">
                Share link or sync key
              </Label>
              <Textarea
                id="joinInput"
                rows={4}
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs break-all"
                value={input}
                aria-invalid={invalid}
                aria-describedby={invalid ? "joinInputError" : undefined}
                onChange={(e) => {
                  setInput(e.target.value)
                  setInvalid(false)
                }}
              />
              {invalid ? (
                <p id="joinInputError" className="text-sm text-destructive">
                  That isn't a share link or a sync key.
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={input.trim() === ""}>
                Continue
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
