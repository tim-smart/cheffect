// First, so a share link leaves the address bar before the router reads it.
import "./Sync/atoms"
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App.tsx"
import * as Atom from "effect/reactivity/Atom"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import "./index.css"

const configProvider = ConfigProvider.fromUnknown(import.meta.env)

Atom.runtime.addGlobalLayer(
  Layer.mergeAll(
    ConfigProvider.layer(configProvider),
    Logger.layer([Logger.consolePretty(), Logger.tracerLogger]),
  ),
)

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
