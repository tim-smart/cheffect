// `CORS_ALLOWED_ORIGINS` lets an app served from another origin import through
// `/fetch` and `/youtube`: a comma-separated list of origins, or `*`. Unset,
// only the app on this server's own origin can read them. Both are simple GETs,
// so there is no preflight to answer.
export const corsHeaders = (
  origin: string | null | undefined,
  allowed: string | undefined,
): Record<string, string> => {
  const origins = (allowed ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter((entry) => entry !== "")
  if (origins.includes("*")) return { "access-control-allow-origin": "*" }
  if (origin && origins.includes(origin))
    return { "access-control-allow-origin": origin, vary: "origin" }
  return {}
}
