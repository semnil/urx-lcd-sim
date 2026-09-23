import { execFileSync } from "node:child_process";

function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  }).trim();
}

function versionAt(commit) {
  const { version } = JSON.parse(git("show", `${commit}:package.json`));
  if (typeof version !== "string" || version.trim() === "") {
    throw new Error(`Missing application version at ${commit}`);
  }
  return version;
}

function shouldDeploy() {
  if (process.env.GITHUB_EVENT_NAME !== "push" || process.env.GITHUB_REF !== "refs/heads/main") {
    return false;
  }
  const before = process.env.BEFORE_SHA;
  const after = process.env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(before ?? "") || !/^[a-f0-9]{40}$/.test(after ?? "")) {
    throw new Error("Expected the push's before and after commit SHAs");
  }
  // Branch creation has no previous version to compare.
  if (before === "0".repeat(40)) return false;
  const version = versionAt(after);
  if (versionAt(before) === version) return false;
  if (process.argv.includes("--latest")) {
    if (git("merge-base", after, "origin/main") !== after) return false;
    const subsequent = git("rev-list", "--first-parent", `${after}..origin/main`);
    for (const commit of subsequent.split("\n").filter(Boolean)) {
      if (versionAt(commit) !== version) return false;
    }
  }
  return true;
}

console.log(`deploy=${shouldDeploy()}`);
