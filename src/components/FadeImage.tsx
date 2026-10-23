import { cn } from "@/lib/utils"
import { useCallback, useState, type ImgHTMLAttributes } from "react"

/**
 * An image that fades in once it has loaded, so photos settle onto the page
 * instead of popping in. Exposes `data-loaded` so a caller can add its own
 * transition for the loaded state.
 */
export function FadeImage({
  className,
  onLoad,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false)
  // A cached image can be complete before React attaches `onLoad`
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true)
  }, [])
  return (
    <img
      {...props}
      ref={ref}
      data-loaded={loaded}
      onLoad={(event) => {
        setLoaded(true)
        onLoad?.(event)
      }}
      className={cn(
        "transition-opacity duration-500 ease-out",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  )
}
