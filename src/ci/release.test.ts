// @vitest-environment node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const { ensureRelease, releaseDetails } = await import(resolve("scripts/release.mjs"));
const sha = "a".repeat(40);
const input = { owner: "owner", repo: "repository", sha, version: "1.2.3" };
const notFound = () => Object.assign(new Error("Not found"), { status: 404 });
type Release = { id: number; tag_name: string; draft: boolean; body: string; html_url: string };

function service() {
  const state: {
    reference?: { object: { type: string; sha: string } };
    releases: Release[];
  } = { releases: [] };
  const github = {
    rest: {
      git: {
        getRef: vi.fn(async () => {
          if (!state.reference) throw notFound();
          return { data: state.reference };
        }),
        getTag: vi.fn(async () => ({ data: { object: { type: "commit", sha } } })),
        createRef: vi.fn(async (data: { sha: string }) => {
          state.reference = { object: { type: "commit", sha: data.sha } };
          return { data: state.reference };
        }),
      },
      repos: {
        listReleases: vi.fn(async () => state.releases),
        createRelease: vi.fn(async (data: { tag_name: string; draft: boolean }) => {
          const release = { id: 1, tag_name: data.tag_name, draft: data.draft, body: "Generated notes", html_url: "https://example.invalid/releases/1" };
          state.releases.push(release);
          return { data: release };
        }),
      },
    },
    paginate: vi.fn(async (method: () => Promise<Release[]>) => method()),
  };
  return { github, state };
}

describe("release version", () => {
  it.each([
    ["1.2.3", false], ["1.2.3-alpha", true], ["1.2.3-alpha.1", true],
    ["1.2.3-beta2", true], ["1.2.3-rc.1", true],
  ])("classifies %s", (version, prerelease) => {
    expect(releaseDetails(version)).toEqual({ tag: `v${version}`, prerelease });
  });

  it.each([undefined, null, 1, "", "v1.2.3", "1.2", "1.2.3\n", "1.2.3-preview1", "1.2.3-rc..1", "1.2.3-rc."])("rejects %s before API calls", async (version) => {
    const { github } = service();
    await expect(ensureRelease(github, { ...input, version })).rejects.toThrow();
    expect(github.rest.git.getRef).not.toHaveBeenCalled();
    expect(github.rest.git.createRef).not.toHaveBeenCalled();
    expect(github.rest.repos.createRelease).not.toHaveBeenCalled();
  });
});

describe("version tag and draft Release", () => {
  it("executes the workflow script using the checked-out version and tested SHA", async () => {
    const workflow = readFileSync(resolve(".github/workflows/pages.yml"), "utf8");
    const release = workflow.split("\n  release:\n")[1]?.split("\n  deploy:\n")[0];
    expect(release).toBeDefined();
    const source = /script: \|\n((?: {12}.+\n)+)/.exec(release!)?.[1];
    expect(source).toBeDefined();
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      const writes = [];
      const github = {
        rest: {
          git: {
            getRef: async () => { throw Object.assign(new Error('Not found'), { status: 404 }); },
            createRef: async (data) => { writes.push({ kind: 'tag', ...data }); },
          },
          repos: {
            listReleases: async () => [],
            createRelease: async (data) => {
              writes.push({ kind: 'release', ...data });
              return { data: { html_url: 'https://example.invalid/releases/1' } };
            },
          },
        },
        paginate: async (method) => method(),
      };
      const execute = Object.getPrototypeOf(async () => {}).constructor;
      await new execute('github', 'context', 'core', ${JSON.stringify(source)})(
        github, ${JSON.stringify({ repo: { owner: input.owner, repo: input.repo }, sha })}, { info: () => {} });
      console.log(JSON.stringify(writes));
    `], { encoding: "utf8", env: { ...process.env, GITHUB_WORKSPACE: resolve(".") } });
    expect(result.status, result.stderr).toBe(0);
    const writes = JSON.parse(result.stdout);
    const { version } = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    expect(writes).toEqual([
      expect.objectContaining({ kind: "tag", ref: `refs/tags/v${version}`, sha }),
      expect.objectContaining({ kind: "release", tag_name: `v${version}`, draft: true, target_commitish: sha }),
    ]);
  });

  it("tags the tested commit and creates a draft with generated notes", async () => {
    const { github, state } = service();
    const result = await ensureRelease(github, input);
    expect(github.rest.git.createRef).toHaveBeenCalledWith({ owner: input.owner, repo: input.repo, ref: "refs/tags/v1.2.3", sha });
    expect(github.rest.repos.createRelease).toHaveBeenCalledWith({
      owner: input.owner, repo: input.repo, tag_name: "v1.2.3", target_commitish: sha,
      name: "v1.2.3", draft: true, prerelease: false, generate_release_notes: true,
    });
    expect(github.rest.git.createRef.mock.invocationCallOrder[0]).toBeLessThan(github.rest.repos.createRelease.mock.invocationCallOrder[0]!);
    expect(result).toEqual(state.releases[0]);
  });

  it("marks prereleases as drafts and prereleases", async () => {
    const { github } = service();
    await ensureRelease(github, { ...input, version: "1.2.3-rc.1" });
    expect(github.rest.repos.createRelease).toHaveBeenCalledWith(expect.objectContaining({ draft: true, prerelease: true }));
  });

  it.each([true, false])("preserves an existing Release with draft=%s and its operator-edited notes", async (draft) => {
    const { github, state } = service();
    const existing = await ensureRelease(github, input);
    existing.draft = draft;
    existing.body = "Operator notes";
    state.releases.unshift({ ...existing, id: 2, tag_name: "v0.1.0" });
    expect(await ensureRelease(github, input)).toEqual(existing);
    expect(github.paginate).toHaveBeenCalledWith(github.rest.repos.listReleases, { owner: input.owner, repo: input.repo, per_page: 100 });
    expect(github.rest.git.createRef).toHaveBeenCalledTimes(1);
    expect(github.rest.repos.createRelease).toHaveBeenCalledTimes(1);
    expect(existing.body).toBe("Operator notes");
  });

  it("recovers after tag creation succeeded but Release creation failed", async () => {
    const { github } = service();
    github.rest.repos.createRelease.mockRejectedValueOnce(new Error("Service unavailable"));
    await expect(ensureRelease(github, input)).rejects.toThrow("Service unavailable");
    await ensureRelease(github, input);
    expect(github.rest.git.createRef).toHaveBeenCalledTimes(1);
    expect(github.rest.repos.createRelease).toHaveBeenCalledTimes(2);
  });

  it("accepts an existing annotated tag only when it resolves to the tested commit", async () => {
    const { github, state } = service();
    state.reference = { object: { type: "tag", sha: "b".repeat(40) } };
    await ensureRelease(github, input);
    expect(github.rest.git.getTag).toHaveBeenCalledWith({ owner: input.owner, repo: input.repo, tag_sha: "b".repeat(40) });
    expect(github.rest.git.createRef).not.toHaveBeenCalled();
    expect(github.rest.repos.createRelease).toHaveBeenCalledOnce();
  });

  it.each(["commit", "tag", "tree"])("refuses a conflicting %s tag without writing", async (type) => {
    const { github, state } = service();
    state.reference = { object: { type, sha: "b".repeat(40) } };
    github.rest.git.getTag.mockResolvedValue({ data: { object: { type: "commit", sha: "c".repeat(40) } } });
    await expect(ensureRelease(github, input)).rejects.toThrow("refusing to move");
    expect(github.rest.git.createRef).not.toHaveBeenCalled();
    expect(github.rest.repos.createRelease).not.toHaveBeenCalled();
  });

  it("does not recreate a missing tag for an existing Release", async () => {
    const { github, state } = service();
    await ensureRelease(github, input);
    delete state.reference;
    await expect(ensureRelease(github, input)).rejects.toThrow("tag is missing");
    expect(github.rest.git.createRef).toHaveBeenCalledTimes(1);
    expect(github.rest.repos.createRelease).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 500])("propagates tag lookup status %s without writing", async (status) => {
    const { github } = service();
    const error = Object.assign(new Error("Read failed"), { status });
    github.rest.git.getRef.mockRejectedValue(error);
    await expect(ensureRelease(github, input)).rejects.toBe(error);
    expect(github.rest.git.createRef).not.toHaveBeenCalled();
    expect(github.rest.repos.createRelease).not.toHaveBeenCalled();
  });

  it("stops before tagging when the Release listing fails", async () => {
    const { github } = service();
    github.paginate.mockRejectedValue(new Error("Cannot read releases"));
    await expect(ensureRelease(github, input)).rejects.toThrow("Cannot read releases");
    expect(github.rest.git.createRef).not.toHaveBeenCalled();
    expect(github.rest.repos.createRelease).not.toHaveBeenCalled();
  });

  it("does not create a Release when tag creation fails", async () => {
    const { github } = service();
    github.rest.git.createRef.mockRejectedValue(new Error("Cannot create tag"));
    await expect(ensureRelease(github, input)).rejects.toThrow("Cannot create tag");
    expect(github.rest.repos.createRelease).not.toHaveBeenCalled();
  });

  it("rejects an invalid commit before API calls", async () => {
    const { github } = service();
    await expect(ensureRelease(github, { ...input, sha: "main" })).rejects.toThrow("commit SHA");
    expect(github.rest.git.getRef).not.toHaveBeenCalled();
  });

  it("creates releases after build success and gates deployment on release success", () => {
    const workflow = readFileSync(resolve(".github/workflows/pages.yml"), "utf8");
    const release = workflow.split("\n  release:\n")[1]?.split("\n  deploy:\n")[0];
    expect(release).toBeDefined();
    expect(release).toContain("needs: build");
    expect(release).toContain("contents: write");
    expect(release).toContain("ref: ${{ github.sha }}");
    expect(release).toContain("persist-credentials: false");
    expect(release).toContain("ensureRelease(github, { ...context.repo, sha: context.sha, version })");
    expect(workflow.split("\n  deploy:\n")[1]).toContain("needs: [build, release]");
    expect(workflow).not.toMatch(/always\(\)|continue-on-error:\s*true|workflow_dispatch:|\n  release:\n\s+types:/);
  });
});
