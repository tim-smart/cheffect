import * as Dns from "node:dns"
import * as Http from "node:http"
import * as Https from "node:https"
import * as Net from "node:net"
import * as Zlib from "node:zlib"
import * as Stream from "node:stream"
import type { Readable } from "node:stream"

// Fetches a web page for the recipe importer, for the Docker server's `/fetch`
// route and the Vercel function alike. Anyone who can reach the route can make
// this server fetch a URL, so only public http(s) addresses are allowed. The
// check runs inside the connection's DNS lookup, so the address that passed is
// the one connected to, and again on every redirect.

export interface FetchedPage {
  readonly status: number
  readonly contentType: string
  readonly body: string
}

export class FetchGuardError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface FetchOptions {
  readonly timeoutMs?: number
  readonly maxBytes?: number
  readonly maxRedirects?: number
  // Tests allow loopback here; everything else uses the default.
  readonly isAllowedAddress?: (address: string) => boolean
}

const desktopUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

const mobileUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

// YouTube's desktop pages for Shorts run past the size limit. A mobile browser
// is redirected to m.youtube.com, whose pages are half the size and carry the
// same video details.
export const userAgentFor = (url: URL): string => {
  const host = url.hostname.toLowerCase()
  return host === "youtube.com" || host.endsWith(".youtube.com")
    ? mobileUserAgent
    : desktopUserAgent
}

const blocked = new Net.BlockList()
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4")
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6")
}

// Public unicast only: no private, loopback, link-local, multicast or
// reserved ranges. IPv4-mapped IPv6 addresses are checked as IPv4.
export const isPublicAddress = (address: string): boolean => {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped) return isPublicAddress(mapped[1])
  const family = Net.isIP(address)
  if (family === 0) return false
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6")
}

const blockedError = () =>
  new FetchGuardError(403, "The address is not a public web address")

const guardedLookup =
  (isAllowed: (address: string) => boolean): Net.LookupFunction =>
  (hostname, options, callback) => {
    Dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, "", 4)
      const list = addresses as Array<Dns.LookupAddress>
      if (list.length === 0 || !list.every((a) => isAllowed(a.address))) {
        return callback(blockedError(), "", 4)
      }
      if (options.all) return callback(null, list as any, 4)
      callback(null, list[0].address, list[0].family)
    })
  }

// `pipeline` destroys the decompressor when the response aborts or fails, so
// a timeout ends the read instead of leaving it waiting for more bytes.
const decompress = (response: Http.IncomingMessage): Readable => {
  const decoder = (() => {
    switch (response.headers["content-encoding"]) {
      case "gzip":
      case "x-gzip":
        return Zlib.createGunzip()
      case "deflate":
        return Zlib.createInflate()
      case "br":
        return Zlib.createBrotliDecompress()
      default:
        return undefined
    }
  })()
  return decoder === undefined
    ? response
    : Stream.pipeline(response, decoder, () => {})
}

const charset = (contentType: string): string => {
  const match = /charset=["']?([\w-]+)/i.exec(contentType)
  try {
    return new TextDecoder(match?.[1]).encoding
  } catch {
    return "utf-8"
  }
}

const request = (
  url: URL,
  options: Required<FetchOptions>,
  signal: AbortSignal,
): Promise<Http.IncomingMessage> =>
  new Promise((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, "")
    // A literal address skips the DNS lookup, so it is checked here.
    if (Net.isIP(host) !== 0 && !options.isAllowedAddress(host)) {
      return reject(blockedError())
    }
    const client = url.protocol === "https:" ? Https : Http
    const req = client.get(url, {
      lookup: guardedLookup(options.isAllowedAddress),
      signal,
      headers: {
        "user-agent": userAgentFor(url),
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "accept-encoding": "gzip, deflate, br",
      },
    })
    req.on("response", resolve)
    req.on("error", reject)
  })

const readBody = async (
  response: Http.IncomingMessage,
  maxBytes: number,
): Promise<Buffer> => {
  const chunks: Array<Buffer> = []
  let size = 0
  for await (const chunk of decompress(response)) {
    size += chunk.length
    if (size > maxBytes) {
      response.destroy()
      throw new FetchGuardError(502, "The page is too large")
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const toUrl = (input: string, base?: URL): URL => {
  let url: URL
  try {
    url = new URL(input, base)
  } catch {
    throw new FetchGuardError(400, "Not a valid URL")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchGuardError(400, "Only http and https URLs can be fetched")
  }
  return url
}

// Follows up to `maxRedirects` redirects, checking each hop. A non-2xx answer
// from the site is returned as it is, so the caller can pass the status on.
export const fetchPage = async (
  input: string,
  options: FetchOptions = {},
): Promise<FetchedPage> => {
  const resolved: Required<FetchOptions> = {
    timeoutMs: options.timeoutMs ?? 15_000,
    maxBytes: options.maxBytes ?? 2 * 1024 * 1024,
    maxRedirects: options.maxRedirects ?? 5,
    isAllowedAddress: options.isAllowedAddress ?? isPublicAddress,
  }
  const signal = AbortSignal.timeout(resolved.timeoutMs)
  let url = toUrl(input)
  try {
    for (let hop = 0; ; hop++) {
      const response = await request(url, resolved, signal)
      const status = response.statusCode ?? 502
      const location = response.headers.location
      if (status >= 300 && status < 400 && location !== undefined) {
        response.resume()
        if (hop >= resolved.maxRedirects) {
          throw new FetchGuardError(502, "Too many redirects")
        }
        url = toUrl(location, url)
        continue
      }
      const contentType = response.headers["content-type"] ?? ""
      const body = await readBody(response, resolved.maxBytes)
      return {
        status,
        contentType,
        body: new TextDecoder(charset(contentType)).decode(body),
      }
    }
  } catch (error) {
    if (error instanceof FetchGuardError) throw error
    if (signal.aborted) {
      throw new FetchGuardError(504, "The site took too long to answer")
    }
    throw new FetchGuardError(
      502,
      error instanceof Error ? error.message : "The site could not be reached",
    )
  }
}

export interface FetchResponse {
  readonly status: number
  readonly headers: Record<string, string>
  readonly body: string
}

// The `/fetch?url=` answer: the page as text with the site's status, or an
// error status with a short reason. Any origin may call it, because the app
// can be served from anywhere. The page is the site's HTML but is served as
// plain text, unsniffable and sandboxed: the endpoint shares the app's origin,
// so a page opened from a `/fetch` link must never run as a document there.
export const fetchResponse = async (
  url: string | null,
  options?: FetchOptions,
): Promise<FetchResponse> => {
  const headers = {
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox",
  }
  if (url === null || url === "") {
    return { status: 400, headers, body: "The url parameter is required" }
  }
  try {
    const page = await fetchPage(url, options)
    const ok = page.status >= 200 && page.status < 300
    return { status: page.status, headers, body: ok ? page.body : "" }
  } catch (error) {
    const status = error instanceof FetchGuardError ? error.status : 502
    const message = error instanceof Error ? error.message : String(error)
    return { status, headers, body: message }
  }
}
