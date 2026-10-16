import * as Option from "effect/Option"
import * as EventLog from "effect/eventlog/EventLog"
import { parseSyncServerUrl } from "@/EventLog"

// Share links (TIM-255): `https://<app>/#join=<sync key>&server=<url>`. Both
// values live in the fragment, so the key never reaches a server log or a
// `Referer`.

export interface JoinRequest {
  readonly identity: string
  // None when a bare key was pasted: the device keeps its server.
  readonly serverUrl: Option.Option<string>
}

const decodeIdentity = Option.liftThrowable(EventLog.decodeIdentityString)

export const isSyncKey = (input: string): boolean =>
  Option.isSome(decodeIdentity(input))

export const makeShareLink = (options: {
  readonly appUrl: string
  readonly identity: string
  readonly serverUrl: string
}): string => {
  const fragment = new URLSearchParams({
    join: options.identity,
    server: options.serverUrl,
  })
  return `${new URL(options.appUrl).origin}/#${fragment}`
}

const parseLink = (input: string): Option.Option<JoinRequest> =>
  Option.liftThrowable((url: string) => new URL(url))(input).pipe(
    Option.map((url) => new URLSearchParams(url.hash.slice(1))),
    Option.flatMap((fragment) =>
      Option.all({
        identity: Option.fromNullishOr(fragment.get("join")).pipe(
          Option.filter(isSyncKey),
        ),
        serverUrl: Option.fromNullishOr(fragment.get("server")).pipe(
          Option.flatMap(parseSyncServerUrl),
        ),
      }),
    ),
    Option.map(({ identity, serverUrl }) => ({
      identity,
      serverUrl: Option.some(serverUrl),
    })),
  )

// What the "Join another collection" box accepts: a share link, or a bare
// sync key.
export const parseJoinInput = (input: string): Option.Option<JoinRequest> => {
  const trimmed = input.trim()
  return isSyncKey(trimmed)
    ? Option.some({ identity: trimmed, serverUrl: Option.none() })
    : parseLink(trimmed)
}

// Takes a share link out of the address bar, so the key doesn't stay in the
// URL or the history entry. Runs once, before the router reads the location.
export const takeJoinLink = (): Option.Option<JoinRequest> => {
  if (!new URLSearchParams(location.hash.slice(1)).has("join")) {
    return Option.none()
  }
  const link = location.href
  history.replaceState(history.state, "", location.pathname + location.search)
  return parseLink(link)
}
