'use strict';
const vscode = require('vscode');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=';
exports.activate = context => {
  context.subscriptions.push(
    vscode.lm.registerTool('vscontrol_fixture_echo', { invoke: options => new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(options.input.value)]) }),
    vscode.lm.registerTool('vscontrol_fixture_image', { invoke: () => new vscode.LanguageModelToolResult([vscode.LanguageModelDataPart.image(Buffer.from(PNG, 'base64'), 'image/png')]) }),
    vscode.lm.registerTool('vscontrol_fixture_error', { invoke: () => { throw new Error('fixture intentional failure'); } })
  );
};
