"use client";

// 8-bit avatar rendered as a pure SVG pixel grid — no image assets.
// The sprite evolves with the authoritative game state:
//   outfit  ← arc (Sec uniform → JC/poly → NS No.4 → CBD shirt → smart casual)
//   face    ← mental state (smile, flat, frown, eye-bags, On-Fire grin + glow)
//   gear    ← shop items (snapback, specs, headphones, gold chain)
//   skin/hair ← deterministic from character name

import type { Game } from "@/lib/types";

type Px = [x: number, y: number, color: string];

const SKIN_TONES = ["#f0c8a0", "#e3ad7c", "#c98f5e", "#9c6b44"];
const HAIR_TONES = ["#17130e", "#2c2014", "#0f1216", "#3d2c1a"];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

interface Outfit {
  top: string;
  topShade: string;
  bottom: string;
  longPants: boolean;
}

function outfitForArc(arc: number): Outfit {
  switch (arc) {
    case 1: // secondary school: white uniform, navy shorts
      return { top: "#efeadb", topShade: "#d8d2c0", bottom: "#25303d", longPants: false };
    case 2: // JC / poly: polo + jeans
      return { top: "#5d7f99", topShade: "#4c6a80", bottom: "#333a47", longPants: true };
    case 3: // NS: No.4 green
      return { top: "#4a5d3a", topShade: "#3c4c2f", bottom: "#3f5033", longPants: true };
    case 4: // CBD: light blue shirt, slacks
      return { top: "#a9c4dd", topShade: "#8fadc9", bottom: "#282b33", longPants: true };
    default: // adult smart casual
      return { top: "#3b3f46", topShade: "#30343a", bottom: "#22252b", longPants: true };
  }
}

function rect(px: Px[], x0: number, x1: number, y0: number, y1: number, color: string) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px.push([x, y, color]);
}

export default function PixelAvatar({ game, size = 120 }: { game: Game; size?: number }) {
  const h = hashName(game.char_name);
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const skinShade = "#00000022";
  const hair = HAIR_TONES[(h >> 3) % HAIR_TONES.length];
  const outfit = outfitForArc(game.arc);
  const items = game.items ?? [];
  const dark = "#1a1712";

  const px: Px[] = [];

  // --- hair (fuller if not capped) ---
  const capped = items.includes("snapback");
  if (!capped) {
    rect(px, 5, 10, 1, 2, hair);
    rect(px, 4, 4, 2, 4, hair);
    rect(px, 11, 11, 2, 4, hair);
    if ((h >> 6) % 2 === 0) rect(px, 5, 10, 3, 3, hair); // heavier fringe variant
  }

  // --- face ---
  rect(px, 5, 10, 3, 7, skin);
  rect(px, 5, 5, 3, 3, capped ? skin : hair);
  rect(px, 10, 10, 3, 3, capped ? skin : hair);

  // eyes
  px.push([6, 5, dark], [9, 5, dark]);

  // mental-state expression
  switch (game.mental_state) {
    case "Fresh":
      px.push([7, 7, "#b0603f"], [8, 7, "#b0603f"]); // easy smile
      break;
    case "Tired":
      px.push([7, 7, dark]); // small flat mouth
      px.push([6, 6, skinShade], [9, 6, skinShade]); // faint eye bags
      break;
    case "Stress":
      px.push([7, 7, dark], [8, 7, dark]);
      px.push([6, 4, dark], [9, 4, dark]); // knitted brows
      break;
    case "Burnt Out":
      px.push([7, 7, dark], [8, 7, dark]);
      rect(px, 6, 6, 6, 6, "#5a4a3f");
      rect(px, 9, 9, 6, 6, "#5a4a3f"); // heavy eye bags
      break;
    case "On Fire":
      rect(px, 6, 9, 7, 7, "#b0402a"); // full grin
      break;
  }

  // --- gear: specs / headphones / snapback ---
  if (items.includes("specs")) {
    px.push([5, 5, dark], [7, 5, dark], [8, 5, dark], [10, 5, dark]);
  }
  if (items.includes("headphones")) {
    rect(px, 5, 10, 0, 0, "#22252b");
    rect(px, 4, 4, 4, 6, "#e5533d");
    rect(px, 11, 11, 4, 6, "#e5533d");
  }
  if (capped) {
    rect(px, 4, 11, 1, 2, "#c8452f");
    rect(px, 10, 13, 3, 3, "#a63722"); // brim, worn forward
  }

  // --- neck + chain ---
  rect(px, 7, 8, 8, 8, skin);
  if (items.includes("gold_chain")) {
    px.push([6, 9, "#f0c840"], [7, 10, "#f0c840"], [8, 10, "#f0c840"], [9, 9, "#f0c840"]);
  }

  // --- torso + arms ---
  rect(px, 4, 11, 9, 13, outfit.top);
  rect(px, 4, 11, 13, 13, outfit.topShade);
  rect(px, 3, 3, 9, 12, outfit.top);
  rect(px, 12, 12, 9, 12, outfit.top);
  rect(px, 3, 3, 13, 13, skin); // hands
  rect(px, 12, 12, 13, 13, skin);
  // collar
  px.push([7, 9, outfit.topShade], [8, 9, outfit.topShade]);

  // --- legs ---
  if (outfit.longPants) {
    rect(px, 5, 7, 14, 17, outfit.bottom);
    rect(px, 8, 10, 14, 17, outfit.bottom);
  } else {
    rect(px, 5, 7, 14, 15, outfit.bottom); // shorts
    rect(px, 8, 10, 14, 15, outfit.bottom);
    rect(px, 5, 6, 16, 17, skin);
    rect(px, 9, 10, 16, 17, skin);
  }

  // --- shoes (grey so they read on the light sheet) ---
  rect(px, 4, 6, 18, 18, "#a9a193");
  rect(px, 9, 11, 18, 18, "#a9a193");

  const onFire = game.mental_state === "On Fire";

  return (
    <svg
      viewBox="0 0 16 20"
      width={size}
      height={(size / 16) * 20}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Pixel avatar of ${game.char_name}`}
      className={onFire ? "drop-shadow-[0_0_10px_rgba(206,17,38,0.7)]" : undefined}
    >
      {px.map(([x, y, c], i) => (
        <rect key={i} x={x} y={y} width={1} height={1} fill={c} />
      ))}
    </svg>
  );
}
