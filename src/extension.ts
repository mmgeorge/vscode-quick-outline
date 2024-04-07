import { commands, window, type ExtensionContext, type TextEditor, type SymbolInformation, type QuickPickItem, SymbolKind, workspace } from "vscode";
import { QuickOutline } from "./QuickOutline";

export const selectionStyle = window.createTextEditorDecorationType({
  border: "solid",
  borderWidth: "medium",
  borderColor: "red"
});

let quickOutline: QuickOutline | null = null;
let quickOutlineForTextSearch: QuickOutline | null = null; 

export function activate(context: ExtensionContext) {
  let cmds = [
    commands.registerCommand('quick-outline.showOutline', showOutline),
    commands.registerCommand('quick-outline.searchTextInFile', searchTextInFile),
    commands.registerCommand('quick-outline.expand', () => quickOutline?.setActiveItemExpandEnabled(true)),
    commands.registerCommand('quick-outline.collapse', () => quickOutline?.setActiveItemExpandEnabled(false)),
    commands.registerCommand('quick-outline.expandAll', () => quickOutline?.setAllExpandEnabled(true)),
    commands.registerCommand('quick-outline.collapseAll', () => quickOutline?.setAllExpandEnabled(false)),
    commands.registerCommand('quick-outline.showAllFunctionMethod', () => quickOutline?.showAll([SymbolKind.Function, SymbolKind.Method])),
  ];

  console.log(window.tabGroups.all);
}

export function deactivate() {
  quickOutline?.dispose();
  quickOutlineForTextSearch?.dispose();
}


async function showOutline() {
  const document = window.activeTextEditor?.document;

  if (!document) {
    return;
  }

  const symbols = await commands.executeCommand<SymbolInformation[]>("vscode.executeDocumentSymbolProvider", document.uri);

  quickOutline = new QuickOutline(symbols, "symbol");
}

async function searchTextInFile() {
  const document = window.activeTextEditor?.document;

  if (!document) {
    return;
  }

  const symbols = await commands.executeCommand<SymbolInformation[]>("vscode.executeDocumentSymbolProvider", document.uri);

  quickOutlineForTextSearch = new QuickOutline(symbols, "text");
}

