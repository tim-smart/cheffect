import { test } from "node:test"
import * as assert from "node:assert/strict"
import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { build } from "esbuild"

test("the compiled Vercel fetch endpoint runs in native Node ESM", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url))
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cheffect-vercel-"))
  try {
    // Keep modules separate, as in the deployed function. Bundling or tsx's
    // resolver would hide imports that Node's ESM loader cannot resolve.
    await build({
      absWorkingDir: root,
      entryPoints: ["api/fetch.ts", "server/fetchGuard.ts"],
      outbase: root,
      outdir: dir,
      bundle: false,
      platform: "node",
      format: "esm",
    })
    await fs.writeFile(path.join(dir, "package.json"), '{"type":"module"}')
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `
          import { GET } from './api/fetch.js'
          const response = await GET(new Request('https://cheffect.test/api/fetch'))
          console.log(JSON.stringify({ status: response.status, body: await response.text() }))
        `,
      ],
      { cwd: dir, env: { ...process.env, NODE_OPTIONS: "" }, timeout: 10_000 },
    )
    assert.deepEqual(JSON.parse(stdout), {
      status: 400,
      body: "The url parameter is required",
    })
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
