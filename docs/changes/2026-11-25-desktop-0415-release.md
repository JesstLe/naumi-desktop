# Desktop 0.4.15 release

## Fixed inputs and ownership
- Own worktree E:/Workspace/naumi-desktop-release-0415; unrelated shared checkout preserved. Base main 95fd5a133a43a9d9cd346fddc55fa0e20205f6dd.
- Scope: version/lock metadata, product version and public release notes. Account catalog remains dynamically server-authorized; no private aliases, credentials or source routes are added to this package.
- No server updates, paid inference, current-user install or restart.

## Verification gates
- Original 0.4.14 fails the expected-version check; modified 0.4.15 passes; separate-copy rollback must restore original behavior. Initial Windows GBK harness failure is retained, not counted as a reproduction.
- Related model/auth/update tests: 41 passed. Fixed main commit build, actual EXE four-configuration upgrade gate, public installer readback and feed verification pending.
- Keep 0.4.14 package and original feed as recovery material. Deployment success is not current-user installation.

## Iteration
- Release metadata slice; feature iteration count unchanged.
