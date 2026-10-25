// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCommit } from "../../vite.config";

let repository: string;
let head: string;

function git(...args: string[]) {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  }).trim();
}

beforeAll(() => {
  repository = mkdtempSync(join(tmpdir(), "urx-build-commit-"));
  git("init", "-q", "-b", "main");
  mkdirSync(join(repository, "nested"));
  writeFileSync(join(repository, "nested", "file.txt"), "x\n");
  git("add", "nested/file.txt");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "One");
  head = git("rev-parse", "HEAD");
});

afterAll(() => rmSync(repository, { recursive: true, force: true }));

describe("the commit APP Version shows", () => {
  it("is the shortened commit of the work tree it is asked about", () => {
    const commit = buildCommit(repository);
    expect(commit.length).toBeGreaterThanOrEqual(7);
    expect(head.startsWith(commit)).toBe(true);
  });

  it("is refused for a directory inside another repository's work tree", () => {
    // What an empty submodule directory is: git run there answers for the repository around it.
    expect(() => buildCommit(join(repository, "nested"))).toThrow(/is not a git work tree of its own/);
  });
});
