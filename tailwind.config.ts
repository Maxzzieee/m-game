import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Fonts route through skin variables so "Work Mode" can swap the whole
        // face set (see globals.css :root[data-skin="work"]).
        sans: ["var(--skin-font-sans)", "system-ui", "sans-serif"],
        // "serif" token kept for compatibility — now the display face (Bricolage)
        serif: ["var(--skin-font-display)", "system-ui", "sans-serif"],
        mono: ["var(--skin-font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // Palette is variable-driven so the app can wear more than one skin
        // (the "Majulah" game skin and the "Work Mode" documents skin) exactly
        // like a light/dark toggle. Values live as RGB channels in globals.css
        // (--c-*) and are wrapped here with <alpha-value> so every /opacity
        // utility (bg-void-800/80, border-neon/60, …) keeps working. Token
        // names are unchanged so no component markup had to move:
        //   void-900 = page, void-800 = raised surface, void-700 = borders,
        //   parchment = primary text, dim/faint = muted text, neon = accent.
        ink: "rgb(var(--c-ink) / <alpha-value>)", // text on accent fills
        void: {
          900: "rgb(var(--c-page) / <alpha-value>)", // page
          800: "rgb(var(--c-surface) / <alpha-value>)", // raised surface
          700: "rgb(var(--c-border) / <alpha-value>)", // borders / wells
        },
        parchment: "rgb(var(--c-text) / <alpha-value>)", // primary text
        dim: "rgb(var(--c-dim) / <alpha-value>)", // muted text
        faint: "rgb(var(--c-faint) / <alpha-value>)", // decorative-only text
        neon: "rgb(var(--c-accent) / <alpha-value>)", // hero accent
        chili: "rgb(var(--c-neg) / <alpha-value>)", // negative / error
        jade: "rgb(var(--c-pos) / <alpha-value>)", // positive / income
        // stat colour language stays fixed across skins (also set inline via
        // lib/ui.ts statColor(), so keeping it static keeps the two in sync).
        stat: {
          brains: "#1f6feb",
          face: "#b83280",
          brawn: "#c2410c",
          guts: "#c8102e",
        },
      },
      maxWidth: {
        prose: "68ch",
      },
      boxShadow: {
        glow: "0 0 22px -7px rgba(206, 17, 38, 0.45)",
        card: "0 1px 2px rgba(20, 20, 20, 0.05), 0 10px 28px -18px rgba(20, 20, 20, 0.22)",
      },
    },
  },
  plugins: [],
};

export default config;
