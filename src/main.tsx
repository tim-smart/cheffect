import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App.tsx"
import { Atom } from "@effect-atom/atom-react"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import "./index.css"

const configProvider = ConfigProvider.fromJson(import.meta.env)

Atom.runtime.addGlobalLayer(
  Layer.mergeAll(Layer.setConfigProvider(configProvider), Logger.pretty),
)

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
