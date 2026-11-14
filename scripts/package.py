#!/usr/bin/env python3
"""Create a VSIX and a self-contained Claude marketplace without npm dependencies."""
import hashlib
import json
import stat
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist"
OUT.mkdir(exist_ok=True)
manifest = json.loads((ROOT / "extension/package.json").read_text())
version = manifest["version"]
for relative in ["package.json", "plugin/.claude-plugin/plugin.json", "test/fixture-extension/package.json"]:
    if json.loads((ROOT / relative).read_text())["version"] != version:
        raise SystemExit(f"Version mismatch: {relative}")
marketplace = json.loads((ROOT / ".claude-plugin/marketplace.json").read_text())
if marketplace["plugins"][0]["version"] != version:
    raise SystemExit("Marketplace version does not match the extension")
if not (ROOT / "extension/lib/state.cjs").exists():
    raise SystemExit("Run node scripts/build.cjs first")
vsix_manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
 <Metadata><Identity Language="en-US" Id="{manifest['name']}" Version="{version}" Publisher="{manifest['publisher']}"/>
 <DisplayName>{escape(manifest['displayName'])}</DisplayName><Description xml:space="preserve">{escape(manifest['description'])}</Description>
 <Tags>claude,mcp,browser,testing</Tags><Categories>Other,Testing</Categories><GalleryFlags>Public</GalleryFlags>
 <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="{manifest['engines']['vscode']}"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/></Properties>
 <License>extension/LICENSE</License></Metadata>
 <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
 <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/></Assets>
</PackageManifest>'''
content_types = '''<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Default Extension="txt" ContentType="text/plain"/><Override PartName="/extension/LICENSE" ContentType="text/plain"/></Types>'''
def source_file(relative):
    file = ROOT / relative
    if file.is_symlink() or not file.is_file():
        raise SystemExit(f"Expected a regular source file: {relative}")
    return file.read_bytes()


def source_tree(relative, suffix):
    folder = ROOT / relative
    if folder.is_symlink():
        raise SystemExit(f"Source directory must not be a symlink: {relative}")
    result = {}
    for file in sorted(folder.rglob("*")):
        if file.is_symlink():
            raise SystemExit(f"Source tree contains a symlink: {file.relative_to(ROOT)}")
        if file.is_file() and file.suffix == suffix:
            name = file.relative_to(ROOT).as_posix()
            result[name] = source_file(name)
    return result


def write_archive(file, entries):
    # Stored entries avoid zlib-version differences. Fixed timestamps and modes
    # make archives byte-identical regardless of checkout time or host OS.
    with zipfile.ZipFile(file, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, data)


vsix = OUT / f"vs-control-bridge-{version}.vsix"
vsix_entries = {
    "extension.vsixmanifest": vsix_manifest.encode(),
    "[Content_Types].xml": content_types.encode(),
    **{name: source_file(name) for name in ["extension/package.json", "extension/README.md", "extension/LICENSE", "extension/CHANGELOG.md", "extension/lib/state.cjs"]},
    **source_tree("extension/src", ".cjs"),
}
write_archive(vsix, vsix_entries)
plugin_zip = OUT / f"vs-control-plugin-{version}.zip"
plugin_entries = {
    **{name: source_file(name) for name in [
        ".claude-plugin/marketplace.json", "plugin/.claude-plugin/plugin.json", "plugin/.mcp.json",
        "plugin/hooks/hooks.json", "plugin/server.cjs", "plugin/README.md", "README.md", "LICENSE", "CHANGELOG.md", "CONTRIBUTING.md"
    ]},
    **source_tree("plugin/lib", ".cjs"),
    **source_tree("plugin/scripts", ".cjs"),
    **source_tree("plugin/skills", ".md"),
    **source_tree("plugin/commands", ".md"),
}
write_archive(plugin_zip, plugin_entries)
checksums = OUT / f"SHA256SUMS-{version}.txt"
checksums.write_text("".join(f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}\n" for file in [vsix, plugin_zip]), encoding="utf-8")
for file in [vsix, plugin_zip, checksums]:
    print(file)
