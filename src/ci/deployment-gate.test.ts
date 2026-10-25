// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const script = resolve("scripts/deployment-gate.mjs");
let repository: string;
let first: string;
let second: string;
let third: string;

function git(...args: string[]) {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  }).trim();
}

function commit(content: string) {
  writeFileSync(join(repository, "app.txt"), content);
  git("add", "app.txt");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Change");
  return git("rev-parse", "HEAD");
}

function gate(after: string, event = "push", ref = "refs/heads/main") {
  return spawnSync(process.execPath, [script], {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env, GITHUB_SHA: after, GITHUB_EVENT_NAME: event, GITHUB_REF: ref },
  });
}

function gateAt(after: string, main: string) {
  git("update-ref", "refs/remotes/origin/main", main);
  return gate(after);
}

beforeAll(() => {
  repository = mkdtempSync(join(tmpdir(), "urx-deployment-gate-"));
  git("init", "-b", "main");
  first = commit("1\n");
  second = commit("2\n");
  third = commit("3\n");
  git("clone", "--bare", ".", join(repository, "remote.git"));
  git("remote", "add", "origin", join(repository, "remote.git"));
  mkdirSync(join(repository, "scripts"));
  copyFileSync(script, join(repository, "scripts/deployment-gate.mjs"));
});

afterAll(() => rmSync(repository, { recursive: true, force: true }));

describe("Pages deployment gate", () => {
  it("publishes a push that is main's tip", () => {
    const result = gateAt(third, third);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("deploy=true\n");
  });

  it("does not publish a push that main has moved past", () => {
    const result = gateAt(second, third);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("deploy=false\n");
  });

  it.each([[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]])(
    "keeps the newest push published when consecutive pushes complete in the order %i, %i, %i",
    (...order) => {
      const pushes = [first, second, third];
      const published: string[] = [];
      for (const index of order) {
        const result = gateAt(pushes[index]!, third);
        expect(result.status, result.stderr).toBe(0);
        if (result.stdout === "deploy=true\n") published.push(pushes[index]!);
      }
      expect(published).toEqual([third]);
    },
  );

  it("fails instead of publishing when the current main cannot be read", () => {
    git("update-ref", "-d", "refs/remotes/origin/main");
    const result = gate(third);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("fetches main again inside the workflow step and stops on fetch failure", () => {
    const workflow = readFileSync(resolve(".github/workflows/pages.yml"), "utf8");
    const step = /name: Check this push is still main's tip[\s\S]*?run: \|\n((?: {10}.+\n)+)/.exec(workflow)?.[1];
    expect(step).toBeDefined();
    const output = join(repository, "step-output");
    const run = () => spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", step!], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env, LC_ALL: "C", LANG: "C", GITHUB_OUTPUT: output,
        GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main", GITHUB_SHA: third,
      },
    });
    git("--git-dir", join(repository, "remote.git"), "update-ref", "refs/heads/main", third);
    git("update-ref", "refs/remotes/origin/main", first);
    const fresh = run();
    expect(fresh.status, fresh.stderr).toBe(0);
    expect(git("rev-parse", "origin/main")).toBe(third);
    expect(readFileSync(output, "utf8")).toBe("deploy=true\n");

    writeFileSync(output, "");
    git("remote", "set-url", "origin", join(repository, "missing.git"));
    const failed = run();
    expect(failed.status).not.toBe(0);
    expect(readFileSync(output, "utf8")).toBe("");
    git("remote", "set-url", "origin", join(repository, "remote.git"));
  });

  it("queues deployment jobs and checks freshness inside the serialized job", () => {
    const workflow = readFileSync(resolve(".github/workflows/pages.yml"), "utf8");
    const deployment = workflow.split("\n  deploy:\n")[1]!;
    expect(deployment).toContain("needs: build\n");
    expect(deployment).toMatch(/concurrency:\n\s+group: github-pages\n\s+queue: max\n\s+cancel-in-progress: false/);
    expect(deployment).toContain("contents: read");
    expect(deployment).toContain("ref: ${{ github.sha }}");
    expect(deployment).toMatch(/git fetch --no-tags origin \+refs\/heads\/main:refs\/remotes\/origin\/main\n\s+node scripts\/deployment-gate.mjs >> "\$GITHUB_OUTPUT"/);
    expect(deployment).toMatch(/- name: Deploy site\n\s+if: steps.latest.outputs.deploy == 'true'/);
    expect(deployment.indexOf("deployment-gate.mjs")).toBeLessThan(deployment.indexOf("- name: Deploy site"));
    expect(workflow).not.toMatch(/always\(\)|continue-on-error:\s*true/);
  });

  it.each([
    ["pull_request", "refs/pull/1/merge"],
    ["pull_request", "refs/heads/main"],
    ["workflow_dispatch", "refs/heads/main"],
    ["push", "refs/heads/feature"],
  ])("does not deploy %s on %s", (event, ref) => {
    git("update-ref", "refs/remotes/origin/main", third);
    const result = gate(third, event, ref);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("deploy=false\n");
  });

  it.each(["", "--help", "f".repeat(40)])("fails closed on an unreadable commit %s", (commit) => {
    git("update-ref", "refs/remotes/origin/main", third);
    const result = gate(commit);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toBe("");
  });

  it("creates no tag and no Release, and has no manual trigger that bypasses the checks", () => {
    const workflow = readFileSync(resolve(".github/workflows/pages.yml"), "utf8");
    expect(workflow).not.toContain("\n  release:\n");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("workflow_dispatch:");
  });

  it.each([
    ["push", "refs/heads/main", true],
    ["pull_request", "refs/pull/1/merge", false],
    ["pull_request", "refs/heads/main", false],
    ["workflow_dispatch", "refs/heads/main", false],
    ["push", "refs/heads/feature", false],
  ])("workflow publishing conditions enforce %s on %s", (event, ref, allowed) => {
    const workflow = readFileSync(resolve(".github/workflows/pages.yml"), "utf8");
    const conditions = [
      /- name: Upload site\n\s+if: (.+)/.exec(workflow)?.[1],
      /\n  deploy:\n\s+if: (.+)/.exec(workflow)?.[1],
    ];
    for (const condition of conditions) {
      expect(condition).toBeDefined();
      // These conditions use the equality and boolean syntax shared by Actions and JavaScript.
      const evaluate = new Function("github", `return (${condition});`);
      expect(evaluate({ event_name: event, ref })).toBe(allowed);
    }
  });
});
