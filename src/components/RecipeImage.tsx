import { Placeholder } from "@/components/placeholder"
import { cn } from "@/lib/utils"
import { useState } from "react"

// Falls back to the placeholder when the image is missing or fails to load,
// so a dead link never shows the browser's broken image and alt text.
export function RecipeImage({
  src,
  alt,
  className,
}: {
  src: string | null
  alt: string
  className?: string
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (src === null || src === failedSrc) {
    return <Placeholder className={className} />
  }
  return (
    <img
      src={src}
      alt={alt}
      className={cn("object-cover", className)}
      onError={() => setFailedSrc(src)}
    />
  )
}
