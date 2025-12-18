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
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",

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
        shortcuts: [
          {
            name: "Grocery list",
            short_name: "Groceries",
            description: "View your grocery list",
            url: "/groceries",
            icons: [{ src: "/icons/groceries-192x192.png", sizes: "192x192" }],
          },
          {
            name: "Meal plan",
            short_name: "Meal Plan",
            description: "View your meal plan",
            url: "/plan",
            icons: [{ src: "/icons/plan-192x192.png", sizes: "192x192" }],
          },
          {
            name: "Settings",
            short_name: "Settings",
            description: "Open settings",
            url: "/settings",
            icons: [{ src: "/icons/settings-192x192.png", sizes: "192x192" }],
          },
        ],
        launch_handler: {
          client_mode: "focus-existing",
        },
        scope: "/",
        share_target: {
          action: "/import",
          method: "GET",
          enctype: "application/x-www-form-urlencoded",
          params: {
            title: "title",
            text: "text",
            url: "url",
          },
        },
        screenshots: [
          {
            src: "/screenshots/android.jpg",
            type: "image/jpg",
            platform: "android",
            sizes: "1080x2340",
            form_factor: "narrow",
          },
        ],
      },

      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm}"],
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
