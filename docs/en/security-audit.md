# Security audit

## Scope

The GitHub Pages publishing configuration, dependencies, tracked Git files, and production build.
This is not an application-wide penetration test.

## Results

| Area | Current configuration | Verification |
| --- | --- | --- |
| Deployment permissions | The build uses `contents: read`. Only the release job receives `contents: write`; only deployment receives `pages: write` and `id-token: write` | Checked job permissions in `.github/workflows/pages.yml` |
| Publishing conditions | A push to `main` must change `package.json`'s `version` and pass tests and the build. Pull requests and ordinary merges do not deploy; there is no manual bypass | Ran the deployment gate against temporary Git histories, checked artifact and job conditions and `needs: build`, and ran `actionlint` |
| Version comparison | Reads the push's before and after commits, without executing manifest content. An unreadable commit or invalid manifest fails the build | Tested changed and unchanged versions, multi-commit pushes, branch creation, excluded events, missing commits, and invalid manifests |
| Event boundary | Artifact upload and deployment each require a push to `main`, independently of the version script's output | Evaluated the workflow conditions with a positive version output for pull requests, manual runs, other branches and tags, with a push to `main` as the positive control |
| Release order | The serialized deploy job refreshes `origin/main` and rejects runs with a later version change in the first-parent history. Ordinary subsequent commits are allowed | Tested reverse completion order, old-run retries, consecutive releases, reused version strings, a rewritten main, and ordinary subsequent changes; executed the workflow's fetch-and-check step against a local Git remote, including fetch failure |
| Deployment queue | The shared deployment group uses `queue: max` and does not cancel running jobs | Checked the workflow setting against [GitHub's concurrency specification](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency); the queue has a platform-defined capacity and rejects additional jobs when full |
| Tags and Releases | After build success, the release job creates a tag at the tested SHA and a draft Release. Conflicting tags fail without being moved; retries preserve existing Releases. Release failure prevents Pages deployment | Validated version formats, draft/prerelease flags, generated notes, existing lightweight/annotated tags, partial failure recovery, and API failures with simulated API responses; executed the workflow's release script with that client |
| Actions | Pinned to commit SHAs; checkout does not persist credentials | Resolved official release tags to commits and compared them with the workflow |
| Dependencies | Vitest uses the patched 4.1.11 release or later | Compared the lockfile with the [official advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9); `pnpm audit` passed |
| Published files | Deployment contains the HTML, JavaScript, CSS, fonts and font license in `dist/` | Listed files after `pnpm build` |
| Tracked files | Excludes `reference/`, `work/`, installed dependencies and build output | Inspected `git ls-files` and pre-publication history |
| Sensitive data | No matches for the private-key, GitHub-token, AWS-access-key and machine-identifier search patterns | Scanned tracked files. Pattern matching does not establish the absence of secrets outside those patterns |

The released actionlint 1.7.12 reports `concurrency.queue` as an unknown key
([upstream issue](https://github.com/rhysd/actionlint/issues/657)). Local linting excludes only
`^unexpected key "queue" for "concurrency" section\.`; the queue setting is checked by the
workflow contract test and against the GitHub specification linked above.

Verification covers local gate execution and workflow validation. These local checks do not
create tags or Releases on GitHub, execute a production deployment, or exercise the published site.

Unmeasured assumptions: None.
