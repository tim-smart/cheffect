import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Http from "node:http"
import type { AddressInfo } from "node:net"
import * as Zlib from "node:zlib"
import {
  fetchPage,
  fetchResponse,
  type FetchOptions,
  userAgentFor,
} from "../server/fetchGuard"

// The importer's `/fetch` endpoint fetches whatever URL it is given, so it
// only reaches public addresses, on every redirect, and gives up on pages
// that are too big or too slow.

const withServer = async (
  handler: Http.RequestListener,
  run: (base: string) => Promise<void>,
) => {
  const server = Http.createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}

// The test server is on loopback, which only these tests allow.
const loopbackOnly: FetchOptions = {
  isAllowedAddress: (address) => address === "127.0.0.1",
}

const rejectsWith = (promise: Promise<unknown>, status: number) =>
  assert.rejects(promise, (error: any) => {
    assert.equal(error.status, status, error.message)
    return true
  })

test("fetches a page through redirects, but never a private address", async () => {
  await withServer(
    (req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { location: "/recipe" }).end()
      } else if (req.url === "/to-private") {
        res.writeHead(302, { location: "http://10.0.0.1/" }).end()
      } else {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-encoding": "gzip",
        })
        res.end(Zlib.gzipSync("<h1>Crème brûlée</h1>"))
      }
    },
    async (base) => {
      assert.deepEqual(await fetchPage(`${base}/start`, loopbackOnly), {
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<h1>Crème brûlée</h1>",
      })
      await rejectsWith(fetchPage(`${base}/to-private`, loopbackOnly), 403)
      // With the default check, loopback is refused by address and by name.
      await rejectsWith(fetchPage(`${base}/recipe`), 403)
      await rejectsWith(
        fetchPage(base.replace("127.0.0.1", "localhost") + "/recipe"),
        403,
      )
      await rejectsWith(fetchPage("file:///etc/passwd"), 400)
    },
  )
})

test("gives up on pages that are too large or too slow", async () => {
  await withServer(
    (req, res) => {
      if (req.url === "/large") {
        res.writeHead(200, { "content-type": "text/html" })
        res.end("x".repeat(10_000))
      } else if (req.url === "/stalled-gzip") {
        // part of a compressed body, then nothing
        res.writeHead(200, {
          "content-type": "text/html",
          "content-encoding": "gzip",
        })
        res.write(Zlib.gzipSync("x".repeat(10_000)).subarray(0, 20))
      }
      // anything else never answers
    },
    async (base) => {
      await rejectsWith(
        fetchPage(`${base}/large`, { ...loopbackOnly, maxBytes: 1_000 }),
        502,
      )
      await rejectsWith(
        fetchPage(`${base}/slow`, { ...loopbackOnly, timeoutMs: 200 }),
        504,
      )
      await rejectsWith(
        fetchPage(`${base}/stalled-gzip`, { ...loopbackOnly, timeoutMs: 200 }),
        504,
      )
    },
  )
})

// Pages are returned as plain text that browsers won't sniff, so opening a
// `/fetch` link never runs the fetched page's scripts on the app's origin.
test("a fetched page is never served as a document", async () => {
  await withServer(
    (_, res) => {
      res.writeHead(200, { "content-type": "text/html" })
      res.end("<script>alert(1)</script>")
    },
    async (base) => {
      const { status, headers, body } = await fetchResponse(
        `${base}/`,
        loopbackOnly,
      )
      assert.equal(status, 200)
      assert.equal(body, "<script>alert(1)</script>")
      assert.equal(headers["content-type"], "text/plain; charset=utf-8")
      assert.equal(headers["x-content-type-options"], "nosniff")
      assert.equal(headers["content-security-policy"], "sandbox")
    },
  )
})

test("YouTube is fetched as a phone, so Shorts pages fit the size limit", () => {
  const mobile = userAgentFor(new URL("https://www.youtube.com/watch?v=x"))
  assert.match(mobile, /iPhone/)
  assert.equal(userAgentFor(new URL("https://m.youtube.com/watch?v=x")), mobile)
  assert.doesNotMatch(
    userAgentFor(new URL("https://notyoutube.com/recipe")),
    /iPhone/,
  )
})
