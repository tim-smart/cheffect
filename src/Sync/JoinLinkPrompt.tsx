import { useState } from "react"
import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Option from "effect/Option"
import { identityAtom } from "@/EventLog"
import { initialJoinLink } from "./atoms"
import { JoinDialog } from "./JoinDialog"

// Offers to join the collection a share link points at. A link to the
// collection this device is already in does nothing.
export function JoinLinkPrompt() {
  const [request, setRequest] = useState(() =>
    Option.getOrUndefined(initialJoinLink),
  )
  const identity = useAtomValue(identityAtom)
  if (request === undefined || !AsyncResult.isSuccess(identity)) return null
  if (identity.value === request.identity) return null
  return <JoinDialog request={request} onClose={() => setRequest(undefined)} />
}
