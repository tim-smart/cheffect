import { useLayoutEffect, useState } from "react"

export const useViewportObstructed = () => {
  const [value, setValue] = useState(getViewportObstructed)

  if (!("visualViewport" in window)) {
    return value
  }

  useLayoutEffect(() => {
    const updateHeight = () => {
      setValue(getViewportObstructed())
    }
    window.visualViewport!.addEventListener("resize", updateHeight)
    return () => {
      window.visualViewport!.removeEventListener("resize", updateHeight)
    }
  }, [])

  return value
}

export const useIsViewportObstructed = () => {
  const [value, setValue] = useState(isViewportObstructed)

  if (!("visualViewport" in window)) {
    return value
  }

  useLayoutEffect(() => {
    const update = () => {
      setValue(isViewportObstructed())
    }
    window.visualViewport!.addEventListener("resize", update)
    return () => {
      window.visualViewport!.removeEventListener("resize", update)
    }
  }, [])

  return value
}

const getViewportObstructed = () => {
  const self: typeof globalThis = window as any

  if (!("visualViewport" in window)) {
    return 0
  }

  return Math.max(
    0,
    Math.ceil(self.innerHeight - window.visualViewport!.height),
  )
}

const isViewportObstructed = () => {
  const self: typeof globalThis = window as any

  if (!("visualViewport" in window)) {
    return false
  }

  return self.innerHeight > window.visualViewport!.height
}
