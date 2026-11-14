#!/usr/bin/env python3
"""Verify portable release archives and start the extracted MCP server."""
import hashlib
import json
import os
import posixpath
import re
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / "package.json").read_text())["version"]
OUT = ROOT / "dist"
VSIX = OUT / f"vs-control-bridge-{VERSION}.vsix"
PLUGIN = OUT / f"vs-control-plugin-{VERSION}.zip"


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def inspect_archive(file, required):
    with zipfile.ZipFile(file) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)), "Duplicate archive entries"
        assert required <= set(names), f"Missing files: {required - set(names)}"
        assert archive.testzip() is None, "Corrupt ZIP entry"
        for name in names:
            parts = PurePosixPath(name).parts
            assert not name.startswith("/") and ".." not in parts, name
            assert not any(p in {".git", "node_modules", "local-marketplace", "__pycache__", ".DS_Store", "test", "docs", "dist"} or p.startswith(".env") for p in parts), name
            assert archive.getinfo(name).date_time == (1980, 1, 1, 0, 0, 0), name
            text = archive.read(name).decode("utf-8")
            assert "/Users/" not in text, name
            if name.endswith('.md'):
                for link in re.findall(r'\]\(([^)]+)\)', text):
                    target = link.split('#')[0]
                    if target and '://' not in target:
                        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), target))
                        assert resolved in names, f"Broken packaged documentation link: {name} -> {link}"
        return {name: archive.read(name) for name in names}


vsix = inspect_archive(VSIX, {
    "extension.vsixmanifest", "[Content_Types].xml", "extension/package.json",
    "extension/src/extension.cjs", "extension/lib/state.cjs", "extension/README.md", "extension/LICENSE",
})
assert json.loads(vsix["extension/package.json"])["version"] == VERSION
manifest = ET.fromstring(vsix["extension.vsixmanifest"])
identity = manifest.find("{*}Metadata/{*}Identity")
assert identity is not None and identity.attrib["Version"] == VERSION
ET.fromstring(vsix["[Content_Types].xml"])

plugin = inspect_archive(PLUGIN, {
    ".claude-plugin/marketplace.json", "plugin/.claude-plugin/plugin.json", "plugin/.mcp.json",
    "plugin/server.cjs", "plugin/lib/client.cjs", "plugin/lib/state.cjs", "plugin/hooks/hooks.json",
    "plugin/skills/using-vscode/SKILL.md", "README.md", "LICENSE", "CHANGELOG.md",
})
assert json.loads(plugin["plugin/.claude-plugin/plugin.json"])["version"] == VERSION
assert json.loads(plugin[".claude-plugin/marketplace.json"])["plugins"][0]["version"] == VERSION
assert json.loads(plugin["plugin/.mcp.json"])["mcpServers"]["vs-control"]["command"] == "node"
checksums = (OUT / f"SHA256SUMS-{VERSION}.txt").read_text().splitlines()
assert checksums == [f"{digest(file)}  {file.name}" for file in [VSIX, PLUGIN]]

# A rebuild must have identical bytes, including metadata and timestamps.
before = {file: digest(file) for file in [VSIX, PLUGIN]}
subprocess.run([sys.executable, str(ROOT / "scripts/package.py")], check=True, capture_output=True, text=True)
assert before == {file: digest(file) for file in [VSIX, PLUGIN]}, "Package rebuild is not reproducible"

with tempfile.TemporaryDirectory(prefix="vs-control-portable-") as directory:
    with zipfile.ZipFile(PLUGIN) as archive:
        archive.extractall(directory)
    server = Path(directory) / "plugin/server.cjs"
    message = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "package-verifier", "version": VERSION}
    }}
    result = subprocess.run([os.environ.get("VS_CONTROL_NODE", "node"), str(server)],
                            input=json.dumps(message) + "\n", text=True, capture_output=True,
                            cwd=directory, timeout=10, check=True)
    reply = json.loads(result.stdout)
    assert reply["id"] == 1 and reply["result"]["serverInfo"]["version"] == VERSION, reply
print(f"Verified VS Control {VERSION}: archive contents, manifests, checksums, reproducible build, and extracted MCP startup.")
