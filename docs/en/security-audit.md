# Security audit

## Scope

The GitHub Pages publishing configuration, dependencies, tracked Git files, and production build.
This is not an application-wide penetration test.

## Results

| Area | Current configuration | Verification |
| --- | --- | --- |
| Deployment permissions | The build uses `contents: read`. Only deployment receives `pages: write` and `id-token: write` | Checked job permissions in `.github/workflows/pages.yml` |
| Publishing conditions | A push to `main` must change `package.json`'s `version` and pass tests and the build. Pull requests and ordinary merges do not deploy; there is no manual bypass | Ran the deployment gate against temporary Git histories, checked artifact and job conditions and `needs: build`, and ran `actionlint` |
| Version comparison | Reads the push's before and after commits, without executing manifest content. An unreadable commit or invalid manifest fails the build | Tested changed and unchanged versions, multi-commit pushes, branch creation, excluded events, missing commits, and invalid manifests |
| Event boundary | Artifact upload and deployment each require a push to `main`, independently of the version script's output | Evaluated the workflow conditions with a positive version output for pull requests, manual runs, other branches and tags, with a push to `main` as the positive control |
| Actions | Pinned to commit SHAs; checkout does not persist credentials | Resolved official release tags to commits and compared them with the workflow |
| Dependencies | Vitest uses the patched 4.1.11 release or later | Compared the lockfile with the [official advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9); `pnpm audit` passed |
| Published files | Deployment contains the HTML, JavaScript, CSS, fonts and font license in `dist/` | Listed files after `pnpm build` |
| Tracked files | Excludes `reference/`, `work/`, installed dependencies and build output | Inspected `git ls-files` and pre-publication history |
| Sensitive data | No matches for the private-key, GitHub-token, AWS-access-key and machine-identifier search patterns | Scanned tracked files. Pattern matching does not establish the absence of secrets outside those patterns |

Verification covers local gate execution and workflow validation. Deployment on GitHub's runners
and the published site are not exercised by these local checks.

Unmeasured assumptions: None.
