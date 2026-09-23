export function releaseDetails(version) {
  const match = typeof version === "string" && /^\d+\.\d+\.\d+(?:-(alpha|beta|rc)[\d.]*)?$/.exec(version);
  if (!match || match[0] !== version || version.includes("..") || version.endsWith(".")) {
    throw new Error("Expected X.Y.Z or X.Y.Z-alpha/-beta/-rc followed by digits and dots");
  }
  return { tag: `v${version}`, prerelease: Boolean(match[1]) };
}

export async function ensureRelease(github, { owner, repo, sha, version }) {
  const { tag, prerelease } = releaseDetails(version);
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Expected the tested commit SHA");
  const repository = { owner, repo };
  let reference;
  try {
    reference = (await github.rest.git.getRef({ ...repository, ref: `tags/${tag}` })).data;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (reference) {
    let target = reference.object;
    while (target.type === "tag") {
      target = (await github.rest.git.getTag({ ...repository, tag_sha: target.sha })).data.object;
    }
    if (target.type !== "commit" || target.sha !== sha) {
      throw new Error(`${tag} already points to a different object; refusing to move it`);
    }
  }
  const releases = await github.paginate(github.rest.repos.listReleases, { ...repository, per_page: 100 });
  const existing = releases.find((release) => release.tag_name === tag);
  if (existing && !reference) throw new Error(`${tag} has a Release but its tag is missing`);
  if (existing) return existing;
  if (!reference) {
    await github.rest.git.createRef({ ...repository, ref: `refs/tags/${tag}`, sha });
  }
  return (await github.rest.repos.createRelease({
    ...repository,
    tag_name: tag,
    target_commitish: sha,
    name: tag,
    draft: true,
    prerelease,
    generate_release_notes: true,
  })).data;
}
