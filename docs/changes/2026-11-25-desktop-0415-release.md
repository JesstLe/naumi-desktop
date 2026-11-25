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

## Real EXE upgrade fixture correction
- First mandatory package gate passed the fresh native scenarios, then reproduced `PACKAGED_STARTUP_ACCOUNT_MODEL_SERVICE_REQUIRED` on the actual previous 0.4.14 EXE. Original failure retained at D:/NaumiReleases/0.4.15/evidence/MANDATORY_GATE_FIRST_FAILURE.json.
- Root cause: fixture enabled bootstrap only for candidate-path equality, though 0.4.14 already requires cloud account models. The fixture now reads the launched EXE's own sibling runtime-manifest.json. Missing/invalid manifests fail closed; pre-cloud manifests retain 404 bootstrap behavior. Product startup and bootstrap code unchanged.
- Focused module tests: `node --test tests/model-picker-distribution.test.mjs`, 6 PASS/0 FAIL. Actual full four-case gate follows.
- Separate actual 0.4.15 EXE live read-only acceptance passed: client/service 0.4.15, 15 exact opaque catalog IDs/names, 14 image/1 text-only, supplierCalls=0, originalProfileWrites=0. This does not replace the warm-cache/linked-service package gate.
- A separately owned three-issue client fix is in progress. The package remains unpublished while that verified fixed main is coordinated; do not mark public release complete.
