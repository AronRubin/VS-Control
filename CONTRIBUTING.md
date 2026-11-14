# Contributing

Requires **Node.js 20+** and **Python 3**. No npm dependencies need to be installed. Keep documentation and user-facing text in English.

## Development

Run the checks before submitting changes:

```sh
npm run verify
```

This checks syntax and versions, runs tests, and verifies package contents, checksums, reproducibility, and MCP startup.

For changes affecting VS Code integration, also run:

```sh
npm run test:integration
```

This requires VS Code Desktop and uses a temporary profile. Set `VSCODE_EXECUTABLE` if needed. GitHub Actions covers tests and packaging on Linux and macOS with Node.js 20 and 24; the interactive suite runs locally.

## Changes

- Keep changes focused and describe how you verified them.
- Preserve native tool schemas and permission behavior.
- Update the relevant README when behavior or setup changes.
- Edit source files and keep generated artifacts out of Git.
- Keep project versions aligned; `npm run check` catches mismatches. Maintain a nonempty `## <version>` section in `CHANGELOG.md`.

## Releases

1. Update the changelog, run the checks, and commit the reviewed changes.
2. Create an annotated tag matching the package version, for example `git tag -a 0.0.1 -m "Release 0.0.1"`. Use no `v` prefix.
3. Push the branch and tag when ready, then wait for CI to pass.
4. Manually run **Draft release** with the tag. It builds the VSIX, plugin ZIP, and checksums using release notes from the changelog.
5. Review and publish the draft in GitHub.

Releases are published manually; pushing a tag only triggers checks.
