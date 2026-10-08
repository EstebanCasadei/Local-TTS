import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [react(), tailwindcss(), svgr()],
  build: {
    outDir: "dist-extension",
    rolldownOptions: {
      input: {
        sidepanel: "extension/sidepanel.html",
        background: "src/extension/background.ts",
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
      },
    },
  },
  worker: { format: "es" },
});
