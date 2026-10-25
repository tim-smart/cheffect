import { fetchResponse } from "../server/fetchGuard"

// The recipe importer's fetch endpoint on Vercel, the same as the Docker
// server's `/fetch`. `vercel.json` keeps `api/` out of the SPA rewrite.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url")
  const { status, headers, body } = await fetchResponse(url)
  return new Response(body, { status, headers })
}
