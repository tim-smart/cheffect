import { corsHeaders } from "../server/cors.js"
import { createYouTubeHandler } from "../server/youtube.js"

const handler = createYouTubeHandler({ apiKey: process.env.YOUTUBE_API_KEY })

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id")
  const { status, headers, body } = await handler(id)
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
