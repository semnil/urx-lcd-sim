# Security audit

## Scope

The GitHub Pages publishing configuration, the CI workflow, dependencies, tracked Git files,
production build, vulnerability reporting channel, and the page's initialization controls.
This is not an application-wide penetration test.

## Results

| Area | Current configuration | Verification |
| --- | --- | --- |
| Deployment permissions | The build uses `contents: read`. Only the release job receives `contents: write`; only deployment receives `pages: write` and `id-token: write` | Checked job permissions in `.github/workflows/pages.yml` |
| CI permissions | The CI workflow's test job uses `contents: read` and `id-token: write`. The Codecov action uploads the coverage report with the job's OIDC token; the repository holds no Codecov token or other secret. Its Windows test job uses `contents: read` alone. Its end-to-end job uses `contents: read` alone, and uploads the traces of failed tests as a workflow artifact | Checked job permissions in `.github/workflows/ci.yml`, and listed the secrets of the repository and of its `github-pages` environment through the GitHub API |
| Publishing conditions | A push to `main` must change `package.json`'s `version` and pass tests and the build. Pull requests and ordinary merges do not deploy; there is no manual bypass | Ran the deployment gate against temporary Git histories, checked artifact and job conditions and `needs: build`, and ran `actionlint` |
| Version comparison | Reads the push's before and after commits, without executing manifest content. An unreadable commit or invalid manifest fails the build | Tested changed and unchanged versions, multi-commit pushes, branch creation, excluded events, missing commits, and invalid manifests |
| Event boundary | Artifact upload and deployment each require a push to `main`, independently of the version script's output | Evaluated the workflow conditions with a positive version output for pull requests, manual runs, other branches and tags, with a push to `main` as the positive control |
| Release order | The serialized deploy job refreshes `origin/main` and rejects runs with a later version change in the first-parent history. Ordinary subsequent commits are allowed | Tested reverse completion order, old-run retries, consecutive releases, reused version strings, a rewritten main, and ordinary subsequent changes; executed the workflow's fetch-and-check step against a local Git remote, including fetch failure |
| Deployment queue | The shared deployment group uses `queue: max` and does not cancel running jobs | Checked the workflow setting against [GitHub's concurrency specification](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency); the queue has a platform-defined capacity and rejects additional jobs when full |
| Tags and Releases | After build success, the release job creates a tag at the tested SHA and a draft Release. Conflicting tags fail without being moved; retries preserve existing Releases. Release failure prevents Pages deployment | Validated version formats, draft/prerelease flags, generated notes, existing lightweight/annotated tags, partial failure recovery, and API failures with simulated API responses; executed the workflow's release script with that client |
| Actions | Pinned to commit SHAs; checkout does not persist credentials | Resolved official release tags to commits and compared them with the workflows |
| Dependencies | Vitest uses the patched 4.1.11 release or later | Compared the lockfile with the [official advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9); `pnpm audit` passed |
| Dependency updates | Dependabot opens weekly pull requests for the npm dev dependencies and the SHA-pinned actions. `@types/node` stays on the Node 24 major of `.node-version` | Parsed `.github/dependabot.yml` |
| Vulnerability reports | Private vulnerability reporting is enabled, and [SECURITY.md](../../SECURITY.md) sends reports there | Read the repository's setting through the GitHub API |
| Published files | Deployment contains the HTML, JavaScript, CSS, favicon, link preview image, fonts and font license in `dist/` | Listed files after `pnpm build` |
| Tracked files | Excludes `reference/`, `work/`, installed dependencies and build output | Inspected `git ls-files` and pre-publication history |
| Sensitive data | No matches for the private-key, GitHub-token, AWS-access-key and machine-identifier search patterns | Scanned tracked files. Pattern matching does not establish the absence of secrets outside those patterns |
| Initialization | Both Device menu items ask with [Cancel] focused, reject a second click and share a startup lock with model changes. Current initialization keeps stored scene memories and the card; the all-memory reset keeps the card | Exercised pointer-driven warning display and cancellation, internal focus transitions, the click hold boundary, a held storage read, overlapping model changes in either order, subsequent edits and reloaded saved values. Removing scene retention or the click guard failed their regression tests. The controls restart a local `SimTransport` |

The released actionlint 1.7.12 reports `concurrency.queue` as an unknown key
([upstream issue](https://github.com/rhysd/actionlint/issues/657)). Local linting excludes only
`^unexpected key "queue" for "concurrency" section\.`; the queue setting is checked by the
workflow contract test and against the GitHub specification linked above.

Verification covers local gate execution and workflow validation. These local checks do not
create tags or Releases on GitHub, execute a production deployment, or exercise the published site.

Unmeasured assumptions: None.
