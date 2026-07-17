import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        // "serif" token kept for compatibility — now the display face (Bricolage)
        serif: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // "Majulah" palette — Singapore red & white. Crisp white paper, near-black
        // ink, deep flag red as the hero accent (accessible: 5.4:1 text /
        // 5.6:1 white-on-red). Token names kept so components didn't change:
        //   void-900 = page, void-800 = raised surface, void-700 = borders/wells,
        //   parchment = primary text, dim/faint = muted text, neon = accent.
        ink: "#ffffff", // text on red fills
        void: {
          900: "#f6f5f3", // page — soft paper white
          800: "#ffffff", // surface — raised white
          700: "#e5e3df", // borders / wells
        },
        parchment: "#1a1a1a", // primary text (16.7:1)
        dim: "#5c5c5c", // muted text (6.4:1)
        faint: "#8a8a8a", // decorative-only text
        neon: "#ce1126", // Singapore red — the hero accent
        chili: "#a3122b", // negative / error (deep crimson)
        jade: "#1f7a44", // positive / income (forest green)
        // stat colour language — GUTS in national red ties into the theme
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
