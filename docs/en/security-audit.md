# Security audit

## Scope

The GitHub Pages publishing configuration, dependencies, tracked Git files, and production build.
This is not an application-wide penetration test.

## Results

| Area | Current configuration | Verification |
| --- | --- | --- |
| Deployment permissions | The build uses `contents: read`. Only deployment receives `pages: write` and `id-token: write` | Checked job permissions in `.github/workflows/pages.yml` |
| Publishing conditions | Deployment follows successful checks on `main`. Pull requests do not deploy | Checked event conditions, `needs: build`, and step failure propagation; ran `actionlint` |
| Actions | Pinned to commit SHAs; checkout does not persist credentials | Resolved official release tags to commits and compared them with the workflow |
| Dependencies | Vitest uses the patched 4.1.11 release or later | Compared the lockfile with the [official advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9); `pnpm audit` passed |
| Published files | Deployment contains the HTML, JavaScript, CSS, fonts and font license in `dist/` | Listed files after `pnpm build` |
| Tracked files | Excludes `reference/`, `work/`, installed dependencies and build output | Inspected `git ls-files` and pre-publication history |
| Sensitive data | No matches for the private-key, GitHub-token, AWS-access-key and machine-identifier search patterns | Scanned tracked files. Pattern matching does not establish the absence of secrets outside those patterns |

Unmeasured assumptions: None.
