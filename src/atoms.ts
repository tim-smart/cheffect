import { Atom } from "@effect-atom/atom-react"
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"

export const kvsRuntime = Atom.runtime(BrowserKeyValueStore.layerLocalStorage)

export const launchQueueAtom = Atom.make(() => {
  if (!("launchQueue" in window)) {
    return
  }

  ;(window.launchQueue as any).setConsumer((launchParams: any) => {
    const url = launchParams.targetURL as string
    console.log("App launched with URL:", url)
    location.href = url
  })
}).pipe(Atom.keepAlive)
