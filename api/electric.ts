import { Schema } from "@livestore/livestore"
import { ApiSchema, makeElectricUrl } from "@livestore/sync-electric"
import { toTableName } from "@livestore/sync-electric"
import postgres from "postgres"

const electricHost = "https://api.electric-sql.cloud/v1/shape"

declare const process: {
  env: Record<string, string | undefined>
}

// GET /api/electric - Pull events (proxied through Electric)
async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const { url, storeId, needsInit } = makeElectricUrl({
    sourceId: "203dfd06-4f0f-4609-9ba2-497603dc85d1",
    electricHost,
    searchParams,
    sourceSecret: process.env.ELECTRIC_SOURCE_SECRET,
  })

  // Add your authentication logic here
  // if (!isAuthenticated(request)) {
  //   return new Response('Unauthorized', { status: 401 })
  // }

  // Initialize database tables if needed
  if (needsInit) {
    const db = makeDb(storeId)
    await db.migrate()
    await db.disconnect()
  }

  // Proxy pull request to Electric server for reading
  return fetch(url)
}

// POST /api/electric - Push events (direct database write)
async function POST(request: Request) {
  const payload = await request.json()
  const parsed = Schema.decodeUnknownSync(ApiSchema.PushPayload)(payload)

  // Write events directly to Postgres table (bypasses Electric)
  const db = makeDb(parsed.storeId)
  await db.createEvents(parsed.batch)
  await db.disconnect()

  return Response.json({ success: true })
}

export default {
  async fetch(request: Request) {
    if (request.method === "HEAD") {
      return new Response(null, { status: 200 })
    }
    if (request.method === "GET") {
      return GET(request)
    }
    if (request.method === "POST") {
      return POST(request)
    }
    return new Response("Method Not Allowed", { status: 405 })
  },
}

const makeDb = (storeId: string) => {
  const tableName = toTableName(storeId)
  const sql = postgres(process.env.DATABASE_URL!)

  const migrate = () =>
    sql`
      CREATE TABLE IF NOT EXISTS ${sql(tableName)} (
        "seqNum" INTEGER PRIMARY KEY,
        "parentSeqNum" INTEGER,
        "name" TEXT NOT NULL,
        "args" JSONB NOT NULL,
        "clientId" TEXT NOT NULL,
        "sessionId" TEXT NOT NULL
      );
    `

  const createEvents = async (events: ReadonlyArray<any>) => {
    await sql`INSERT INTO ${sql(tableName)} ${sql(events)}`
  }

  return {
    migrate,
    createEvents,
    disconnect: () => sql.end(),
  }
}
