import {
  combinePresetAndAppleSplashScreens,
  defineConfig,
  minimal2023Preset as preset,
} from "@vite-pwa/assets-generator/config"

export default defineConfig({
  headLinkOptions: {
    preset: "2023",
  },
  preset: {
    ...combinePresetAndAppleSplashScreens(preset, {
      resizeOptions: {
        background: "#ffffff",
      },
    }),
    apple: {
      ...preset.apple,
      resizeOptions: {
        ...preset.apple.resizeOptions,
        background: "#ffffff",
      },
    },
    maskable: {
      ...preset.maskable,
      resizeOptions: {
        ...preset.maskable.resizeOptions,
        background: "#ffffff",
      },
    },
  },
  images: ["public/icon.svg"],
})
