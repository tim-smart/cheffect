import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const httpUrl = (input: string): string | undefined => {
  const url = Schema.decodeOption(Schema.URLFromString)(input)
  return Option.isSome(url) && /^https?:$/.test(url.value.protocol)
    ? url.value.href
    : undefined
}

// A link inside a sentence, without the punctuation that ends the sentence or
// a quote around it
const embeddedUrl = (text: string): string | undefined =>
  text.match(/https?:\/\/[^\s<>"]+/i)?.[0].replace(/[.,;:!?')\]]+$/, "")

/**
 * The link to import from a share target's query. A field holding just a URL
 * is taken whole. Otherwise the first link in it is used, since Android apps
 * often put the URL after a title or message in `text`.
 */
export const sharedUrl = (params: URLSearchParams): string | undefined => {
  for (const key of ["url", "text", "title"]) {
    const value = params.get(key)?.trim()
    if (!value) continue
    const whole = /\s/.test(value) ? undefined : httpUrl(value)
    const url = whole ?? httpUrl(embeddedUrl(value) ?? "")
    if (url !== undefined) return url
  }
}
