import { execFileSync } from "node:child_process";

function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  }).trim();
}

// A push to main publishes only while its commit is still main's tip, read in the serialized
// deployment job: a run that finishes after a newer push leaves that push's site in place, and
// the newer push's own run publishes it.
function shouldDeploy() {
  if (process.env.GITHUB_EVENT_NAME !== "push" || process.env.GITHUB_REF !== "refs/heads/main") {
    return false;
  }
  const after = process.env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(after ?? "")) {
    throw new Error("Expected the push's commit SHA");
  }
  git("cat-file", "-e", `${after}^{commit}`);
  return git("rev-parse", "--verify", "refs/remotes/origin/main^{commit}") === after;
}

console.log(`deploy=${shouldDeploy()}`);
