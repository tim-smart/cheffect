import { useState } from "react"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Option from "effect/Option"
import { Download } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { serverUrlAtom } from "@/EventLog"
import { exportAllAtom } from "@/Settings"
import { exportAdvisedAtom, joinAtom } from "./atoms"
import type { JoinRequest } from "./ShareLink"

// The one way into another collection, whether from a share link or a pasted
// key. Joining replaces everything on this device; nothing is merged.
export function JoinDialog({
  request,
  onClose,
}: {
  readonly request: JoinRequest | undefined
  readonly onClose: () => void
}) {
  return (
    <AlertDialog
      open={request !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        {request ? <JoinDialogBody request={request} /> : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function JoinDialogBody({ request }: { readonly request: JoinRequest }) {
  const join = useAtomSet(joinAtom, { mode: "promise" })
  const [joining, setJoining] = useState(false)
  const exportAdvised = useAtomValue(exportAdvisedAtom).pipe(
    AsyncResult.getOrElse(() => true),
  )
  const exportAll = useAtomSet(exportAllAtom)
  const serverUrl = useAtomValue(serverUrlAtom)
  const hasServer = Option.isSome(request.serverUrl) || Option.isSome(serverUrl)

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Join this collection?</AlertDialogTitle>
        <AlertDialogDescription>
          Everything on this device will be replaced by the shared collection:
          recipes, meal plans, menus, groceries and settings. Recipe imports in
          progress stop. Nothing is merged.
        </AlertDialogDescription>
      </AlertDialogHeader>

      {exportAdvised ? (
        <div className="rounded-md border border-border bg-muted/50 p-3 flex flex-col gap-2 text-sm">
          <p>
            Some of this device's data may not be on a sync server yet. Export
            it first to keep a copy.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={joining}
            onClick={() => exportAll()}
          >
            <Download />
            Export all data
          </Button>
        </div>
      ) : null}

      {hasServer ? null : (
        <p className="text-sm text-muted-foreground">
          This device has no sync server yet. Add one in Settings to download
          the collection.
        </p>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel disabled={joining}>Cancel</AlertDialogCancel>
        <Button
          type="button"
          variant="destructive"
          disabled={joining}
          onClick={() => {
            setJoining(true)
            join({
              identity: request.identity,
              serverUrl: Option.getOrUndefined(request.serverUrl),
            }).catch(() => {
              setJoining(false)
              toast.error("Joining didn't finish. Try again.")
            })
          }}
        >
          {joining ? "Joining…" : "Join and replace data"}
        </Button>
      </AlertDialogFooter>
    </>
  )
}
