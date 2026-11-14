---
description: Diagnose the VS Control connection and available native VS Code tools
---

Call `vscode_connection`, then `vscode_windows` if needed. If connected, call `vscode_capabilities` and `vscode_tools` with `includeSchemas: false`. Report the selected workspace, VS Code version, available browser/testing tools and any concrete missing prerequisite. Do not change settings, install anything, invoke browser interactions, or run tests as part of this diagnostic command.
