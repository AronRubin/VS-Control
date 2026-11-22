# Changelog

## 0.0.4 — 2026-11-22 (AronRubin fork preview)

- Flatten Prompt-TSX tool results to text, so the GitHub Copilot Chat tools return readable results (morzan1001/VS-Control#5).
- Match the `notebook` and `code` groups to the current `copilot_*` tool IDs (morzan1001/VS-Control#6).
- `vscode_debug`: set and remove breakpoints, and read the stack, variables and expressions of a paused session (morzan1001/VS-Control#7).
- `vscode_symbols`: hover, code actions (listed, not applied), callers and callees, type definition, implementation and workspace symbols (morzan1001/VS-Control#8).

## 0.0.3 — 2026-11-22 (AronRubin fork preview)

- Add **VS Control: Pick Element for Claude**: a hover overlay on the active shared browser page, a title-bar button and <kbd>Ctrl+Alt+C</kbd>. The pick is written to `.vs-control/picks/` and added to the Claude Code prompt through `claude-vscode.addToChat` when available.
- Add the `vscode_picked_element` tool and report picker readiness in `vscode_capabilities` and `/vs-control:doctor`.

## 0.0.2 — 2026-11-14

- Use Marketplace publisher `morzan1001` for the companion extension.
- Publish verified GitHub release packages to the VS Code Marketplace through Trusted Publishing.
- Update installation instructions for the Marketplace and keep VSIX downloads available.

## 0.0.1 — 2026-11-14

- Connect Claude Code to VS Code through a local authenticated MCP bridge.
- Forward native browser and test tools, including screenshots and test failures.
- Expose editor context, diagnostics, navigation, tasks, and debug configuration helpers.
- Recommend relevant IDE tools through a skill and SessionStart hook.
- Support workspace discovery, explicit window selection, cancellation, and timeouts.
- Provide portable VSIX and plugin packages.
