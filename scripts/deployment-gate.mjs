import { execFileSync } from "node:child_process";

function versionAt(commit) {
  const manifest = execFileSync("git", ["show", `${commit}:package.json`], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  });
  const { version } = JSON.parse(manifest);
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
  return versionAt(before) !== versionAt(after);
}

console.log(`deploy=${shouldDeploy()}`);
