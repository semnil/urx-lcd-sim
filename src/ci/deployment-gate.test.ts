// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const script = resolve("scripts/deployment-gate.mjs");
let repository: string;
let initial: string;
let unchanged: string;
let release: string;
let later: string;
let nextRelease: string;
let nextLater: string;
let newestRelease: string;
let reusedVersion: string;

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

function gate(before: string, after: string, event = "push", ref = "refs/heads/main", latest = false) {
  return spawnSync(process.execPath, [script, ...(latest ? ["--latest"] : [])], {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env, BEFORE_SHA: before, GITHUB_SHA: after, GITHUB_EVENT_NAME: event, GITHUB_REF: ref },
  });
}

function latestGate(before: string, after: string, main: string) {
  git("update-ref", "refs/remotes/origin/main", main);
  return gate(before, after, "push", "refs/heads/main", true);
}

beforeAll(() => {
  repository = mkdtempSync(join(tmpdir(), "urx-deployment-gate-"));
  git("init", "-b", "main");
  initial = commit('{"version":"0.1.0"}');
  unchanged = commit('{"version":"0.1.0","description":"Updated"}');
  release = commit('{"version":"0.2.0"}');
  later = commit('{"version":"0.2.0","description":"Later change"}');
  nextRelease = commit('{"version":"0.3.0"}');
  nextLater = commit('{"version":"0.3.0","description":"Ordinary merge"}');
  newestRelease = commit('{"version":"0.4.0"}');
  reusedVersion = commit('{"version":"0.2.0"}');
  git("clone", "--bare", ".", join(repository, "remote.git"));
  git("remote", "add", "origin", join(repository, "remote.git"));
  mkdirSync(join(repository, "scripts"));
  copyFileSync(script, join(repository, "scripts/deployment-gate.mjs"));
  copyFileSync(resolve("scripts/release.mjs"), join(repository, "scripts/release.mjs"));
});

afterAll(() => rmSync(repository, { recursive: true, force: true }));

describe("Pages deployment gate", () => {
  it("keeps the newer release published when builds finish in reverse order or an old run is retried", () => {
    const published: string[] = [];
    for (const [before, after] of [[later, nextRelease], [unchanged, release], [unchanged, release]] as const) {
      const result = latestGate(before, after, nextRelease);
      expect(result.status, result.stderr).toBe(0);
      if (result.stdout === "deploy=true\n") published.push(after);
    }
    expect(published).toEqual([nextRelease]);
  });

  it("allows a release after ordinary manifest edits without publishing those edits", () => {
    const result = latestGate(later, nextRelease, nextLater);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("deploy=true\n");
    expect(latestGate(nextRelease, nextLater, nextLater).stdout).toBe("deploy=false\n");
  });

  it("compares main's first-parent history for a merge that preserves the released version", () => {
    const merged = git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit-tree",
      `${nextLater}^{tree}`, "-p", nextRelease, "-p", reusedVersion, "-m", "Merge ordinary change");
    const result = latestGate(later, nextRelease, merged);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("deploy=true\n");
  });

  it("retains the newest release across every completion order of consecutive releases", () => {
    const candidates = [[unchanged, release], [later, nextRelease], [nextLater, newestRelease]] as const;
    for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      const published: string[] = [];
      for (const index of order) {
        const [before, after] = candidates[index]!;
        const result = latestGate(before, after, newestRelease);
        expect(result.status, result.stderr).toBe(0);
        if (result.stdout === "deploy=true\n") published.push(after);
      }
      expect(published).toEqual([newestRelease]);
    }
  });

  it("rejects an old release even when a later release reuses its version string", () => {
    expect(latestGate(unchanged, release, reusedVersion).stdout).toBe("deploy=false\n");
    const result = latestGate(newestRelease, reusedVersion, reusedVersion);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("deploy=true\n");
  });

  it("rejects a release that is no longer on main", () => {
    const result = latestGate(later, nextRelease, release);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("deploy=false\n");
  });

  it("fails instead of publishing when the current main cannot be read", () => {
    git("update-ref", "-d", "refs/remotes/origin/main");
    const result = gate(unchanged, release, "push", "refs/heads/main", true);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("fetches main again inside the workflow step and stops on fetch failure", () => {
    const workflow = readFileSync(resolve(".github/workflows/pages.yml"), "utf8");
    const step = /name: Check latest application release[\s\S]*?run: \|\n((?: {10}.+\n)+)/.exec(workflow)?.[1];
    expect(step).toBeDefined();
    const output = join(repository, "step-output");
    const run = () => spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", step!], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env, LC_ALL: "C", LANG: "C", GITHUB_OUTPUT: output,
        GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main", BEFORE_SHA: later, GITHUB_SHA: nextRelease,
      },
    });
    git("--git-dir", join(repository, "remote.git"), "update-ref", "refs/heads/main", nextLater);
    git("update-ref", "refs/remotes/origin/main", release);
    const fresh = run();
    expect(fresh.status, fresh.stderr).toBe(0);
    expect(git("rev-parse", "origin/main")).toBe(nextLater);
    expect(readFileSync(output, "utf8")).toBe("deploy=true\n");

    writeFileSync(output, "");
    git("remote", "set-url", "origin", join(repository, "missing.git"));
    const failed = run();
    expect(failed.status).not.toBe(0);
    expect(readFileSync(output, "utf8")).toBe("");
  });

  it("queues deployment jobs and checks freshness inside the serialized job", () => {
    const workflow = readFileSync(resolve(".github/workflows/pages.yml"), "utf8");
    const deployment = workflow.split("\n  deploy:\n")[1]!;
    expect(deployment).toContain("needs: [build, release]");
    expect(deployment).toMatch(/concurrency:\n\s+group: github-pages\n\s+queue: max\n\s+cancel-in-progress: false/);
    expect(deployment).toContain("contents: read");
    expect(deployment).toContain("ref: ${{ github.sha }}");
    expect(deployment).toContain("fetch-depth: 0");
    expect(deployment).toContain("BEFORE_SHA: ${{ github.event.before }}");
    expect(deployment).toMatch(/git fetch --no-tags origin \+refs\/heads\/main:refs\/remotes\/origin\/main\n\s+node scripts\/deployment-gate.mjs --latest >> "\$GITHUB_OUTPUT"/);
    expect(deployment).toMatch(/- name: Deploy site\n\s+if: steps.latest.outputs.deploy == 'true'/);
    expect(deployment.indexOf("--latest")).toBeLessThan(deployment.indexOf("- name: Deploy site"));
    expect(workflow).not.toMatch(/always\(\)|continue-on-error:\s*true/);
  });

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

  it.each(["{", "{}", '{"version":null}', '{"version":1}', '{"version":" "}', '{"version":"1.0.0-preview1"}'])("fails closed on an invalid manifest %s", (manifest) => {
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
      /\n  release:\n\s+if: (.+)/.exec(workflow)?.[1],
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
