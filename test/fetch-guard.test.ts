import { test } from "node:test"
import * as assert from "node:assert/strict"
import * as Http from "node:http"
import type { AddressInfo } from "node:net"
import * as Zlib from "node:zlib"
import { fetchPage, type FetchOptions } from "../server/fetchGuard"

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
    },
  )
})
