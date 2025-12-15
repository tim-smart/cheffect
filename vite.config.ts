import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import * as path from "node:path"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import tailwindcss from "@tailwindcss/vite"
import { livestoreDevtoolsPlugin } from "@livestore/devtools-vite"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
    livestoreDevtoolsPlugin({ schemaPath: "./src/livestore/schema.ts" }),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",

      pwaAssets: {
        disabled: false,
        config: true,
      },

      manifest: {
        id: "cheffect.effect.website",
        name: "Cheffect",
        short_name: "Cheffect",
        description: "A local-first meal planner app",
        display: "standalone",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        shortcuts: [],
        launch_handler: {
          client_mode: "navigate-existing",
        },
        share_target: {
          action: "/pwa/share",
          method: "GET",
          enctype: "application/x-www-form-urlencoded",
          params: {
            url: "url",
          },
        },
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 6_000_000,
      },

      devOptions: {
        enabled: false,
        navigateFallback: "index.html",
        suppressWarnings: true,
        type: "module",
      },
    }),
  ],

  build: {
    minify: false,
    terserOptions: {
      compress: false,
      mangle: false,
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  worker: { format: "es" },

  optimizeDeps: {
    exclude: ["@livestore/wa-sqlite"],
  },
})
