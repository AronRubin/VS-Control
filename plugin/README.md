# VS Control for Claude Code

This plugin connects Claude Code, including its VS Code panel, to the separately installed **VS Control — Claude Code Bridge** extension. It exposes native browser and testing tools, editor diagnostics, code navigation, tasks, and debug configurations over MCP. It requires Node.js 20 or later on PATH and an open, trusted VS Code workspace.

Add the repository as a marketplace and install the plugin:

```text
/plugin marketplace add morzan1001/VS-Control
/plugin install vs-control@vs-control
```

For local development before uploading the repository, add its absolute local path instead.

After installing both components, start a new Claude conversation and run `/vs-control:doctor`. The `vs-control:using-vscode` skill and SessionStart hook recommend available IDE tools for relevant tasks. They do not automatically approve actions. Missing native capabilities are reported explicitly.

The repository README contains installation instructions, limitations, and the macOS option for using VS Code's bundled runtime. The companion extension must be running for this plugin to access VS Code.
