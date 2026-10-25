import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export const root = realpathSync(fileURLToPath(new URL(".", import.meta.url)));

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  }).trim();
}

/**
 * The commit a checkout of urx-lcd-sim is at, shortened: what SETUP → Version shows as APP Version
 * (`__URX_LCD_SIM_COMMIT__`). Refuses a directory that is not the top of its own work tree, since git
 * run there would answer about whatever repository holds it.
 */
export function buildCommit(dir: string): string {
  const top = git(dir, "rev-parse", "--show-toplevel");
  // Compared by the native real path, which spells a Windows 8.3 short name (RUNNER~1) out in full
  // as git does.
  if (realpathSync.native(top) !== realpathSync.native(dir)) {
    throw new Error(`${dir} is not a git work tree of its own (git answers for ${top}), so its commit cannot be read`);
  }
  return git(dir, "rev-parse", "--short=7", "HEAD");
}

// base is "./" so a build can be served from a subpath (GitHub Pages project
// site) as well as from a file:// preview.
export default defineConfig({
  base: "./",
  build: { target: "es2022", outDir: "dist" },
  define: { __URX_LCD_SIM_COMMIT__: JSON.stringify(buildCommit(root)) },
});
