import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "./index";

// The screens navigate to each other, and the shell's toolbar navigates to the
// top-level ones, so both directories are scanned.
const SOURCE_DIRS = [join(process.cwd(), "src", "screens"), join(process.cwd(), "src", "app")];

/**
 * Every screen id any code navigates to. A button that pushes an unregistered id
 * is a dead end on the glass — the shell has nothing to draw — so the ids are
 * scanned out of the source rather than listed by hand, which would drift.
 *
 * Two call shapes exist in this codebase: the direct `nav.push({ id: "..." })`
 * and SETUP's local `open("...")` helper that closes over the same call. The
 * vacuity test below pins one example of each, so a scan that stops matching
 * either one fails rather than passing with nothing to check.
 */
const NAV_PATTERNS = [
  /nav\.(?:push|openTop|replace)\(\{\s*(?:\.\.\.route,\s*)?id:\s*"([^"]+)"/g,
  /\bopen\("([^"]+)"\)/g,
];

function navigatedIds(): Map<string, string> {
  const found = new Map<string, string>();
  for (const dir of SOURCE_DIRS) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      const text = readFileSync(join(dir, file), "utf8");
      for (const pattern of NAV_PATTERNS) {
        for (const m of text.matchAll(pattern)) {
          const id = m[1];
          if (id) found.set(id, file);
        }
      }
    }
  }
  return found;
}

describe("screen registry", () => {
  it("registers every screen something navigates to", () => {
    const registered = new Set(buildRegistry().ids());
    const missing = [...navigatedIds()].filter(([id]) => !registered.has(id));
    expect(missing).toEqual([]);
  });

  it("finds the navigation calls at all, so the check above cannot pass vacuously", () => {
    const ids = navigatedIds();
    expect(ids.size).toBeGreaterThan(10);
    expect(ids.has("ch.gate")).toBe(true); // direct nav.push
    expect(ids.has("setup.version")).toBe(true); // through SETUP's open() helper
  });

  it("registers HOME, since the navigator's stack bottom is that id", () => {
    expect(buildRegistry().get("home")).toBeDefined();
  });

  it("leaves no registered screen unreachable", () => {
    // The mirror of the check above: a screen nothing navigates to is dead code
    // the operator can never open. HOME is the exception — it is the stack
    // bottom the Navigator starts on, not somewhere anything pushes to.
    const navigated = new Set(navigatedIds().keys());
    const orphans = buildRegistry()
      .ids()
      .filter((id) => id !== "home" && !navigated.has(id));
    expect(orphans).toEqual([]);
  });

  it("has no two screens claiming the same id", () => {
    const registry = buildRegistry();
    const ids = registry.ids();
    expect(new Set(ids).size).toBe(ids.length);
  });
});
