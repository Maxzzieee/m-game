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
        // "Kopitiam morning" palette — warm cream paper, coffee ink, deep gold.
        // Token names kept from the dark theme so components didn't change:
        //   void-900 = page, void-800 = raised surface, void-700 = borders/wells,
        //   parchment = primary text, dim/faint = muted text.
        ink: "#fdfaf2", // text on gold fills (5.1:1 on neon)
        void: {
          900: "#f5efe3", // page — warm cream
          800: "#fdfaf2", // surface — raised paper
          700: "#e3d8c2", // borders / wells
        },
        parchment: "#33291d", // primary text (12.4:1 on cream)
        dim: "#75674f", // muted text (4.8:1 on cream)
        faint: "#a3947a", // decorative-only text
        neon: "#93600d", // kopi gold (4.7:1 as text on cream)
        chili: "#bf4028",
        jade: "#2a6e50",
        // stat colour language — deepened for light backgrounds
        stat: {
          brains: "#29708f",
          face: "#a84a78",
          brawn: "#a64f24",
          guts: "#93600d",
        },
      },
      maxWidth: {
        prose: "68ch",
      },
      boxShadow: {
        glow: "0 0 22px -6px rgba(168, 111, 16, 0.45)",
        card: "0 1px 2px rgba(70, 52, 22, 0.06), 0 10px 28px -18px rgba(70, 52, 22, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
