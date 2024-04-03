import { commands, window, type ExtensionContext, type TextEditor, type SymbolInformation, type QuickPickItem } from "vscode";
import { QuickOutline } from "./QuickOutline";

export const selectionStyle = window.createTextEditorDecorationType({
  border: "solid",
  borderWidth: "medium",
  borderColor: "red"
});

let quickOutline: QuickOutline | null = null;

export function activate(context: ExtensionContext) {
  let cmds = [
    commands.registerCommand('quick-outline.showOutline', showOutline)
  ];

  context.subscriptions.push(...cmds);
}

export function deactivate() {
  quickOutline?.destroy();
}


async function showOutline() {
  const document = window.activeTextEditor?.document;

  if (!document) {
    return;
  }

  const symbols = await commands.executeCommand<SymbolInformation[]>("vscode.executeDocumentSymbolProvider", document.uri);

  quickOutline = new QuickOutline(symbols);
}

