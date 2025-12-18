import { Atom } from "@effect-atom/atom-react"
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import { toast } from "sonner"

export const kvsRuntime = Atom.runtime(BrowserKeyValueStore.layerLocalStorage)

export const installPromptAtom = Atom.make((get) => {
  const onBeforeInstallPrompt = (e: any) => {
    e.preventDefault()

    toast("Add Cheffect to the home screen", {
      action: {
        label: "Install",
        onClick() {
          e.prompt()
        },
      },
    })
  }
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt, {
    once: true,
  })
  get.addFinalizer(() => {
    window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
  })
})
