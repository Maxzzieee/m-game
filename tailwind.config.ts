import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // Warm night palette — HDB dusk, hawker signboard amber.
        ink: "#0c0a08",
        void: {
          900: "#0e0c09", // page
          800: "#171310", // surface
          700: "#2b241c", // borders / wells
        },
        parchment: "#ece5d8", // primary text (13.5:1 on void-900)
        dim: "#a1957f", // muted text (5.4:1 on void-900)
        faint: "#6b6151", // decorative-only text
        neon: "#f0a63e", // hawker amber
        chili: "#e5533d",
        jade: "#57b389",
      },
      maxWidth: {
        prose: "68ch",
      },
      boxShadow: {
        glow: "0 0 24px -6px rgba(240, 166, 62, 0.35)",
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.7)",
      },
    },
  },
  plugins: [],
};

export default config;
