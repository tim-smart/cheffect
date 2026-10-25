import { cn } from "@/lib/utils"
import { useCallback, type ImgHTMLAttributes } from "react"

/**
 * An image that fades in once it has loaded, so photos settle onto the page
 * instead of popping in. Exposes `data-loaded` so a caller can add its own
 * transition for the loaded state.
 *
 * The loaded state is kept on the element rather than in React state: a list
 * mounting a screen of photos would otherwise re-render each one as it loads,
 * and each of those renders would restart a deferred render of the list.
 */
export function FadeImage({
  className,
  onLoad,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  // A cached image can be complete before React attaches `onLoad`
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) img.dataset.loaded = "true"
  }, [])
  return (
    <img
      {...props}
      ref={ref}
      data-loaded="false"
      onLoad={(event) => {
        event.currentTarget.dataset.loaded = "true"
        onLoad?.(event)
      }}
      className={cn(
        "motion-safe:transition-opacity motion-safe:duration-500 ease-out",
        "opacity-0 data-[loaded=true]:opacity-100",
        className,
      )}
    />
  )
}
