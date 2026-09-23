import { defineConfig } from "vite";

// base is "./" so a build can be served from a subpath (GitHub Pages project
// site) as well as from a file:// preview.
export default defineConfig({
  base: "./",
  build: { target: "es2022", outDir: "dist" },
});
