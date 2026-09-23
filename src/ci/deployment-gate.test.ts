// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const script = resolve("scripts/deployment-gate.mjs");
let repository: string;
let initial: string;
let unchanged: string;
let release: string;
let later: string;

function git(...args: string[]) {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  }).trim();
}

function commit(manifest: string) {
  writeFileSync(join(repository, "package.json"), manifest);
  git("add", "package.json");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Update manifest");
  return git("rev-parse", "HEAD");
}

function gate(before: string, after: string, event = "push", ref = "refs/heads/main") {
  return spawnSync(process.execPath, [script], {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env, BEFORE_SHA: before, GITHUB_SHA: after, GITHUB_EVENT_NAME: event, GITHUB_REF: ref },
  });
}

beforeAll(() => {
  repository = mkdtempSync(join(tmpdir(), "urx-deployment-gate-"));
  git("init", "-b", "main");
  initial = commit('{"version":"0.1.0"}');
  unchanged = commit('{"version":"0.1.0","description":"Updated"}');
  release = commit('{"version":"0.2.0"}');
  later = commit('{"version":"0.2.0","description":"Later change"}');
});

afterAll(() => rmSync(repository, { recursive: true, force: true }));

describe("Pages deployment gate", () => {
  it.each([
    ["pull_request", "refs/pull/1/merge"],
    ["pull_request", "refs/heads/main"],
    ["workflow_dispatch", "refs/heads/main"],
    ["push", "refs/heads/feature"],
    ["push", "refs/tags/v0.2.0"],
  ])("does not deploy %s on %s", (event, ref) => {
    const result = gate(unchanged, release, event, ref);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("deploy=false\n");
  });

  it("does not deploy manifest edits without an application version change", () => {
    const result = gate(initial, unchanged);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("deploy=false\n");
  });

  it("deploys the pushed version change even when the checkout has advanced", () => {
    const result = gate(unchanged, release);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("deploy=true\n");
  });

  it("detects a version change earlier in a multi-commit push", () => {
    const result = gate(unchanged, later);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("deploy=true\n");
  });

  it("does not deploy subsequent ordinary merges", () => {
    const result = gate(release, later);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("deploy=false\n");
  });

  it("does not deploy branch creation", () => {
    const result = gate("0".repeat(40), initial);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("deploy=false\n");
  });

  it.each(["", "--help", "f".repeat(40)])("fails closed on an unreadable commit %s", (commit) => {
    for (const [before, after] of [[commit, release], [initial, commit]]) {
      const result = gate(before!, after!);
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).not.toBe("");
    }
  });

  it.each(["{", "{}", '{"version":null}', '{"version":1}', '{"version":" "}'])("fails closed on an invalid manifest %s", (manifest) => {
    const invalid = commit(manifest);
    for (const [before, after] of [[initial, invalid], [invalid, release]]) {
      const result = gate(before!, after!);
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
    }
  });

  it("fails closed when the previous commit has no manifest", () => {
    const tree = git("mktree");
    const empty = git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit-tree", tree, "-m", "Empty tree");
    const result = gate(empty, release);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("gates artifact upload and deployment on the same successful build", () => {
    const workflow = readFileSync(resolve(".github/workflows/pages.yml"), "utf8");
    expect(workflow).toContain('run: node scripts/deployment-gate.mjs >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain("deploy: ${{ steps.release.outputs.deploy }}");
    expect(workflow).toContain("    needs: build\n");
    expect(workflow).not.toContain("workflow_dispatch:");
  });

  it.each([
    ["push", "refs/heads/main", "true", true],
    ["push", "refs/heads/main", "false", false],
    ["pull_request", "refs/pull/1/merge", "true", false],
    ["pull_request", "refs/heads/main", "true", false],
    ["workflow_dispatch", "refs/heads/main", "true", false],
    ["push", "refs/heads/feature", "true", false],
    ["push", "refs/tags/v0.2.0", "true", false],
  ])("workflow publishing conditions enforce %s on %s with gate=%s", (event, ref, deploy, allowed) => {
    const workflow = readFileSync(resolve(".github/workflows/pages.yml"), "utf8");
    const conditions = [
      /- name: Upload site\n\s+if: (.+)/.exec(workflow)?.[1],
      /\n  deploy:\n\s+if: (.+)/.exec(workflow)?.[1],
    ];
    for (const condition of conditions) {
      expect(condition).toBeDefined();
      // These conditions use the equality and boolean syntax shared by Actions and JavaScript.
      const evaluate = new Function("github", "steps", "needs", `return (${condition});`);
      expect(evaluate(
        { event_name: event, ref },
        { release: { outputs: { deploy } } },
        { build: { outputs: { deploy } } },
      )).toBe(allowed);
    }
  });
});
