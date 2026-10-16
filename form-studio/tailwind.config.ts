import type { Config } from "tailwindcss";

export default {
  content: ["./components/**/*.{ts,tsx}", "./frontend/**/*.{ts,tsx}"],
  darkMode: "class",
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        foreground: "#f4f1ea",
        background: "#16181c",
        muted: "#2a2e35",
        ring: "#e8c4a0",
      },
    },
  },
  plugins: [],
} satisfies Config;
