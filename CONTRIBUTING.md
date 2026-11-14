# Contributing

VS Control uses Node.js 20 or later and Python 3. There are no npm dependencies to install and no lockfile is needed. All project documentation and user-facing text are in English.

## Local checks

```sh
npm run verify
```

This validates syntax and versions, builds the generated extension files, runs the unit/protocol/transport tests, packages the extension and plugin, verifies archive contents and checksums, checks reproducibility, and starts the extracted MCP server. Socket tests need permission to listen on loopback.

For changes affecting editor integration, also run:

```sh
npm run build
npm run test:integration
```

The integration runner uses a temporary VS Code profile. Set `VSCODE_EXECUTABLE` if VS Code is installed outside the default location. The README records the tested environment and remaining platform limitations. The hosted test pipeline covers unit, protocol, transport, and packaging checks; it does not run this interactive extension-host suite.

If Node.js is not installed on macOS, use the bundled runtime described in [README.md](README.md). Set `VS_CONTROL_NODE` to that executable when running `scripts/verify-package.py`, and keep `ELECTRON_RUN_AS_NODE=1` in its environment.

## Repository layout

| Path | Purpose |
| --- | --- |
| `extension/src/` | Companion extension, native-tool adapter, and authenticated bridge |
| `plugin/` | Self-contained Claude Code plugin and MCP process |
| `plugin/lib/state.cjs` | Shared discovery logic; copied into the extension during builds |
| `scripts/` | Local build, validation, packaging, and integration-test commands |
| `test/` | Unit, protocol, transport, and real extension-host fixtures |
| `.github/workflows/` | Automated test pipeline and manual draft-release workflow |
| `docs/` | Optional local notes; ignored and never required by builds or releases |
| `dist/` | Generated packages and local reports; excluded from Git |

Edit source files rather than generated copies under `extension/lib/`, `extension/docs/`, or `dist/`. Keep package content lists in `scripts/package.py` current when adding runtime files. Do not commit local bridge descriptors or machine-specific plugin variants.

## Changes and versions

Keep changes focused and explain how they were verified. Preserve native tool schemas and permission behavior. Update the README when behavior changes.

The root package, companion manifest, plugin manifest, marketplace entry, and fixture extension share the project version. `npm run check` rejects mismatches. The MCP server reads its version from the plugin manifest. Maintain a nonempty `## <version>` section in `CHANGELOG.md`. `node scripts/release-notes.cjs` extracts that section into the ignored `dist/` directory; validation and release creation do not depend on local notes.

## Test pipeline

The **Tests** workflow runs on pushes to `main`, version tags, pull requests, and manual dispatch. It uses Linux and macOS with Node.js 20 and 24. Version/syntax checks, tests, packaging, and artifact verification appear as separate steps. The repository check rejects tracked files under `docs/`, `dist/`, or `extension/docs/`. Portable packages are retained as CI artifacts, not committed to Git.

## Release sequence

1. Review the local changes, update the changelog, and run `npm run verify`. Run the extension-host suite for editor-facing changes.
2. Commit the reviewed source and create an annotated version tag, for example `git tag -a v0.0.1 -m "VS Control 0.0.1"`.
3. When ready to upload, push `main` and that tag, then wait for the test pipeline to pass.
4. Manually run **Draft release** with the existing tag. It verifies the tagged source and packages the VSIX, portable plugin ZIP, and checksums. Release text comes from the tagged changelog.
5. Review and publish the draft explicitly in GitHub.

Building never creates a tag or uploads files. A push does not automatically create or publish a release. Keep machine-specific plugin variants local.
