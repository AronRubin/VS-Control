'use strict';
// Context only. No auto-approval, background tool execution, or user settings edits.
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: 'VS Control is available for this session. For work involving the current VS Code editor, tests, diagnostics, debugging, or web UI verification, first inspect vscode_capabilities (or vscode_connection if it is missing). Prefer the integrated browser tools for UI verification and native runTests/testFailure for tests when available. Use vscode_tools to discover exact schemas; never guess tool IDs or page IDs. Read the vs-control:using-vscode skill for the workflow. Follow user intent and existing permissions. A dispatched command, started task, or unavailable tool is not evidence that tests passed. If unavailable, explain the specific limitation and use an appropriate existing fallback; do not repeatedly probe or silently claim IDE verification. Do not use the bridge for unrelated tasks.'
  }
}) + '\n');
