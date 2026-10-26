import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import * as path from "node:path"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import tailwindcss from "@tailwindcss/vite"

// https://vitejs.dev/config/
export default defineConfig({
  // Vercel deployments serve `api/fetch.ts`, so recipe imports fetch through
  // it. Vercel's own `VERCEL` variable never reaches the bundle.
  define: process.env.VERCEL
    ? { "import.meta.env.VITE_VERCEL": JSON.stringify("true") }
    : {},

  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
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
        // The light --background token, so the splash screen and status bar
        // match the app before its script runs
        theme_color: "#f8f6f2",
        background_color: "#f8f6f2",
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
          // `src/routes/import.tsx` routes shares into the open window
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
            src: "/screenshots/mobile-recipes.jpg",
            type: "image/jpeg",
            sizes: "824x1784",
            form_factor: "narrow",
            label: "Your recipe library",
          },
          {
            src: "/screenshots/mobile-recipe.jpg",
            type: "image/jpeg",
            sizes: "824x1784",
            form_factor: "narrow",
            label: "Cook from a recipe",
          },
          {
            src: "/screenshots/mobile-meal-plan.jpg",
            type: "image/jpeg",
            sizes: "824x1784",
            form_factor: "narrow",
            label: "Plan meals for the week",
          },
          {
            src: "/screenshots/mobile-grocery.jpg",
            type: "image/jpeg",
            sizes: "824x1784",
            form_factor: "narrow",
            label: "Grocery list grouped by aisle",
          },
          {
            src: "/screenshots/desktop.jpg",
            type: "image/jpeg",
            sizes: "2560x1600",
            form_factor: "wide",
            label: "Your recipe library",
          },
        ],
      },

      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,mp3,woff2}"],
        maximumFileSizeToCacheInBytes: 7 * 1024 * 1024,
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
})
