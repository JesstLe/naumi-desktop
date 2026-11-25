# Desktop 0.4.15 release

## Fixed inputs and ownership
- Own worktree E:/Workspace/naumi-desktop-release-0415; unrelated shared checkout preserved. Base main 95fd5a133a43a9d9cd346fddc55fa0e20205f6dd.
- Scope: version/lock metadata, product version and public release notes. Account catalog remains dynamically server-authorized; no private aliases, credentials or source routes are added to this package.
- No server updates, paid inference, current-user install or restart.

## Verification gates
- Original 0.4.14 fails the expected-version check; modified 0.4.15 passes; separate-copy rollback must restore original behavior. Initial Windows GBK harness failure is retained, not counted as a reproduction.
- Related model/auth/update tests: 41 passed. Fixed main 3d52c925 full build, actual EXE four-configuration upgrade gate, anonymous full installer readback and real previous-version update download all passed.
- Keep 0.4.14 package and original feed as recovery material. Deployment success is not current-user installation.

## Iteration
- Release metadata slice; feature iteration count unchanged.

## Real EXE upgrade fixture correction
- First mandatory package gate passed the fresh native scenarios, then reproduced `PACKAGED_STARTUP_ACCOUNT_MODEL_SERVICE_REQUIRED` on the actual previous 0.4.14 EXE. Original failure retained at D:/NaumiReleases/0.4.15/evidence/MANDATORY_GATE_FIRST_FAILURE.json.
- Root cause: fixture enabled bootstrap only for candidate-path equality, though 0.4.14 already requires cloud account models. The fixture now reads the launched EXE's own sibling runtime-manifest.json. Missing/invalid manifests fail closed; pre-cloud manifests retain 404 bootstrap behavior. Product startup and bootstrap code unchanged.
- Focused module tests: `node --test tests/model-picker-distribution.test.mjs`, 6 PASS/0 FAIL. Actual full four-case gate follows.
- Separate actual 0.4.15 EXE live read-only acceptance passed: client/service 0.4.15, 15 exact opaque catalog IDs/names, 14 image/1 text-only, supplierCalls=0, originalProfileWrites=0. This does not replace the warm-cache/linked-service package gate.
- A separately owned three-issue client fix is in progress. The initial package remained unpublished; final source 3d52c925 was then built and published only after the verified three-issue fix was integrated.


## Final public delivery
- Runtime source: main `3d52c925e635a3851899f8ba8f24630ac24cbbde`; functional three-issue source and regressions are documented in `2026-11-25-session-routing-identity.md`. Its concentrated47/final18/full1165/native9/UI21 evidence was reopened; no duplicate paid calls.
- Standard full build exits0: Node24.19.0,45676 runtime files, closurePASS/forbiddenPaths0; mandatory actual installer/EXE four cases × three scenes, old0.4.14 cached upgrades and copied linked service all PASS. Loopback inference8, real supplier0. Final seven product files match both packaged runtime copies exactly; CRLF/LF source hashes are distinguished and normalized Git identity verified.
- Final actual EXE with a private copy of the lawful native session: client/service0.4.15, live exact15 names/opaque IDs,14 image/1 text-only, native picker/settings allowlist PASS;0 supplier calls/0 original-profile writes. Screenshot `D:/NaumiReleases/0.4.15/evidence/ACTUAL_0415_MODELS.png` opened and inspected.
- Published normal GitHub release `https://github.com/JesstLe/naumi-desktop/releases/tag/v0.4.15`, not draft/prerelease; tag targets exact fixed source. Public release notes, CHANGELOG and anonymous latest.yml match.
- Installer504642162 bytes, SHA256 `d61186631697d0a07bc7aa03a6912c3eabc28b4b494c2098e37947d2544f74f0`. Anonymous full GET matched bytes, SHA256 and feed SHA512.
- Real previous0.4.14 EXE in own isolated directory used the unchanged normal update feeds, discovered0.4.15 and reached downloaded/verified `ready`; installRequested=false. Current user client was not installed, restarted or attached.
- Stable deliverables and four reopened evidence artifacts: `D:/NaumiReleases/0.4.15/`; source ZIP, source pins, final gate, full logs, raw first failures and rollback-copy evidence retained. 0.4.14 stays intact as recovery. No47 production/timer/nginx/DB changes.
- Separate reported503 ACCOUNT_MODEL_UNAVAILABLE remains independently investigated, with existing UNKNOWN requests retained. This release does not claim that upstream incident is resolved.
