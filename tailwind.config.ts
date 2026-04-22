import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#15171a",
        panel: "#f6f8fb",
        accent: "#0f766e",
        apple: {
          bg: "#f5f5f7",
          ink: "#1d1d1f",
          muted: "#86868b",
          blue: "#0071e3"
        }
      }
    }
  },
  plugins: []
};

export default config;
