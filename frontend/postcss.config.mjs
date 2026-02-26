import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./providers/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif:  ["DM Serif Display", "serif"],
        mono:   ["IBM Plex Mono", "monospace"],
        sans:   ["DM Sans", "sans-serif"],
      },
      colors: {
        bg:       "#080809",
        surface:  "#0D0D10",
        surface2: "#12121A",
        border:   "#1C1C28",
        border2:  "#242432",
        pink:     "#E6007A",
        cyan:     "#00D4FF",
        green:    "#00FF88",
        amber:    "#FFB800",
        muted:    "#52526A",
        muted2:   "#38384E",
      },
      animation: {
        "pulse-slow": "pulse 2s ease-in-out infinite",
        ticker:       "ticker 30s linear infinite",
        fadeUp:       "fadeUp 0.4s ease forwards",
        glow:         "glow 3s ease-in-out infinite",
        blink:        "blink 1s step-end infinite",
        spin:         "spin 1s linear infinite",
      },
      keyframes: {
        ticker:  { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        fadeUp:  { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        glow:    { "0%,100%": { boxShadow: "0 0 20px rgba(230,0,122,0.35)" }, "50%": { boxShadow: "0 0 40px rgba(230,0,122,0.35),0 0 80px rgba(230,0,122,0.12)" } },
        blink:   { "0%,100%": { opacity: "1" }, "50%": { opacity: "0" } },
      },
      backgroundImage: {
        scanline: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(230,0,122,0.015) 3px, rgba(230,0,122,0.015) 4px)",
      },
    },
  },
  plugins: [],
};

export default config;