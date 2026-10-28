// Vercel emits separate ES modules; Node needs the JavaScript file extension.
import { corsHeaders } from "../server/cors.js"
import { fetchResponse } from "../server/fetchGuard.js"

// The recipe importer's fetch endpoint on Vercel, the same as the Docker
// server's `/fetch`. `vercel.json` keeps `api/` out of the SPA rewrite.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url")
  const { status, headers, body } = await fetchResponse(url)
  return new Response(body, {
    status,
    headers: {
      ...headers,
      ...corsHeaders(
        request.headers.get("origin"),
        process.env.CORS_ALLOWED_ORIGINS,
      ),
    },
  })
}
